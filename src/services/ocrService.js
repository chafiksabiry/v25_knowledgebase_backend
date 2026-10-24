const fs = require('fs');
const { logger } = require('../utils/logger');

/** Inline payload ceiling for the multimodal call (the API limit is ~20 MB for the whole request). */
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

const OCR_PROMPT = [
  'Transcribe ALL the text of this document, in reading order, in its original language.',
  'Rules:',
  '- Reproduce every table as a Markdown table (header row, separator row, one row per line); never flatten a table into prose.',
  '- Keep headings as Markdown headings and lists as Markdown lists.',
  '- For charts or images that carry information, add one line starting with "[Figure: ...]" describing what they show.',
  '- Do not summarise, translate, comment or add anything that is not in the document.',
].join('\n');

/**
 * OCR + table extraction through the multimodal model (works for scanned PDFs and images).
 * @returns {Promise<string>} Markdown text ('' when nothing could be read)
 */
async function ocrWithGemini(filePath, mimeType) {
  const size = fs.statSync(filePath).size;
  if (size > MAX_INLINE_BYTES) {
    throw new Error(`File too large for OCR (${Math.round(size / 1024 / 1024)} MB, max ${MAX_INLINE_BYTES / 1024 / 1024} MB)`);
  }
  // Required lazily: vertexAIConfig itself requires the document processing service.
  const { vertexAIService } = require('../config/vertexAIConfig');
  if (!vertexAIService.vertexAI) await vertexAIService.initialize();
  const data = fs.readFileSync(filePath).toString('base64');
  const result = await vertexAIService.generativeModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: OCR_PROMPT }, { inlineData: { mimeType, data } }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 32768 },
  });
  const parts = result.response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  logger.info(`OCR extracted ${text.length} characters from ${mimeType}`);
  return text;
}

module.exports = { ocrWithGemini, OCR_PROMPT };
