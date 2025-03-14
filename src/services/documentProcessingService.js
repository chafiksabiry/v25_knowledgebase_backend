const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { logger } = require('../utils/logger');

/**
 * Extract text from a file based on its type
 * @param {string} filePath - Path to the file
 * @param {string} fileType - MIME type of the file
 * @returns {Promise<string>} Extracted text content
 */
async function extractTextFromFile(filePath, fileType) {
  try {
    logger.info(`Extracting text from ${filePath} of type ${fileType}`);
    
    // Handle different file types
    switch (fileType) {
      case 'application/pdf':
        return extractTextFromPdf(filePath);
        
      case 'application/msword':
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return extractTextFromWord(filePath);
        
      case 'text/plain':
        return extractTextFromTxt(filePath);
        
      case 'text/markdown':
      case 'text/html':
        return extractTextFromTxt(filePath); // Simple text extraction for markdown and HTML
        
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  } catch (error) {
    logger.error(`Error extracting text from ${filePath}:`, error);
    throw error;
  }
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
  calculateDocumentMetrics
}; 