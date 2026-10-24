const { vertexAIService } = require('../config/vertexAIConfig');
const { logger } = require('../utils/logger');
const { generateDocumentAnalysisPrompt } = require('../prompts/documentAnalysisPrompt');

/** Below this many characters a document gives the knowledge base nothing usable. */
const MIN_USABLE_CHARS = 40;

const REQUIRED_FIELDS = [
  'summary',
  'domain',
  'theme',
  'mainPoints',
  'technicalLevel',
  'targetAudience',
  'keyTerms',
  'recommendations',
];

function extractModelText(response) {
  if (!response || !response.candidates || !response.candidates[0]) {
    throw new Error('Invalid response structure from Vertex AI');
  }
  const candidate = response.candidates[0];
  if (candidate.content && candidate.content.parts) return candidate.content.parts[0].text;
  if (candidate.text) return candidate.text;
  if (typeof candidate === 'string') return candidate;
  throw new Error('Unable to extract content from response');
}

function parseAnalysis(content) {
  let results;
  try {
    results = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No valid JSON found in response');
    results = JSON.parse(match[0]);
  }
  for (const field of REQUIRED_FIELDS) {
    if (results[field]) continue;
    results[field] = ['mainPoints', 'keyTerms', 'recommendations'].includes(field)
      ? ['Not available']
      : 'Not available';
  }
  return results;
}

/**
 * Analyses one document and stores the result on it. Text documents send only their own
 * content to the model (not the whole company corpus), videos keep the multimodal path.
 */
async function runDocumentAnalysis(document) {
  if (!vertexAIService.vertexAI) {
    await vertexAIService.initialize();
  }

  const isVideo = document.fileType && document.fileType.startsWith('video/');
  const prompt = generateDocumentAnalysisPrompt(
    isVideo
      ? "This is a video file. Please analyze its context and provide a summary based on your knowledge if available, or a general assessment if it's new."
      : document.content
  );

  const response = isVideo
    ? await vertexAIService.queryKnowledgeBase(document.companyId, prompt, {
        fileUrl: document.fileUrl,
        fileType: document.fileType,
      })
    : (
        await vertexAIService.generativeModel.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, topK: 40, topP: 0.95, maxOutputTokens: 2048 },
        })
      ).response;

  let results;
  try {
    results = parseAnalysis(extractModelText(response));
  } catch (parseError) {
    logger.error('Error parsing analysis results:', { error: parseError.message });
    throw new Error('Failed to parse analysis results: ' + parseError.message);
  }

  document.analysis = { ...results, analyzedAt: new Date() };
  await document.save();
  return document.analysis;
}

module.exports = { runDocumentAnalysis, MIN_USABLE_CHARS };
