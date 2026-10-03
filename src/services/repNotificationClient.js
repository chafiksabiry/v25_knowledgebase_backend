const axios = require('axios');

const DASH_REP_API = String(
  process.env.DASH_REP_API_URL ||
    process.env.REP_DASH_API_URL ||
    'https://v25dashrepback-production.up.railway.app/api'
).replace(/\/$/, '');

const MATCHING_API = String(
  process.env.MATCHING_API_URL ||
    process.env.VITE_MATCHING_API_URL ||
    'https://v25matchingbackend-production.up.railway.app/api'
).replace(/\/$/, '');

function resolveId(value) {
  if (value == null) return '';
  if (typeof value === 'object') {
    if (value._id) return resolveId(value._id);
    if (value.$oid) return String(value.$oid);
    if (value.id) return String(value.id);
  }
  return String(value).trim();
}

async function persistActivityNotification(input) {
  const repId = resolveId(input.repId);
  const notificationKey = String(input.notificationKey || '').trim();
  const kind = String(input.kind || 'general').trim();
  if (!repId || !notificationKey || !kind) return null;

  const gigId = resolveId(input.gigId);
  try {
    const res = await axios.post(
      `${DASH_REP_API}/notifications/upsert`,
      {
        notificationKey,
        kind,
        status: input.status || kind,
        title: String(input.title || '').trim(),
        message: String(input.message || '').trim(),
        ...(gigId ? { gigId } : {}),
        ...(input.actionPath ? { actionPath: String(input.actionPath) } : {}),
        read: false,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-agent-id': repId,
        },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) {
      console.error('[KB RepNotif] upsert failed', kind, res.status);
      return null;
    }
    return res.data?.data || res.data || null;
  } catch (err) {
    console.error('[KB RepNotif] upsert error', err?.message || err);
    return null;
  }
}

async function listEnrolledRepIds(gigId) {
  const gId = resolveId(gigId);
  if (!gId) return [];
  try {
    const res = await axios.get(`${MATCHING_API}/gig-agents/gig/${encodeURIComponent(gId)}`, {
      timeout: 8000,
      validateStatus: () => true,
    });
    if (res.status >= 400) {
      // fallback enrollment endpoint
      const res2 = await axios.get(
        `${MATCHING_API}/enrollment/gig/${encodeURIComponent(gId)}`,
        { timeout: 8000, validateStatus: () => true, params: { status: 'enrolled' } }
      );
      const rows = Array.isArray(res2.data) ? res2.data : res2.data?.data || [];
      return rows
        .filter((r) => {
          const s = String(r?.enrollmentStatus || r?.status || '').toLowerCase();
          return !s || ['enrolled', 'accepted', 'active', 'approved'].includes(s);
        })
        .map((r) => resolveId(r?.agentId?._id || r?.agentId))
        .filter(Boolean);
    }
    const rows = Array.isArray(res.data) ? res.data : res.data?.data || res.data?.agents || [];
    return rows
      .filter((r) => {
        const s = String(r?.enrollmentStatus || r?.status || '').toLowerCase();
        return !s || ['enrolled', 'accepted', 'active', 'approved'].includes(s);
      })
      .map((r) => resolveId(r?.agentId?._id || r?.agentId))
      .filter(Boolean);
  } catch (err) {
    console.error('[KB RepNotif] list enrolled failed', err?.message || err);
    return [];
  }
}

async function notifyGigReps({ gigId, kind, notificationKey, title, message, actionPath, status }) {
  const gId = resolveId(gigId);
  if (!gId) return;
  const reps = await listEnrolledRepIds(gId);
  await Promise.allSettled(
    reps.map((repId) =>
      persistActivityNotification({
        repId,
        kind,
        status: status || kind,
        notificationKey,
        gigId: gId,
        title,
        message,
        actionPath: actionPath || `/workspace?gigId=${encodeURIComponent(gId)}`,
      })
    )
  );
}

async function notifyKbDocumentAdded({ gigId, documentId, documentName }) {
  const gId = resolveId(gigId);
  const docId = resolveId(documentId);
  if (!gId || !docId) return;
  const name = String(documentName || 'Document');
  await notifyGigReps({
    gigId: gId,
    kind: 'kb_document',
    status: 'kb_document',
    notificationKey: `kb:${docId}`,
    title: 'Nouveau document KB',
    message: `« ${name} » a été ajouté à la base de connaissances.`,
    actionPath: `/workspace?gigId=${encodeURIComponent(gId)}&tab=kb`,
  });
}

async function notifyScriptAdded({ gigId, scriptId }) {
  const gId = resolveId(gigId);
  const sId = resolveId(scriptId);
  if (!gId || !sId) return;
  await notifyGigReps({
    gigId: gId,
    kind: 'script_added',
    status: 'script_added',
    notificationKey: `script:${sId}`,
    title: 'Nouveau script',
    message: 'Un nouveau script a été ajouté sur votre GIG.',
    actionPath: `/workspace?gigId=${encodeURIComponent(gId)}&tab=scripts`,
  });
}

async function notifyScriptDeactivated({ gigId, scriptId }) {
  const gId = resolveId(gigId);
  const sId = resolveId(scriptId);
  if (!gId || !sId) return;
  await notifyGigReps({
    gigId: gId,
    kind: 'deactivated',
    status: 'deactivated',
    notificationKey: `deact:script:${sId}`,
    title: 'Script désactivé',
    message: 'Un script n’est plus actif sur votre GIG.',
    actionPath: `/workspace?gigId=${encodeURIComponent(gId)}&tab=scripts`,
  });
}

module.exports = {
  persistActivityNotification,
  listEnrolledRepIds,
  notifyKbDocumentAdded,
  notifyScriptAdded,
  notifyScriptDeactivated,
};
