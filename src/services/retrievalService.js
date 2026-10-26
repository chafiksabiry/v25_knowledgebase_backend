const Document = require('../models/Document');
const { chunkDocument } = require('../utils/textProcessing');
const { embedTexts, cosine } = require('./embeddingService');
const { logger } = require('../utils/logger');

/** Corpora up to this size are sent whole (best coherence); larger ones go through semantic retrieval. */
const FULL_CONTEXT_MAX_CHARS = Number(process.env.RAG_FULL_CONTEXT_MAX_CHARS || 60000);
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 200;
const DEFAULT_TOP_K = 8;
const MIN_SCORE = 0.2;
/** A document with at least this much text is usable (same threshold as the readiness report). */
const MIN_USABLE_CHARS = 40;

/** Text embedded for a chunk: the document name gives the chunk its context. */
function chunkEmbeddingText(docName, content) {
  return `${docName}\n\n${content}`.slice(0, 6000);
}

/**
 * Splits a document into chunks and stores one embedding per chunk.
 * Embedding failures leave the document usable (keyword fallback) and are reported, not thrown.
 * @returns {Promise<{embedded: boolean, chunks: number, model: string|null, error?: string}>}
 */
async function indexDocument(documentOrId) {
  const doc = typeof documentOrId === 'object' && documentOrId.save ? documentOrId : await Document.findById(documentOrId);
  if (!doc) throw new Error('Document not found');
  const text = String(doc.content || '').trim();
  if (!text) return { embedded: false, chunks: 0, model: null, error: 'no_text' };

  const pieces = chunkDocument(text, CHUNK_SIZE, CHUNK_OVERLAP);
  try {
    const { vectors, model } = await embedTexts(
      pieces.map((c) => chunkEmbeddingText(doc.name, c)),
      'RETRIEVAL_DOCUMENT'
    );
    doc.chunks = pieces.map((content, index) => ({ content, index, embedding: vectors[index] }));
    doc.embeddingModel = model;
    doc.embeddedAt = new Date();
    if (doc.processingStatus === 'pending') doc.processingStatus = 'completed';
    await doc.save();
    return { embedded: true, chunks: pieces.length, model };
  } catch (error) {
    logger.error(`Embedding failed for document ${doc._id}: ${error.message}`);
    doc.chunks = pieces.map((content, index) => ({ content, index }));
    doc.embeddingModel = null;
    doc.embeddedAt = null;
    await doc.save();
    return { embedded: false, chunks: pieces.length, model: null, error: error.message };
  }
}

/** (Re)indexes every document of a company that has no up-to-date embeddings. */
async function reindexCompany(companyId, { force = false } = {}) {
  // Documents are selected on having text, not on processingStatus: uploads from before the status was
  // maintained stayed 'pending' forever and were silently skipped (the button answered "ok" having done nothing).
  const filter = {
    companyId,
    $expr: { $gte: [{ $strLenCP: { $ifNull: ['$content', ''] } }, MIN_USABLE_CHARS] },
  };
  if (!force) filter.embeddedAt = null;
  const docs = await Document.find(filter);
  const results = [];
  for (const doc of docs) {
    results.push({ id: String(doc._id), name: doc.name, ...(await indexDocument(doc)) });
  }
  return results;
}

function keywordScore(query, text) {
  const terms = [...new Set(String(query).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])];
  if (!terms.length) return 0;
  const lower = text.toLowerCase();
  let hits = 0;
  for (const term of terms) if (lower.includes(term)) hits += 1;
  return hits / terms.length;
}

/**
 * Returns the chunks most relevant to the query. Combines the semantic score with a keyword score,
 * so exact identifiers (product codes, article numbers) are found even when the vector is vague.
 * @returns {Promise<Array<{documentId:string, title:string, index:number, content:string, score:number}>>}
 */
async function retrieveChunks({ companyId, gigId = null, query, topK = DEFAULT_TOP_K }) {
  // The gig's own documents plus the company-wide ones (no gig attached), like the document lists.
  let docs = gigId ? await Document.find({ companyId, $or: [{ gigId }, { gigId: null }] }).select('name chunks embeddingModel') : [];
  if (docs.length === 0) {
    docs = await Document.find({ companyId }).select('name chunks embeddingModel');
  }

  // A document without chunks (not indexed yet) must not be invisible to the REPS / AI agents: it is split on the
  // fly and scored on keywords only until its index exists.
  const unindexed = docs.filter((d) => !(d.chunks && d.chunks.length));
  if (unindexed.length) {
    const withText = await Document.find({ _id: { $in: unindexed.map((d) => d._id) } }).select('content');
    const textById = new Map(withText.map((d) => [String(d._id), String(d.content || '')]));
    for (const doc of unindexed) {
      const text = textById.get(String(doc._id)) || '';
      if (text.trim().length >= MIN_USABLE_CHARS) {
        doc.chunks = chunkDocument(text, CHUNK_SIZE, CHUNK_OVERLAP).map((content, index) => ({ content, index }));
      }
    }
  }

  const queryVectors = {};
  const scored = [];
  for (const doc of docs) {
    let queryVector = null;
    if (doc.embeddingModel) {
      if (!(doc.embeddingModel in queryVectors)) {
        try {
          queryVectors[doc.embeddingModel] = (await embedTexts([query], 'RETRIEVAL_QUERY', doc.embeddingModel)).vectors[0];
        } catch (error) {
          logger.warn(`Query embedding failed (${doc.embeddingModel}): ${error.message}`);
          queryVectors[doc.embeddingModel] = null;
        }
      }
      queryVector = queryVectors[doc.embeddingModel];
    }
    for (const chunk of doc.chunks || []) {
      const lexical = keywordScore(query, chunk.content);
      const semantic = queryVector && chunk.embedding && chunk.embedding.length ? cosine(queryVector, chunk.embedding) : null;
      const score = semantic === null ? lexical * 0.6 : 0.8 * semantic + 0.2 * lexical;
      scored.push({ documentId: String(doc._id), title: doc.name, index: chunk.index, content: chunk.content, score });
    }
  }
  return scored
    .filter((c) => c.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

module.exports = { indexDocument, reindexCompany, retrieveChunks, keywordScore, FULL_CONTEXT_MAX_CHARS };
