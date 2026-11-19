/**
 * Every /api route of the knowledge base needs a JWT, and the caller must belong to the company of the data.
 * Controllers are stubbed: these tests check the guards in front of them, through the real route files.
 */
const ok = (req, res) => res.status(200).json({ ok: true });
const stub = () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? false : ok) });
jest.mock('../controllers/documentController', () => stub());
jest.mock('../controllers/analysisController', () => stub());
jest.mock('../controllers/callRecordingController', () => stub());
jest.mock('../controllers/companyController', () => stub());
jest.mock('../controllers/ragController', () => stub());
jest.mock('../controllers/scriptController', () => stub());
jest.mock('../controllers/knowledgeInsightsController', () => stub());
jest.mock('../controllers/fineTuningController', () => stub());

process.env.JWT_SECRET = 'test-secret';
process.env.REGISTRATION_BACKEND_URL = 'https://registration.test';
delete process.env.COMPANY_SCOPE_MODE;

const express = require('express');
const jwt = require('jsonwebtoken');
const { mountApi } = require('../routes/mountApi');
const { lookups, clearGuardCache } = require('../middleware/routeGuards');
const { clearCompanyCache } = require('../middleware/companyScope');

const COMPANY_A = '64b0000000000000000000a1';
const COMPANY_B = '64b0000000000000000000b2';
const OWNER_A = '64b0000000000000000000c1';
const OWNER_B = '64b0000000000000000000c2';
const GIG_A = '64b0000000000000000000d1';
const GIG_B = '64b0000000000000000000d2';
const DOC_A = '64b0000000000000000000e1';
const DOC_B = '64b0000000000000000000e2';
const REC_B = '64b0000000000000000000f2';
const SCRIPT_B = '64b000000000000000000012';

const userToken = (userId, extra = {}) => `Bearer ${jwt.sign({ userId, ...extra }, 'test-secret')}`;
const serviceToken = (scope) => `Bearer ${jwt.sign({ scope }, 'test-secret', { expiresIn: '2m' })}`;
const asA = userToken(OWNER_A, { typeUser: 'company' });

let server;
let base;
const realFetch = global.fetch;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));
  mountApi(app);
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;

  Object.assign(lookups, {
    companyOfUser: async (id) => ({ [OWNER_A]: COMPANY_A, [OWNER_B]: COMPANY_B }[id] || null),
    companyOfDocument: async (id) => ({ [DOC_A]: COMPANY_A, [DOC_B]: COMPANY_B }[id] || null),
    companyOfRecording: async (id) => ({ [REC_B]: COMPANY_B }[id] || null),
    gigOfScript: async (id) => ({ [SCRIPT_B]: GIG_B }[id] || null),
    gigCompanyId: async (id) => ({ [GIG_A]: COMPANY_A, [GIG_B]: COMPANY_B }[id] || null),
  });
});

afterAll(async () => {
  global.fetch = realFetch;
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  clearCompanyCache();
  clearGuardCache();
  // The registration service says which company the signed-in user belongs to. Local calls go to the test server.
  global.fetch = jest.fn(async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://registration.test/api/company-members/me')) {
      const userId = new URL(u).searchParams.get('userId');
      const companyId = { [OWNER_A]: COMPANY_A, [OWNER_B]: COMPANY_B }[userId] || null;
      return { ok: true, json: async () => ({ success: true, data: { companyId } }) };
    }
    return realFetch(url, init);
  });
});

// test.each passes `done` as an extra argument when a row is shorter than the test function: pad every row.
const rows = (list) => list.map(([method, path, body]) => [method, path, body || null]);

