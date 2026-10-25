const assert = require('node:assert/strict');
const crypto = require('crypto');
const { assertCompanyHasAiTokens, signServiceToken } = require('../utils/aiTokenBilling');

(async () => {
  process.env.JWT_SECRET = 'secret-de-test';
  process.env.COMPORCHESTRATOR_API_URL = 'http://orch.test/api';

  // Le jeton de service est un JWT HS256 valide, court, signé avec le secret commun
  const token = signServiceToken('secret-de-test', { service: 'knowledgebase', companyId: 'c1' });
  const [h, p, sig] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'HS256');
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.companyId, 'c1');
  assert.ok(payload.exp - payload.iat <= 60);
  const expected = crypto.createHmac('sha256', 'secret-de-test').update(`${h}.${p}`).digest('base64url');
  assert.equal(sig, expected);

  const calls = [];
  const reply = (status, body) => async (url, init) => { calls.push({ url, auth: init?.headers?.Authorization }); return { ok: status < 400, status, json: async () => body }; };
  const opts = { skipIfFirstGig: false };

  // Solde suffisant : la requête part avec le jeton de service
  global.fetch = reply(200, { success: true, data: { tokens: 200000 } });
  assert.deepEqual(await assertCompanyHasAiTokens('c1', 1, opts), { ok: true, tokens: 200000 });
  assert.match(calls[0].auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(calls[0].url, /tokens-company\/c1\/check\?min=1$/);

  // 402 : solde réellement insuffisant
  global.fetch = reply(402, { success: false, data: { tokens: 0 }, message: 'Solde de tokens AI insuffisant. Rechargez pour continuer.' });
  const low = await assertCompanyHasAiTokens('c1', 1, opts);
  assert.equal(low.ok, false);
  assert.match(low.message, /insuffisant/);

  // 401 / 500 : ce n'est PAS un solde insuffisant (cause du faux « insuffisant » sur la recette) : la requête passe
  global.fetch = reply(401, { error: 'Authentication required' });
  assert.equal((await assertCompanyHasAiTokens('c1', 1, opts)).ok, true);
  global.fetch = reply(500, {});
  assert.equal((await assertCompanyHasAiTokens('c1', 1, opts)).ok, true);

  console.log('aiTokenBilling.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
