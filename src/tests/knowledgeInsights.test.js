const mockDocs = [];
const mockCompany = { _id: '64b000000000000000000001' };

jest.mock('../models/Document', () => ({
  find: jest.fn(() => {
    const q = { select: () => q, sort: () => q, limit: () => q, lean: () => Promise.resolve(mockDocs) };
    return q;
  }),
}));
jest.mock('../models/Company', () => ({ findOne: jest.fn(async ({ userId }) => (userId === 'u1' ? mockCompany : null)) }));
jest.mock('../services/retrievalService', () => ({ retrieveChunks: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));

const { retrieveChunks } = require('../services/retrievalService');
const { getKnowledgeScore, agentSearch } = require('../controllers/knowledgeInsightsController');

const GIG_A = '64b0000000000000000000a1';
const GIG_B = '64b0000000000000000000b2';
const run = async (handler, body) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  await handler({ body }, res);
  return res;
};
const text = (s) => `${s} `.repeat(60);

beforeEach(() => {
  mockDocs.length = 0;
  retrieveChunks.mockReset();
});

describe('knowledge score endpoint', () => {
  test('needs a user and a company', async () => {
    expect((await run(getKnowledgeScore, {})).statusCode).toBe(400);
    expect((await run(getKnowledgeScore, { userId: 'nobody' })).statusCode).toBe(404);
  });

  test('scores each gig with its own documents plus the company-wide ones', async () => {
    mockDocs.push(
      { _id: 'd1', name: 'Offre santé', content: text('mutuelle santé offre garantie tarif prix'), gigId: GIG_A, metadata: { wordCount: 300 }, embeddedAt: new Date(), uploadedAt: new Date() },
      { _id: 'd2', name: 'Offre auto', content: text('assurance auto offre garantie tarif prix'), gigId: GIG_B, metadata: { wordCount: 300 }, embeddedAt: new Date(), uploadedAt: new Date() },
      { _id: 'd3', name: 'Charte', content: text('conformité rgpd consentement'), gigId: null, metadata: { wordCount: 200 }, embeddedAt: null, uploadedAt: new Date() }
    );
    const res = await run(getKnowledgeScore, {
      userId: 'u1',
      gigs: [{ id: GIG_A, title: 'Mutuelle santé' }, { id: GIG_B, title: 'Assurance auto' }, { id: 'not-an-id', title: 'ignored' }],
    });
    expect(res.statusCode).toBe(200);
    const { scores } = res.body.data;
    expect(Object.keys(scores).sort()).toEqual([GIG_A, GIG_B].sort());
    expect(scores[GIG_A].documents.map((d) => d.id).sort()).toEqual(['d1', 'd3']);
    expect(scores[GIG_B].documents.map((d) => d.id).sort()).toEqual(['d2', 'd3']);
    expect(scores[GIG_A].topics.find((t) => t.id === 'compliance').status).not.toBe('missing');
  });

  test('without gigs, returns one company-level score under "all"', async () => {
    const res = await run(getKnowledgeScore, { userId: 'u1' });
    expect(res.body.data.scores.all.score).toBe(0);
  });
});

describe('agent search endpoint', () => {
  const COMPANY = '64b000000000000000000001';

  test('validates its input', async () => {
    expect((await run(agentSearch, { query: 'x' })).statusCode).toBe(400);
    expect((await run(agentSearch, { companyId: COMPANY })).statusCode).toBe(400);
    expect((await run(agentSearch, { companyId: COMPANY, query: 'x', gigId: 'bad' })).statusCode).toBe(400);
  });

  test('returns short passages for the gig, capped in number and size', async () => {
    retrieveChunks.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({ documentId: `d${i}`, title: `Doc ${i}`, content: 'x'.repeat(2000), score: 0.9 - i * 0.05 }))
    );
    const res = await run(agentSearch, { companyId: COMPANY, gigId: GIG_A, query: 'franchise vol ?', topK: 50 });
    expect(res.statusCode).toBe(200);
    expect(retrieveChunks).toHaveBeenCalledWith(expect.objectContaining({ topK: 5 }));
    expect(String(retrieveChunks.mock.calls[0][0].gigId)).toBe(GIG_A);
    expect(res.body.data.passages[0].content.length).toBeLessThanOrEqual(700);
  });

  test('says when nothing was found instead of inventing', async () => {
    retrieveChunks.mockResolvedValue([]);
    const res = await run(agentSearch, { companyId: COMPANY, query: 'question sans réponse' });
    expect(res.body.data).toEqual({ found: false, passages: [] });
  });
});