async function call(method, path, { auth, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = auth;
  const res = await realFetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return res.status;
}

// Every /api route of the service (method, path, body of a request on company B's data).
const ROUTES = [
  ['POST', '/api/documents/sector-knowledge', { userId: OWNER_B, gigId: GIG_B }],
  ['GET', `/api/documents?userId=${OWNER_B}`],
  ['GET', `/api/documents/gig/${GIG_B}`],
  ['GET', `/api/documents/${DOC_B}`],
  ['GET', `/api/documents/${DOC_B}/analysis`],
  ['DELETE', `/api/documents/${DOC_B}`],
  ['PUT', `/api/documents/${DOC_B}`, { name: 'x' }],
  ['POST', '/api/analysis/start', { companyId: COMPANY_B }],
  ['POST', '/api/analysis/ask', { userId: OWNER_B, query: 'q' }],
  ['GET', `/api/analysis/${COMPANY_B}`],
  ['GET', `/api/analysis/${COMPANY_B}/all`],
  ['GET', `/api/call-recordings?userId=${OWNER_B}`],
  ['DELETE', `/api/call-recordings/${REC_B}`],
  ['POST', `/api/call-recordings/${REC_B}/analyze/summary`],
  ['POST', `/api/call-recordings/${REC_B}/analyze/transcription`],
  ['POST', `/api/call-recordings/${REC_B}/analyze/scoring`],
  ['POST', '/api/rag/corpus/initialize', { companyId: COMPANY_B }],
  ['POST', '/api/rag/corpus/sync', { companyId: COMPANY_B }],
  ['POST', '/api/rag/query', { companyId: COMPANY_B, query: 'q' }],
  ['GET', `/api/rag/readiness?userId=${OWNER_B}`],
  ['POST', '/api/rag/score', { userId: OWNER_B }],
  ['POST', '/api/rag/reindex', { userId: OWNER_B }],
  ['POST', `/api/rag/analyze/${DOC_B}`],
  ['GET', `/api/rag/corpus/${COMPANY_B}/status`],
  ['GET', `/api/rag/corpus/${COMPANY_B}/documents`],
  ['GET', `/api/rag/corpus/${COMPANY_B}/documents/${DOC_B}`],
  ['GET', `/api/rag/corpus/${COMPANY_B}/stats`],
  ['GET', `/api/rag/corpus/${COMPANY_B}/search?searchTerm=x`],
  ['POST', '/api/rag/generate-script', { companyId: COMPANY_B, gig: { _id: GIG_B } }],
  ['POST', '/api/rag/scripts', { gigId: GIG_B }],
  ['PUT', `/api/rag/scripts/${SCRIPT_B}`, { gigId: GIG_B }],
  ['GET', `/api/rag/scripts?gigId=${GIG_B}`],
  ['PUT', `/api/rag/scripts/${SCRIPT_B}/status`, { isActive: true }],
  ['DELETE', `/api/rag/scripts/${SCRIPT_B}`],
  ['GET', `/api/scripts/gig/${GIG_B}`],
  ['GET', `/api/scripts/company/${COMPANY_B}`],
  ['PUT', `/api/scripts/${SCRIPT_B}/status`, { isActive: true }],
  ['POST', `/api/scripts/${SCRIPT_B}/regenerate`],
  ['POST', `/api/scripts/${SCRIPT_B}/refine`, { stepIndex: 0, refinementPrompt: 'x' }],
  ['PUT', `/api/scripts/${SCRIPT_B}/content`, { stepIndex: 0, newContent: 'x' }],
  ['POST', `/api/scripts/${SCRIPT_B}/replicas`, { phase: 'p', actor: 'agent' }],
  ['DELETE', `/api/scripts/${SCRIPT_B}/replicas/0`],
  ['DELETE', `/api/scripts/${SCRIPT_B}`],
];
const NO_COMPANY_ROUTES = [
  ['POST', '/api/rag/translate-analysis', { analysis: {}, targetLanguage: 'en' }],
  ['POST', '/api/rag/agent-search', { companyId: COMPANY_B, query: 'q' }],
  ['POST', '/api/companies/add', { name: 'x' }],
  ['GET', '/api/fine-tuning/jobs'],
  ['POST', '/api/fine-tuning/test', {}],
];

describe('public routes', () => {
  test('/health answers without a token', async () => {
    expect(await call('GET', '/health')).toBe(200);
  });
});

describe('401 without a valid token', () => {
  test.each(rows([...ROUTES, ...NO_COMPANY_ROUTES]))('%s %s', async (method, path, body) => {
    expect(await call(method, path, { body })).toBe(401);
  });

  test('a token signed with another secret is refused', async () => {
    const forged = `Bearer ${jwt.sign({ userId: OWNER_B }, 'your-secret-key')}`;
    expect(await call('GET', `/api/analysis/${COMPANY_B}`, { auth: forged })).toBe(401);
  });

  test('without JWT_SECRET every protected request is refused', async () => {
    const saved = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      expect(await call('GET', `/api/analysis/${COMPANY_A}`, { auth: asA })).toBe(500);
    } finally {
      process.env.JWT_SECRET = saved;
    }
  });
});

