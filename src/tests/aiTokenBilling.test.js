const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  assertCompanyHasAiTokens,
  chargeCompanyAiTokens,
  tokenGateErrorResponse,
  signServiceToken,
} = require('../utils/aiTokenBilling');
const billing = require('../utils/aiTokenBilling');

(async () => {
  process.env.JWT_SECRET = 'secret-de-test';
  process.env.COMPORCHESTRATOR_API_URL = 'http://orch.test/api';
  const realInfo = console.info;
  const realWarn = console.warn;
  console.info = () => {};
  console.warn = () => {};

  // Plus aucune logique « premier gig gratuit »
  assert.equal(billing.isFirstGigForCompany, undefined);

  // Le jeton de service est un JWT HS256 valide, court, signé avec le secret commun
  const token = signServiceToken('secret-de-test', { service: 'knowledgebase', companyId: 'c1' });
  const [h, p, sig] = token.split('.');
  assert.equal(JSON.parse(Buffer.from(h, 'base64url')).alg, 'HS256');
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.companyId, 'c1');
  assert.ok(payload.exp - payload.iat <= 60);
  assert.equal(sig, crypto.createHmac('sha256', 'secret-de-test').update(`${h}.${p}`).digest('base64url'));

  const calls = [];
  const reply = (status, body) => async (url, init) => {
    calls.push({ url, init, auth: init?.headers?.Authorization });
    return { ok: status < 400, status, json: async () => body };
  };

  // Sans entreprise : refus 400, aucun appel réseau
  global.fetch = reply(200, {});
  const noCompany = await assertCompanyHasAiTokens('', 1);
  assert.equal(noCompany.ok, false);
  assert.equal(noCompany.code, 'company_required');
  assert.equal(tokenGateErrorResponse(noCompany).status, 400);
  assert.equal(calls.length, 0);

  // Solde suffisant : vrai solde renvoyé, jeton de service envoyé, aucun appel vers le service des gigs
  global.fetch = reply(200, { success: true, data: { tokens: 200000 } });
  assert.deepEqual(await assertCompanyHasAiTokens('c1', 1), { ok: true, tokens: 200000 });
  assert.match(calls[0].auth, /^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
  assert.match(calls[0].url, /tokens-company\/c1\/check\?min=1$/);
  assert.equal(calls.length, 1);

  // Même un premier gig est contrôlé : solde 0 -> 402 avec le vrai solde (0 réel)
  global.fetch = reply(402, { success: false, data: { tokens: 0 }, message: 'Solde de tokens AI insuffisant. Rechargez pour continuer.' });
  const low = await assertCompanyHasAiTokens('c1', 1);
  assert.equal(low.ok, false);
  assert.equal(low.code, 'insufficient_tokens');
  assert.equal(low.tokens, 0);
  assert.match(low.message, /insuffisant/);
  const r402 = tokenGateErrorResponse(low);
  assert.equal(r402.status, 402);
  assert.equal(r402.body.error, 'insufficient_tokens');
  assert.equal(r402.body.data.tokens, 0);

  // 401 / 500 / réseau / réponse sans solde : 503, jamais de génération gratuite
  for (const f of [reply(401, { error: 'Authentication required' }), reply(500, {}), reply(200, { success: true, data: {} }), async () => { throw new Error('boom'); }]) {
    global.fetch = f;
    const g = await assertCompanyHasAiTokens('c1', 1);
    assert.equal(g.ok, false);
    assert.equal(g.code, 'balance_unavailable');
    assert.equal(g.tokens, undefined);
    assert.equal(tokenGateErrorResponse(g).status, 503);
  }

  // Débit réel : toujours effectué, résultat renvoyé (montant + solde restant)
  calls.length = 0;
  global.fetch = reply(200, { charged: true, data: { tokens: 1234 } });
  const usage = { provider: 'anthropic', model: 'm', inputTokens: 100, outputTokens: 50, totalTokens: 150, estimated: false };
  const ok = await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u1', usage, tool: 'script.generate_chat', gigId: 'g1' });
  assert.deepEqual(ok, { billed: true, tokens: 1234, charged: 150 });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /tokens-company\/charge-usage$/);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(sent.tokensUsed, 150);
  assert.equal(sent.gigId, 'g1');

  // Débit : 402, échec serveur, réseau, sans entreprise, sans usage
  global.fetch = reply(402, { data: { tokens: 10 } });
  assert.deepEqual(await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u2', usage, tool: 't' }), { billed: false, tokens: 10, charged: 0, reason: 'insufficient_tokens' });
  global.fetch = reply(500, {});
  assert.equal((await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u3', usage, tool: 't' })).reason, 'charge_failed');
  global.fetch = async () => { throw new Error('boom'); };
  assert.equal((await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u4', usage, tool: 't' })).reason, 'charge_failed');
  global.fetch = reply(200, { charged: false });
  assert.deepEqual((await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u5', usage, tool: 't' })).charged, 0);
  calls.length = 0;
  global.fetch = reply(200, { charged: true });
  assert.equal((await chargeCompanyAiTokens({ companyId: '', usageId: 'u6', usage, tool: 't' })).reason, 'company_required');
  assert.equal((await chargeCompanyAiTokens({ companyId: 'c1', usageId: 'u7', usage: { ...usage, totalTokens: 0 }, tool: 't' })).reason, 'no_usage');
  assert.equal(calls.length, 0);

  console.info = realInfo;
  console.warn = realWarn;
  console.log('aiTokenBilling.test OK');
})().catch((e) => { console.error(e); process.exit(1); });
