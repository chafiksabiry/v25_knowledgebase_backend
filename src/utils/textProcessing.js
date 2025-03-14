const { logger } = require('./logger');

/**
 * Split a document into chunks of approximately equal size
 * @param {string} text - The document text to chunk
 * @param {number} maxChunkSize - Maximum size of each chunk in characters (default: 2000)
 * @param {number} overlapSize - Number of characters to overlap between chunks (default: 200)
 * @returns {string[]} Array of text chunks
 */
function chunkDocument(text, maxChunkSize = 2000, overlapSize = 200) {
  try {
    // If text is smaller than max chunk size, return it as a single chunk
    if (text.length <= maxChunkSize) {
      return [text];
    }
    
    const chunks = [];
    let startIndex = 0;
    
    while (startIndex < text.length) {
      // Calculate end index for this chunk
      let endIndex = startIndex + maxChunkSize;
      
      // If we're at the end of the text, just use the remaining text
      if (endIndex >= text.length) {
        chunks.push(text.substring(startIndex));
        break;
      }
      
      // Try to find a natural break point (paragraph or sentence)
      const paragraphBreak = text.indexOf('\n\n', endIndex - 100);
      const sentenceBreak = findSentenceBreak(text, endIndex - 100, endIndex + 100);
      
      // Use the closest break point that's after our minimum chunk size
      if (paragraphBreak !== -1 && paragraphBreak < endIndex + 100) {
        endIndex = paragraphBreak + 2; // Include the paragraph break
      } else if (sentenceBreak !== -1) {
        endIndex = sentenceBreak;
      }
      
      // Add the chunk
      chunks.push(text.substring(startIndex, endIndex));
      
      // Move to next chunk with overlap
      startIndex = endIndex - overlapSize;
    }
    
    logger.info(`Split document into ${chunks.length} chunks`);
    return chunks;
  } catch (error) {
    logger.error('Error chunking document:', error);
    // Return the original text as a single chunk if there's an error
    return [text];
  }
}

/**
 * Find a sentence break near the target position
 * @param {string} text - The text to search in
 * @param {number} startPos - Starting position to search from
 * @param {number} endPos - Ending position to search to
 * @returns {number} Position of sentence break or -1 if not found
 */
function findSentenceBreak(text, startPos, endPos) {
  // Ensure we don't go out of bounds
  startPos = Math.max(0, startPos);
  endPos = Math.min(text.length, endPos);
  
  // Look for sentence-ending punctuation followed by a space or newline
  const searchText = text.substring(startPos, endPos);
  const matches = Array.from(searchText.matchAll(/[.!?]\s/g));
  
  if (matches.length > 0) {
    // Return the position of the last match
    const lastMatch = matches[matches.length - 1];
    return startPos + (lastMatch.index || 0) + 2; // +2 to include the punctuation and space
  }
  
  return -1;
}

/**
 * Calculate the similarity between two texts (simple implementation)
 * @param {string} text1 - First text
 * @param {string} text2 - Second text
 * @returns {number} Similarity score between 0 and 1
 */
function calculateTextSimilarity(text1, text2) {
  // Convert to lowercase and remove punctuation
  const normalize = (text) => {
    return text.toLowerCase().replace(/[^\w\s]/g, '');
  };
  
  const normalizedText1 = normalize(text1);
  const normalizedText2 = normalize(text2);
  
  // Get unique words from both texts
  const words1 = new Set(normalizedText1.split(/\s+/).filter(word => word.length > 0));
  const words2 = new Set(normalizedText2.split(/\s+/).filter(word => word.length > 0));
  
  // Count common words
  let commonCount = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      commonCount++;
    }
  }
  
  // Calculate Jaccard similarity
  const totalUniqueWords = new Set([...words1, ...words2]).size;
  return totalUniqueWords > 0 ? commonCount / totalUniqueWords : 0;
}

/**
 * Extract key terms from text
 * @param {string} text - The text to analyze
 * @param {number} maxTerms - Maximum number of terms to extract (default: 10)
 * @returns {string[]} Array of key terms
 */
function extractKeyTerms(text, maxTerms = 10) {
  // Simple implementation - count word frequency and return top N
  // In a real implementation, you might use TF-IDF or other NLP techniques
  
  // Normalize text
  const normalizedText = text.toLowerCase().replace(/[^\w\s]/g, '');
  
  // Split into words and count frequency
  const words = normalizedText.split(/\s+/).filter(word => word.length > 3); // Filter out short words
  const wordCounts = {};
  
  // Common English stop words to filter out
  const stopWords = new Set([
    'the', 'and', 'that', 'have', 'for', 'not', 'with', 'you', 'this', 'but',
    'his', 'from', 'they', 'she', 'will', 'would', 'there', 'their', 'what',
    'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know', 'take',
    'into', 'year', 'your', 'some', 'could', 'them', 'other', 'than', 'then',
    'look', 'only', 'come', 'over', 'think', 'also'
  ]);
  
  // Count word frequency
  for (const word of words) {
    if (!stopWords.has(word)) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
  }
  
  // Sort by frequency and return top terms
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(entry => entry[0]);
}

module.exports = {
  chunkDocument,
  calculateTextSimilarity,
  extractKeyTerms
}; 