describe('403 for a user of another company', () => {
  test.each(rows(ROUTES))('%s %s', async (method, path, body) => {
    expect(await call(method, path, { auth: asA, body })).toBe(403);
  });
});

describe('the company of the data passes', () => {
  test.each(rows([
    ['GET', `/api/analysis/${COMPANY_A}`],
    ['GET', `/api/documents?userId=${OWNER_A}`],
    ['GET', `/api/documents/${DOC_A}`],
    ['POST', '/api/rag/query', { companyId: COMPANY_A, gigId: GIG_A, query: 'q' }],
    ['GET', `/api/scripts/gig/${GIG_A}`],
    ['POST', '/api/rag/scripts', { gigId: GIG_A }],
    ['POST', '/api/rag/translate-analysis', { analysis: {}, targetLanguage: 'en' }],
  ]))('%s %s', async (method, path, body) => {
    expect(await call(method, path, { auth: asA, body })).toBe(200);
  });

  test('a script cannot be moved to a gig of another company', async () => {
    expect(await call('POST', '/api/rag/scripts', { auth: asA, body: { gigId: GIG_B } })).toBe(403);
  });

  test('a gig whose company is unknown is refused', async () => {
    expect(await call('GET', '/api/scripts/gig/64b0000000000000000000ff', { auth: asA })).toBe(403);
  });
});

describe('REPs read the scripts and documents of a gig, nothing else', () => {
  const rep = userToken('64b000000000000000000099', { typeUser: 'rep' });
  test.each([
    ['GET', `/api/scripts/gig/${GIG_B}`],
    ['GET', `/api/rag/scripts?gigId=${GIG_B}`],
    ['GET', `/api/documents/gig/${GIG_B}`],
  ])('%s %s allowed', async (method, path) => {
    expect(await call(method, path, { auth: rep })).toBe(200);
  });
  test.each([
    ['DELETE', `/api/rag/scripts/${SCRIPT_B}`],
    ['GET', `/api/documents/${DOC_B}`],
    ['GET', `/api/analysis/${COMPANY_B}`],
  ])('%s %s refused', async (method, path) => {
    expect(await call(method, path, { auth: rep })).toBe(403);
  });
});

describe('service tokens (other HARX backends)', () => {
  test.each(rows([
    ['GET', `/api/scripts/gig/${GIG_B}`],
    ['GET', `/api/rag/scripts?gigId=${GIG_B}`],
    ['POST', '/api/rag/query', { companyId: COMPANY_B, query: 'q' }],
    ['GET', `/api/documents?userId=${OWNER_B}&gigId=${GIG_B}`],
  ]))('kb-read: %s %s', async (method, path, body) => {
    expect(await call(method, path, { auth: serviceToken('kb-read'), body })).toBe(200);
  });

  test('kb-agent-search still reaches the agent search', async () => {
    expect(await call('POST', '/api/rag/agent-search', { auth: serviceToken('kb-agent-search'), body: { companyId: COMPANY_B, query: 'q' } })).toBe(200);
  });

  test('a service scope is refused outside its routes', async () => {
    expect(await call('DELETE', `/api/rag/scripts/${SCRIPT_B}`, { auth: serviceToken('kb-read') })).toBe(403);
    expect(await call('POST', '/api/rag/agent-search', { auth: serviceToken('kb-read'), body: { companyId: COMPANY_B, query: 'q' } })).toBe(401);
  });

  test('an unknown scope is refused', async () => {
    expect(await call('GET', `/api/scripts/gig/${GIG_B}`, { auth: serviceToken('anything') })).toBe(401);
  });
});

describe('administrator routes', () => {
  test('fine-tuning and company creation are for administrators only', async () => {
    expect(await call('GET', '/api/fine-tuning/jobs', { auth: asA })).toBe(403);
    expect(await call('POST', '/api/companies/add', { auth: asA, body: { name: 'x' } })).toBe(403);
    const admin = userToken('64b000000000000000000077', { typeUser: 'admin' });
    expect(await call('GET', '/api/fine-tuning/jobs', { auth: admin })).toBe(200);
    expect(await call('POST', '/api/companies/add', { auth: admin, body: { name: 'x' } })).toBe(200);
  });
});
