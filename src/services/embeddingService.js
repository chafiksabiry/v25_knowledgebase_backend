const { logger } = require('../utils/logger');

const VERTEX_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-005';
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const VERTEX_BATCH = 16;
const OPENAI_BATCH = 64;

function cosine(a, b) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

async function vertexEmbed(texts, taskType) {
  const { GoogleAuth } = require('google-auth-library');
  const { VERTEX_CONFIG } = require('../config/vertexAIConfig');
  const keyFilename = VERTEX_CONFIG.getCredentialsPath();
  const auth = new GoogleAuth({
    ...(keyFilename ? { keyFilename } : {}),
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const { project, location } = VERTEX_CONFIG;
  const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${VERTEX_EMBEDDING_MODEL}:predict`;
  const vectors = [];
  for (let i = 0; i < texts.length; i += VERTEX_BATCH) {
    const batch = texts.slice(i, i + VERTEX_BATCH);
    const res = await client.request({
      url,
      method: 'POST',
      data: { instances: batch.map((content) => ({ content, task_type: taskType })) },
    });
    for (const p of res.data.predictions || []) vectors.push(p.embeddings.values);
  }
  if (vectors.length !== texts.length) throw new Error('Vertex embeddings: unexpected response size');
  return { vectors, model: `vertex:${VERTEX_EMBEDDING_MODEL}` };
}

async function openAiEmbed(texts) {
  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const vectors = [];
  for (let i = 0; i < texts.length; i += OPENAI_BATCH) {
    const res = await client.embeddings.create({ model: OPENAI_EMBEDDING_MODEL, input: texts.slice(i, i + OPENAI_BATCH) });
    for (const row of res.data) vectors.push(row.embedding);
  }
  return { vectors, model: `openai:${OPENAI_EMBEDDING_MODEL}` };
}

/**
 * Embeds texts with Vertex AI, falling back to OpenAI. `preferredModel` (a stored model tag) forces the
 * provider that produced the stored vectors, since vectors of different models are not comparable.
 * @param {string[]} texts
 * @param {'RETRIEVAL_DOCUMENT'|'RETRIEVAL_QUERY'} taskType
 * @param {string} [preferredModel]
 * @returns {Promise<{vectors:number[][], model:string}>}
 */
async function embedTexts(texts, taskType = 'RETRIEVAL_DOCUMENT', preferredModel = null) {
  if (!texts.length) return { vectors: [], model: null };
  const providers = [];
  const vertexOk = Boolean(process.env.VERTEX_AI_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_PROJECT);
  const openAiOk = Boolean(process.env.OPENAI_API_KEY);
  if (preferredModel && preferredModel.startsWith('openai:')) {
    if (openAiOk) providers.push(() => openAiEmbed(texts));
  } else if (preferredModel && preferredModel.startsWith('vertex:')) {
    if (vertexOk) providers.push(() => vertexEmbed(texts, taskType));
  } else {
    if (vertexOk) providers.push(() => vertexEmbed(texts, taskType));
    if (openAiOk) providers.push(() => openAiEmbed(texts));
  }
  let lastError = new Error('No embedding provider configured');
  for (const run of providers) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      logger.warn(`Embedding provider failed: ${error.message}`);
    }
  }
  throw lastError;
}

module.exports = { embedTexts, cosine };
