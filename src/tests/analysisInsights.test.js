// Insights KB ("Start Analysis"): the analysis must not depend on a Vertex RAG corpus (the service
// has no createRagCorpus / importDocumentsToCorpus: documents are read from MongoDB), and it must
// never be marked 'completed' with an unusable result.

const mockService = {
  vertexAI: {},
  initialize: jest.fn(async function () { mockService.vertexAI = {}; }),
  queryKnowledgeBase: jest.fn(),
  checkCorpusStatus: jest.fn(),
};

jest.mock('../config/vertexAIConfig', () => ({ vertexAIService: mockService }));
jest.mock('openai', () => jest.fn().mockImplementation(() => ({})));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const mockAnalysisStore = [];
jest.mock('../models/Analysis', () => {
  const Ctor = function (data) {
    Object.assign(this, data);
    this._id = `a${mockAnalysisStore.length + 1}`;
    this.save = jest.fn(async () => { if (!mockAnalysisStore.includes(this)) mockAnalysisStore.push(this); return this; });
  };
  Ctor.find = jest.fn(async () => []);
  Ctor.findOne = jest.fn(() => ({ sort: async () => null }));
  return Ctor;
});
const mockDocs = [{ _id: 'd1', name: 'Doc 1', content: 'hello', tags: [] }];
jest.mock('../models/Document', () => ({
  find: jest.fn(async () => mockDocs),
  countDocuments: jest.fn(async () => mockDocs.length),
}));
jest.mock('../models/Company', () => ({}));
jest.mock('../models/Script', () => ({}));

const { analyzeDocumentsWithRAG, startAnalysis } = require('../controllers/analysisController');
const { initializeCompanyCorpus, syncDocumentsToCorpus } = require('../controllers/ragController');

const GOOD = {
  topicAnalysis: { summary: 's', mainTopics: [] },
  knowledgeGaps: { summary: 'g', gaps: [] },
  recommendations: { summary: 'r', priorities: [] },
};
const reply = (text, finishReason = 'STOP') => ({ candidates: [{ content: { parts: [{ text }] }, finishReason }] });
const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  jest.clearAllMocks();
  mockAnalysisStore.length = 0;
  mockService.vertexAI = {};
  mockService.queryKnowledgeBase.mockResolvedValue(reply(JSON.stringify(GOOD)));
});

describe('analyzeDocumentsWithRAG', () => {
  test('works without createRagCorpus / importDocumentsToCorpus (they do not exist on the service)', async () => {
    expect(mockService.createRagCorpus).toBeUndefined();
    expect(mockService.importDocumentsToCorpus).toBeUndefined();
    await expect(analyzeDocumentsWithRAG('c1', mockDocs)).resolves.toEqual(GOOD);
  });

  test('initializes Vertex AI when it is not ready yet', async () => {
    mockService.vertexAI = null;
    await analyzeDocumentsWithRAG('c1', mockDocs);
    expect(mockService.initialize).toHaveBeenCalledTimes(1);
  });

  test('asks for enough output tokens for the full JSON (not the 2048 default)', async () => {
    await analyzeDocumentsWithRAG('c1', mockDocs);
    const options = mockService.queryKnowledgeBase.mock.calls[0][4];
    expect(options.maxOutputTokens).toBeGreaterThanOrEqual(8192);
  });

  test('rejects with a usable message when the JSON cannot be parsed', async () => {
    mockService.queryKnowledgeBase.mockResolvedValue(reply('I could not do that {not json'));
    await expect(analyzeDocumentsWithRAG('c1', mockDocs)).rejects.toThrow(/not valid JSON/i);
  });

  test('rejects with a usable message when the answer was cut off (MAX_TOKENS)', async () => {
    mockService.queryKnowledgeBase.mockResolvedValue(reply('{"topicAnalysis": {"summary": "x"', 'MAX_TOKENS'));
    await expect(analyzeDocumentsWithRAG('c1', mockDocs)).rejects.toThrow(/truncated|too long/i);
  });
});

describe('startAnalysis', () => {
  const run = async () => {
    const res = mockRes();
    await startAnalysis({ body: { companyId: 'c1' } }, res);
    await flush();
    return res;
  };

  test('marks the analysis completed with the parsed results', async () => {
    const res = await run();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockAnalysisStore[0].status).toBe('completed');
    expect(mockAnalysisStore[0].results).toEqual(GOOD);
  });

  test("marks the analysis 'failed' (not 'completed' with rawText) when the JSON is unusable", async () => {
    mockService.queryKnowledgeBase.mockResolvedValue(reply('nope'));
    await run();
    expect(mockAnalysisStore[0].status).toBe('failed');
    expect(mockAnalysisStore[0].error).toMatch(/not valid JSON/i);
    expect(mockAnalysisStore[0].results).toBeUndefined();
  });
});

describe('/rag/corpus/initialize and /rag/corpus/sync', () => {
  test('initialize answers 200 with the document count (no Vertex corpus involved)', async () => {
    const res = mockRes();
    await initializeCompanyCorpus({ body: { companyId: 'c1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].documentsImported).toBe(1);
  });

  test('sync answers 200 with the document count', async () => {
    const res = mockRes();
    await syncDocumentsToCorpus({ body: { companyId: 'c1' } }, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].documentsImported).toBe(1);
  });
});
