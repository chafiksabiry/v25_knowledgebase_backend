const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { logger } = require('../utils/logger');
const { ocrWithGemini } = require('./ocrService');

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
/** A PDF whose text layer holds fewer characters per page than this is treated as a scan. */
const MIN_CHARS_PER_PAGE = 80;

/**
 * Extract text from a file, reporting how it was obtained.
 * @param {string} filePath - Path to the file
 * @param {string} fileType - MIME type of the file
 * @returns {Promise<{text: string, method: string, ocr: boolean, tables: number}>}
 */
async function extractTextFromFileDetailed(filePath, fileType) {
  try {
    logger.info(`Extracting text from ${filePath} of type ${fileType}`);

    switch (fileType) {
      case 'application/pdf':
        return await extractFromPdf(filePath);

      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await extractFromWord(filePath);

      case 'text/plain':
      case 'text/markdown':
      case 'text/html': {
        const text = await extractTextFromTxt(filePath);
        return { text, method: 'text', ocr: false, tables: countMarkdownTables(text) };
      }

      case 'image/png':
      case 'image/jpeg':
      case 'image/webp': {
        const text = await ocrWithGemini(filePath, fileType);
        return { text, method: 'ocr', ocr: true, tables: countMarkdownTables(text) };
      }

      case 'video/mp4':
      case 'video/mpeg':
      case 'video/quicktime':
      case 'video/x-msvideo':
      case 'video/webm':
        return { text: '', method: 'none', ocr: false, tables: 0 }; // Video has no text layer

      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    logger.error(`Error extracting text from ${filePath}:`, error);
    throw error;
  }
}

/** Backwards-compatible helper: text only. */
async function extractTextFromFile(filePath, fileType) {
  return (await extractTextFromFileDetailed(filePath, fileType)).text;
}

function countMarkdownTables(text) {
  return (String(text || '').match(/^\s*\|?\s*:?-{3,}:?\s*\|/gm) || []).length;
}

async function extractFromPdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  let text = '';
  let pages = 0;
  try {
    const data = await pdf(dataBuffer);
    text = data.text || '';
    pages = data.numpages || 1;
  } catch (error) {
    logger.warn(`PDF text layer unreadable (${error.message}); trying OCR`);
  }
  const scanned = text.trim().length < MIN_CHARS_PER_PAGE * Math.max(pages, 1);
  if (!scanned) return { text, method: 'text-layer', ocr: false, tables: 0 };
  try {
    const ocrText = await ocrWithGemini(filePath, 'application/pdf');
    if (ocrText.length > text.trim().length) {
      return { text: ocrText, method: 'ocr', ocr: true, tables: countMarkdownTables(ocrText) };
    }
  } catch (error) {
    logger.warn(`OCR failed for ${filePath}: ${error.message}`);
  }
  return { text, method: 'text-layer', ocr: false, tables: 0 };
}

function htmlTableToMarkdown(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cell[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()
    )
  );
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r) => [...r, ...Array(width - r.length).fill('')];
  const line = (r) => `| ${pad(r).join(' | ')} |`;
  return ['', line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line), ''].join('\n');
}

/** Word → text keeping tables as Markdown tables (raw text extraction flattens them). */
function wordHtmlToText(html) {
  let tables = 0;
  const withTables = html.replace(/<table[\s\S]*?<\/table>/gi, (t) => {
    tables += 1;
    return htmlTableToMarkdown(t);
  });
  const text = withTables
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => `\n${'#'.repeat(Number(level))} ${inner.replace(/<[^>]+>/g, '').trim()}\n`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner) => `\n- ${inner.replace(/<[^>]+>/g, '').trim()}`)
    .replace(/<\/p>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { text, tables };
}

async function extractFromWord(filePath) {
  try {
    const html = (await mammoth.convertToHtml({ path: filePath })).value;
    const { text, tables } = wordHtmlToText(html);
    if (text) return { text, method: 'docx-structured', ocr: false, tables };
  } catch (error) {
    logger.warn(`Structured Word extraction failed (${error.message}); using raw text`);
  }
  const text = await extractTextFromWord(filePath);
  return { text, method: 'raw-text', ocr: false, tables: 0 };
}

/**
 * Extract text from a PDF file
 * @param {string} filePath - Path to the PDF file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromPdf(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    logger.error(`Error extracting text from PDF ${filePath}:`, error);
    throw error;
  }
}

/**
 * Extract text from a Word document
 * @param {string} filePath - Path to the Word document
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromWord(filePath) {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } catch (error) {
    logger.error(`Error extracting text from Word document ${filePath}:`, error);
    throw error;
  }
}

/**
 * Extract text from a plain text file
 * @param {string} filePath - Path to the text file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromTxt(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    logger.error(`Error extracting text from text file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Calculate basic document metrics
 * @param {string} text - Document text content
 * @returns {Object} Document metrics
 */
function calculateDocumentMetrics(text) {
  const wordCount = text.split(/\s+/).length;
  const characterCount = text.length;
  const sentenceCount = text.split(/[.!?]+/).length - 1;
  const paragraphCount = text.split(/\n\s*\n/).length;
  
  return {
    wordCount,
    characterCount,
    sentenceCount,
    paragraphCount,
    averageWordLength: characterCount / wordCount,
    averageSentenceLength: wordCount / (sentenceCount || 1),
    averageParagraphLength: wordCount / (paragraphCount || 1)
  };
}

module.exports = {
  extractTextFromFile,
  extractTextFromFileDetailed,
  wordHtmlToText,
  countMarkdownTables,
  IMAGE_TYPES,
  calculateDocumentMetrics
}; 