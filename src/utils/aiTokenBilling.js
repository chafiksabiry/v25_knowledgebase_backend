/**
 * HARX prepaid AI tokens — normalize provider usage + charge orchestrator wallet.
 * Providers: Anthropic (Claude), OpenAI, Gemini/Vertex. Fallback: ~4 chars ≈ 1 token.
 */

const crypto = require('crypto');

const b64url = (v) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** JWT HS256 de service à service, valable une minute (même format que ceux vérifiés par l'orchestrateur). */
function signServiceToken(secret, payload, ttlSeconds = 60) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }))}`;
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${body}.${sig}`;
}

function estimateTokensFromText(...parts) {
  const chars = parts.reduce((sum, p) => sum + String(p || '').length, 0);
  return Math.max(1, Math.ceil(chars / 4));
}

function usageFromAnthropic(raw, model) {
  const u = raw?.usage || raw;
  const input = Number(u?.input_tokens ?? u?.inputTokens ?? 0);
  const output = Number(u?.output_tokens ?? u?.outputTokens ?? 0);
  if (!Number.isFinite(input + output) || input + output <= 0) return null;
  return {
    provider: 'anthropic',
    model: model || undefined,
    inputTokens: Math.max(0, Math.round(input)),
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(input + output)),
    estimated: false,
  };
}

function usageFromGemini(raw, model) {
  const u = raw?.usageMetadata || raw?.usage || raw;
  const input = Number(
    u?.promptTokenCount ?? u?.prompt_token_count ?? u?.inputTokens ?? u?.input_tokens ?? 0
  );
  const output = Number(
    u?.candidatesTokenCount ??
      u?.candidates_token_count ??
      u?.outputTokens ??
      u?.output_tokens ??
      0
  );
  const total = Number(u?.totalTokenCount ?? u?.total_token_count ?? input + output);
  if (!Number.isFinite(total) || total <= 0) return null;
  return {
    provider: 'gemini',
    model: model || undefined,
    inputTokens: Math.max(0, Math.round(input)),
    outputTokens: Math.max(0, Math.round(output)),
    totalTokens: Math.max(0, Math.round(total)),
    estimated: false,
  };
}

function fallbackEstimatedUsage(...parts) {
  const total = estimateTokensFromText(...parts);
  return {
    provider: 'estimated',
    inputTokens: 0,
    outputTokens: total,
    totalTokens: total,
    estimated: true,
  };
}

function resolveUsageOrEstimate(usage, ...textParts) {
  if (usage && usage.totalTokens > 0) return usage;
  return fallbackEstimatedUsage(...textParts);
}

function getOrchestratorApiBase() {
  const raw =
    process.env.COMPORCHESTRATOR_API_URL ||
    process.env.ORCHESTRATOR_API_BASE_URL ||
    process.env.VITE_API_BASE_URL ||
    'https://v25comporchestratorback-production.up.railway.app/api';
  return String(raw).replace(/\/$/, '');
}

/**
 * Règle produit : les jetons IA sont TOUJOURS prépayés et débités (aucun premier gig gratuit).
 * Sans companyId la requête est refusée ; si le solde est illisible la requête échoue proprement
 * (jamais de génération gratuite silencieuse).
 */

/** Réponse HTTP uniforme d'un refus de garde (400 sans entreprise, 402 solde insuffisant, 503 solde illisible). */
function tokenGateErrorResponse(gate) {
  const status = gate.code === 'company_required' ? 400 : gate.code === 'balance_unavailable' ? 503 : 402;
  return {
    status,
    body: {
      success: false,
      error: gate.code || 'insufficient_tokens',
      message: gate.message,
      data: { tokens: gate.tokens },
    },
  };
}

/**
 * Vérifie le solde prépayé auprès de l'orchestrateur.
 * - sans companyId : refus (400 company_required) ;
 * - solde < minRequired : refus (402 insufficient_tokens) avec le vrai solde ;
 * - solde illisible (réseau, 401, 5xx, réponse invalide) : refus propre (503 balance_unavailable).
 * Le solde renvoyé est le solde réel (undefined si inconnu, jamais 0 comme marqueur).
 */
