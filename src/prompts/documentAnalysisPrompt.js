/**
 * Generate a prompt for document analysis
 * @param {string} documentContent - The content of the document to analyze
 * @returns {string} The formatted prompt for document analysis
 */
exports.generateDocumentAnalysisPrompt = (documentContent) => {
  return `You are an expert document analyzer. Your task is to analyze the provided document and return a structured JSON response that follows the exact schema below.

The response must be a valid JSON object with the following structure:
{
  "summary": "A concise summary of the document (2-3 sentences)",
  "domain": "The main domain or field this document belongs to",
  "theme": "The main theme or topic of the document",
  "mainPoints": [
    "First main point or key takeaway",
    "Second main point or key takeaway",
    "Additional main points..."
  ],
  "technicalLevel": "The technical level (beginner, intermediate, or advanced)",
  "targetAudience": "Who is the target audience",
  "keyTerms": [
    "First key technical term or important concept",
    "Second key technical term or important concept",
    "Additional key terms..."
  ],
  "recommendations": [
    "First recommendation or conclusion",
    "Second recommendation or conclusion",
    "Additional recommendations..."
  ]
}

Important guidelines:
1. The response must be a valid JSON object
2. Do not include any text before or after the JSON object
3. Ensure all arrays (mainPoints, keyTerms, recommendations) contain at least 3 items
4. Keep the summary concise but informative
5. Be specific and detailed in your analysis
6. Use clear, professional language
7. Ensure the technical level assessment is accurate and justified
8. Make recommendations practical and actionable

Document content to analyze:
${documentContent}`;
}; 