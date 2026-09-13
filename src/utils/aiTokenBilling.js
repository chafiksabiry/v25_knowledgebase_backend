/**
 * HARX prepaid AI tokens — normalize provider usage + charge orchestrator wallet.
 * Providers: Anthropic (Claude), OpenAI, Gemini/Vertex. Fallback: ~4 chars ≈ 1 token.
 */

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

async function assertCompanyHasAiTokens(companyId, minRequired = 1) {
  const id = String(companyId || '').trim();
  if (!id) return { ok: true, tokens: 0 };
  try {
    const base = getOrchestratorApiBase();
    const res = await fetch(
      `${base}/tokens-company/${encodeURIComponent(id)}/check?min=${Math.max(1, minRequired)}`
    );
    const json = await res.json().catch(() => ({}));
    const tokens = typeof json?.data?.tokens === 'number' ? json.data.tokens : 0;
    if (!res.ok || json?.success === false) {
      return {
        ok: false,
        tokens,
        message: json?.message || 'Solde de tokens AI insuffisant. Rechargez pour continuer.',
      };
    }
    return { ok: true, tokens };
  } catch (err) {
    console.warn('[aiTokenBilling] assert check failed (allowing request):', err);
    return { ok: true, tokens: 0 };
  }
}

async function chargeCompanyAiTokens({ companyId, usageId, usage, tool, meta }) {
  const id = String(companyId || '').trim();
  if (!id) return { billed: false };
  const tokensUsed = Math.max(0, Math.round(usage?.totalTokens || 0));
  if (tokensUsed <= 0) return { billed: false };

  try {
    const base = getOrchestratorApiBase();
    const res = await fetch(`${base}/tokens-company/charge-usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: id,
        usageId,
        tokensUsed,
        tool,
        meta: {
          ...(meta || {}),
          provider: usage.provider,
          model: usage.model || null,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          estimated: usage.estimated,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 402) {
      console.warn('[aiTokenBilling] charge 402 insufficient_tokens', id, tokensUsed);
      return { billed: false, tokens: json?.data?.tokens };
    }
    if (!res.ok) {
      console.warn('[aiTokenBilling] charge failed', res.status, json);
      return { billed: false };
    }
    return {
      billed: Boolean(json?.charged),
      tokens: typeof json?.data?.tokens === 'number' ? json.data.tokens : undefined,
    };
  } catch (err) {
    console.warn('[aiTokenBilling] charge error:', err);
    return { billed: false };
  }
}

module.exports = {
  estimateTokensFromText,
  usageFromAnthropic,
  usageFromGemini,
  fallbackEstimatedUsage,
  resolveUsageOrEstimate,
  assertCompanyHasAiTokens,
  chargeCompanyAiTokens,
};