async function assertCompanyHasAiTokens(companyId, minRequired = 1) {
  const id = String(companyId || '').trim();
  if (!id) {
    return {
      ok: false,
      code: 'company_required',
      message: "Identifiant d'entreprise requis pour utiliser les jetons IA.",
    };
  }

  const min = Math.max(1, Math.ceil(Number(minRequired) || 1));
  const unavailable = (detail) => {
    console.warn('[aiTokenBilling] balance check unavailable:', detail);
    return {
      ok: false,
      code: 'balance_unavailable',
      message: 'Impossible de vérifier votre solde de jetons IA pour le moment. Réessayez dans quelques instants.',
    };
  };

  try {
    const base = getOrchestratorApiBase();
    // L'orchestrateur exige un JWT sur /check (PAY-12) : appel de service à service, jeton signé avec le secret commun.
    const headers = {};
    if (process.env.JWT_SECRET) {
      headers.Authorization = `Bearer ${signServiceToken(process.env.JWT_SECRET, { service: 'knowledgebase', companyId: id })}`;
    }
    const res = await fetch(`${base}/tokens-company/${encodeURIComponent(id)}/check?min=${min}`, { headers });
    const json = await res.json().catch(() => ({}));
    const balance = json?.data?.tokens;
    const hasBalance = typeof balance === 'number' && Number.isFinite(balance);

    if (res.status === 402 || json?.success === false) {
      return {
        ok: false,
        code: 'insufficient_tokens',
        tokens: hasBalance ? balance : undefined,
        message: json?.message || 'Solde de tokens AI insuffisant. Rechargez pour continuer.',
      };
    }
    if (!res.ok) return unavailable(`HTTP ${res.status}`);
    if (!hasBalance) return unavailable('balance missing in orchestrator response');
    return { ok: true, tokens: balance };
  } catch (err) {
    return unavailable(String(err?.message || err));
  }
}

/** Débite le coût réel après génération (toujours, aucun gig gratuit) ; le résultat est journalisé et renvoyé. */
async function chargeCompanyAiTokens({ companyId, usageId, usage, tool, gigId, meta }) {
  const id = String(companyId || '').trim();
  const tokensUsed = Math.max(0, Math.round(usage?.totalTokens || 0));
  const log = (r) => {
    console.info('[aiTokenBilling] charge', {
      tool,
      usageId,
      companyId: id || null,
      tokensUsed,
      billed: r.billed,
      charged: r.charged,
      balance: r.tokens,
      reason: r.reason,
    });
    return r;
  };
  if (!id) return log({ billed: false, charged: 0, reason: 'company_required' });
  if (tokensUsed <= 0) return log({ billed: false, charged: 0, reason: 'no_usage' });

  try {
    const base = getOrchestratorApiBase();
    const resolvedGigId = String(gigId || meta?.gigId || '').trim() || undefined;
    const res = await fetch(`${base}/tokens-company/charge-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: id,
        usageId,
        tokensUsed,
        tool,
        gigId: resolvedGigId || undefined,
        meta: {
          ...(meta || {}),
          provider: usage.provider,
          model: usage.model || null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimated: usage.estimated,
          ...(resolvedGigId ? { gigId: resolvedGigId } : {}),
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const balance = typeof json?.data?.tokens === 'number' ? json.data.tokens : undefined;
    if (res.status === 402) {
      return log({ billed: false, tokens: balance, charged: 0, reason: 'insufficient_tokens' });
    }
    if (!res.ok) {
      console.warn('[aiTokenBilling] charge failed', res.status, json);
      return log({ billed: false, charged: 0, reason: 'charge_failed' });
    }
    const billed = Boolean(json?.charged);
    return log({ billed, tokens: balance, charged: billed ? tokensUsed : 0, ...(billed ? {} : { reason: 'charge_failed' }) });
  } catch (err) {
    console.warn('[aiTokenBilling] charge error:', err);
    return log({ billed: false, charged: 0, reason: 'charge_failed' });
  }
}

module.exports = {
  signServiceToken,
  estimateTokensFromText,
  usageFromAnthropic,
  usageFromGemini,
  fallbackEstimatedUsage,
  resolveUsageOrEstimate,
  tokenGateErrorResponse,
  assertCompanyHasAiTokens,
  chargeCompanyAiTokens,
};
