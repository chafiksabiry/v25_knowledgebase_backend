const mockDocs = [];

jest.mock('../models/Document', () => ({
  findById: jest.fn(async (id) => mockDocs.find((d) => d._id === id) || null),
  find: jest.fn((filter) => {
    const rows = mockDocs.filter((d) => {
      if (filter._id && filter._id.$in) return filter._id.$in.map(String).includes(String(d._id));
      if (String(d.companyId) !== String(filter.companyId)) return false;
      if (filter.gigId && d.gigId !== filter.gigId) return false;
      if (filter.processingStatus && d.processingStatus !== filter.processingStatus) return false;
      if (filter.embeddedAt === null && d.embeddedAt) return false;
      if (filter.$expr && String(d.content || '').length < 40) return false;
      return true;
    });
    // Mongoose queries are chainable and awaitable
    return { select: () => Promise.resolve(rows), then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  }),
}));

// Deterministic bag-of-words embedder: each word is a dimension, so related texts have high cosine.
const VOCAB = ['franchise', 'vol', 'garantie', 'tarif', 'mensuel', 'sinistre', 'resiliation', 'delai', 'remboursement', 'prime'];
jest.mock('../services/embeddingService', () => {
  const actual = jest.requireActual('../services/embeddingService');
  return {
    cosine: actual.cosine,
    embedTexts: jest.fn(async (texts) => ({
      vectors: texts.map((t) => VOCAB.map((w) => (t.toLowerCase().includes(w) ? 1 : 0))),
      model: 'test:bow',
    })),
  };
});

const { indexDocument, reindexCompany, retrieveChunks, keywordScore } = require('../services/retrievalService');
const { wordHtmlToText, countMarkdownTables } = require('../services/documentProcessingService');

const makeDoc = (name, content, extra = {}) => ({
  _id: name,
  name,
  content,
  companyId: 'c1',
  chunks: [],
  save: jest.fn(async function save() { return this; }),
  ...extra,
});

describe('semantic retrieval', () => {
  beforeEach(() => { mockDocs.length = 0; });

  test('indexDocument stores one embedding per chunk and the model tag', async () => {
    const doc = makeDoc('conditions', `${'Le tarif mensuel de la garantie vol est fixe. '.repeat(80)}\n\n${'La franchise en cas de sinistre est de 150 euros. '.repeat(80)}`);
    mockDocs.push(doc);
    const res = await indexDocument(doc);
    expect(res.embedded).toBe(true);
    expect(doc.chunks.length).toBeGreaterThan(1);
    expect(doc.chunks.every((c) => c.embedding.length === VOCAB.length)).toBe(true);
    expect(doc.embeddingModel).toBe('test:bow');
  });

  test('retrieveChunks returns the passage that answers the question, not the whole corpus', async () => {
    const a = makeDoc('tarifs', `${'Le tarif mensuel de la prime est affiche ici. '.repeat(60)}`);
    const b = makeDoc('sinistres', `${'La franchise appliquee au sinistre vol est de 150 euros. '.repeat(60)}`);
    mockDocs.push(a, b);
    await indexDocument(a);
    await indexDocument(b);
    const out = await retrieveChunks({ companyId: 'c1', query: 'Quelle est la franchise en cas de vol ?', topK: 3 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].title).toBe('sinistres');
  });

  test('without embeddings, keyword matching still finds the passage', async () => {
    const d = makeDoc('legacy', 'Le delai de resiliation est de 30 jours.', { chunks: [{ content: 'Le delai de resiliation est de 30 jours.', index: 0 }] });
    mockDocs.push(d);
    const out = await retrieveChunks({ companyId: 'c1', query: 'delai de resiliation', topK: 3 });
    expect(out[0].title).toBe('legacy');
    expect(keywordScore('delai resiliation', 'rien')).toBe(0);
  });
});

describe('documents that were never indexed', () => {
  beforeEach(() => { mockDocs.length = 0; });

  // Uploads from before processingStatus was maintained stayed 'pending': the reindex button skipped them
  // (HTTP 200 in a few ms, nothing done) and the AI agents could not find anything in them.
  const legacy = (name, content, extra = {}) => makeDoc(name, content, { processingStatus: 'pending', embeddedAt: null, ...extra });

  test('reindexCompany indexes a document whose status is still "pending", and completes it', async () => {
    const d = legacy('tarifs-2026', `${'Le tarif mensuel de la prime est de 12 euros. '.repeat(40)}`);
    mockDocs.push(d);
    const results = await reindexCompany('c1');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'tarifs-2026', embedded: true });
    expect(d.embeddedAt).toBeInstanceOf(Date);
    expect(d.processingStatus).toBe('completed');
  });

  test('already indexed documents and documents without text are left alone', async () => {
    mockDocs.push(
      legacy('indexe', 'Contenu deja indexe avec assez de texte pour etre utile.', { embeddedAt: new Date() }),
      legacy('vide', 'scan'),
    );
    expect(await reindexCompany('c1')).toHaveLength(0);
    expect(await reindexCompany('c1', { force: true })).toHaveLength(1);
  });

  test('retrieveChunks still finds the answer in a document that is not indexed yet', async () => {
    const d = legacy('franchise', `${'La franchise appliquee au sinistre vol est de 150 euros. '.repeat(30)}`);
    mockDocs.push(d);
    const out = await retrieveChunks({ companyId: 'c1', query: 'franchise sinistre vol', topK: 3 });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].title).toBe('franchise');
    expect(out[0].content).toMatch(/franchise/);
  });
});

describe('table extraction', () => {
  test('Word tables become Markdown tables', () => {
    const { text, tables } = wordHtmlToText('<table><tr><th>Garantie</th><th>Prix</th></tr><tr><td>Vol</td><td>12</td></tr></table>');
    expect(tables).toBe(1);
    expect(text).toContain('| Garantie | Prix |');
    expect(countMarkdownTables(text)).toBe(1);
  });
});
