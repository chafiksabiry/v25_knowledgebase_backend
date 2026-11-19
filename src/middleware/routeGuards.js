const mongoose = require('mongoose');
const { authenticate, assertCompanyAccess, ScopeError } = require('./companyScope');

/**
 * Route guards of the knowledge base: every /api route needs a JWT (see companyScope.authenticate), then each
 * route says which company it touches, and the caller must belong to it.
 *
 * Callers:
 *  - a company user (owner or team member): must belong to the company of the data (assertCompanyAccess);
 *  - a REP (`typeUser: "rep"` in the token): read-only access to the scripts and documents of a gig (`reps: true`);
 *  - an administrator (`typeUser: "admin"`): only on admin routes (fine-tuning, company creation);
 *  - another HARX backend, with a short-lived service token `{ scope }` signed with JWT_SECRET:
 *    only on the routes that list its scope.
 */

/** Scopes of service tokens this service accepts at all. A route must still list the scope. */
const SERVICE_SCOPES = ['kb-agent-search', 'kb-read'];

/** Every /api route: a valid user token, or a service token with a known scope. */
const requireAuth = authenticate({ serviceScopes: SERVICE_SCOPES });

const CACHE_TTL_MS = 60 * 1000;
const gigCompanyCache = new Map();

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));

function idOf(value) {
  if (!value) return null;
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
}

