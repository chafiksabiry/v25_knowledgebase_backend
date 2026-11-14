// queryKnowledgeBase keeps its 2048-token default but lets a caller raise it (Insights KB needs a large JSON).
jest.mock('../models/Document', () => ({
  find: jest.fn(() => ({ select: async () => [{ _id: 'd1', name: 'Doc', content: 'hello world', fileUrl: 'u' }] })),
}));
jest.mock('../models/CallRecording', () => ({ find: jest.fn(async () => []) }));
jest.mock('../services/documentProcessingService', () => ({ extractTextFromFile: jest.fn() }));
jest.mock('../utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const { vertexAIService } = require('../config/vertexAIConfig');

beforeEach(() => {
  vertexAIService.vertexAI = {};
  vertexAIService.generativeModel = { generateContent: jest.fn(async () => ({ response: { candidates: [] } })) };
});
const tokensSent = () => vertexAIService.generativeModel.generateContent.mock.calls[0][0].generationConfig.maxOutputTokens;

test('default stays 2048', async () => {
  await vertexAIService.queryKnowledgeBase('c1', 'q');
  expect(tokensSent()).toBe(2048);
});

test('caller can raise maxOutputTokens', async () => {
  await vertexAIService.queryKnowledgeBase('c1', 'q', null, null, { maxOutputTokens: 8192 });
  expect(tokensSent()).toBe(8192);
});