/** Company of a gig: shared database first, then the gigs service (GIGS_API_URL). null when unknown. */
async function gigCompanyId(gigId) {
  const key = String(gigId);
  const cached = gigCompanyCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.companyId;

  let companyId = null;
  try {
    const db = mongoose.connection && mongoose.connection.db;
    if (db && isObjectId(key)) {
      const gig = await db.collection('gigs').findOne(
        { _id: new mongoose.Types.ObjectId(key) },
        { projection: { companyId: 1 } }
      );
      if (gig && gig.companyId) companyId = idOf(gig.companyId);
    }
  } catch (error) {
    // fall back to the gigs service
  }
  if (!companyId && process.env.GIGS_API_URL) {
    try {
      const base = process.env.GIGS_API_URL.replace(/\/+$/, '');
      const res = await fetch(`${base}/gigs/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const payload = await res.json();
        const gig = (payload && (payload.data || payload.gig)) || payload;
        if (gig && gig.companyId) companyId = idOf(gig.companyId);
      }
    } catch (error) {
      // unknown company: the guard refuses
    }
  }
  if (companyId) gigCompanyCache.set(key, { companyId, expires: Date.now() + CACHE_TTL_MS });
  return companyId;
}

/** Overridable in tests. */
const lookups = {
  gigCompanyId,
  async companyOfUser(userId) {
    const Company = require('../models/Company');
    const company = await Company.findOne({ userId }).select('_id').lean();
    return company ? String(company._id) : null;
  },
  async companyOfDocument(id) {
    const Document = require('../models/Document');
    const doc = await Document.findById(id).select('companyId').lean();
    return doc ? idOf(doc.companyId) : null;
  },
  async companyOfRecording(id) {
    const CallRecording = require('../models/CallRecording');
    const rec = await CallRecording.findById(id).select('companyId').lean();
    return rec ? idOf(rec.companyId) : null;
  },
  async gigOfScript(id) {
    const Script = require('../models/Script');
    const script = await Script.findById(id).select('gigId').lean();
    return script ? idOf(script.gigId) : null;
  },
};

/**
 * Where a route finds its company. Each resolver returns:
 *  - a company id: the caller must belong to it;
 *  - NOT_FOUND: the record does not exist (the controller answers 404 / 400 itself, nothing is exposed);
 *  - UNKNOWN: the record exists but its company cannot be established: refused.
 */
const NOT_FOUND = Symbol('not-found');
const UNKNOWN = Symbol('unknown');

const from = {
  param: (name) => async (req) => req.params[name] || NOT_FOUND,
  body: (name) => async (req) => (req.body && req.body[name]) || NOT_FOUND,
  /** `userId` (query or body) of the company owner, as the existing fronts send it. */
  userId: (where) => async (req) => {
    const userId = req[where] && req[where].userId;
    if (!userId) return NOT_FOUND;
    if (!isObjectId(String(userId))) return NOT_FOUND;
    return (await lookups.companyOfUser(String(userId))) || NOT_FOUND;
  },
  document: (name = 'id') => async (req) => {
    const id = req.params[name];
    if (!id || !isObjectId(String(id))) return NOT_FOUND;
    return (await lookups.companyOfDocument(String(id))) || NOT_FOUND;
  },
  recording: (name) => async (req) => {
    const id = req.params[name];
    if (!id || !isObjectId(String(id))) return NOT_FOUND;
    return (await lookups.companyOfRecording(String(id))) || NOT_FOUND;
  },
  gig: (getGigId) => async (req) => {
    const gigId = getGigId(req);
    if (!gigId || !isObjectId(String(gigId))) return NOT_FOUND;
    return (await lookups.gigCompanyId(String(gigId))) || UNKNOWN;
  },
  script: (name = 'scriptId') => async (req) => {
    const id = req.params[name];
    if (!id || !isObjectId(String(id))) return NOT_FOUND;
    const gigId = await lookups.gigOfScript(String(id));
    if (!gigId) return NOT_FOUND;
    return (await lookups.gigCompanyId(gigId)) || UNKNOWN;
  },
};

function fail(req, res, error) {
  // A refused upload must not leave its file behind (multer already wrote it).
  if (req.file && req.file.path) require('fs').unlink(req.file.path, () => undefined);
  const status = error instanceof ScopeError || error.status ? error.status : 500;
  if (status === 500) console.error('[routeGuards] guard failed:', error);
  return res.status(status).json({ error: status === 500 ? 'Authorization check failed' : error.message });
}

/**
 * @param {...Function} resolvers company resolvers (from.*); every resolved company must be the caller's
 * @param {{reps?: boolean, services?: string[]}} [options] reps: REPs may read; services: service scopes accepted
 */
function companyGuard(resolvers, options = {}) {
  const list = Array.isArray(resolvers) ? resolvers : [resolvers];
  const services = options.services || [];
  return async (req, res, next) => {
    try {
      if (!req.auth) throw new ScopeError(401, 'Authentication required');
      if (req.auth.service) {
        if (!services.includes(req.auth.service)) throw new ScopeError(403, 'Service not allowed on this route');
        return next();
      }
      if (options.reps && req.auth.typeUser === 'rep') return next();
      for (const resolve of list) {
        const companyId = await resolve(req);
        if (companyId === NOT_FOUND) continue;
        if (companyId === UNKNOWN) {
          if (String(process.env.COMPANY_SCOPE_MODE || '').toLowerCase() === 'log') {
            console.warn(`[routeGuards] company unknown for ${req.method} ${req.originalUrl}: allowed (log mode)`);
            continue;
          }
          throw new ScopeError(403, 'Not allowed for this company');
        }
        await assertCompanyAccess(req, companyId);
      }
      return next();
    } catch (error) {
      return fail(req, res, error);
    }
  };
}

/** Any signed-in user (no company data involved, e.g. a translation). Service tokens only if listed. */
function userGuard(options = {}) {
  return companyGuard([], options);
}

/** HARX administrators only. */
function adminOnly(req, res, next) {
  if (!req.auth) return res.status(401).json({ error: 'Authentication required' });
  if (req.auth.typeUser !== 'admin') return res.status(403).json({ error: 'Administrator access required' });
  return next();
}

function clearGuardCache() {
  gigCompanyCache.clear();
}

module.exports = {
  SERVICE_SCOPES,
  requireAuth,
  companyGuard,
  userGuard,
  adminOnly,
  from,
  lookups,
  clearGuardCache,
};
