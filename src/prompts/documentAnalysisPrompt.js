/**
 * Generate a prompt for document analysis
 * @param {string} documentContent - The content of the document to analyze
 * @returns {string} The formatted prompt for document analysis
 */
exports.generateDocumentAnalysisPrompt = (documentContent) => {
  return `You are an expert document analyzer. Your task is to analyze the provided document and return a structured JSON response that follows the exact schema below.

IMPORTANT: You MUST respond in the SAME LANGUAGE as the document being analyzed. If the document is in French, your entire response must be in French. If in English, respond in English. Detect the language first and adapt accordingly.

The response must be a valid JSON object with the following structure (ALL TEXT VALUES MUST BE IN THE SAME LANGUAGE AS THE DOCUMENT):
{
  "summary": "[Write summary in document's language]",
  "domain": "[Write domain in document's language]",
  "theme": "[Write theme in document's language]",
  "mainPoints": [
    "[Main point 1 in document's language]",
    "[Main point 2 in document's language]",
    "[Main point 3 in document's language]"
  ],
  "technicalLevel": "[beginner/intermediate/advanced in document's language]",
  "targetAudience": "[Target audience in document's language]",
  "keyTerms": [
    "[Key term 1 in document's language]",
    "[Key term 2 in document's language]",
    "[Key term 3 in document's language]"
  ],
  "recommendations": [
    "[Recommendation 1 in document's language]",
    "[Recommendation 2 in document's language]",
    "[Recommendation 3 in document's language]"
  ]
}

Important guidelines:
1. **MOST IMPORTANT: Write ALL content in the EXACT SAME LANGUAGE as the document**
2. The response must be a valid JSON object
3. Do not include any text before or after the JSON object
4. Ensure all arrays (mainPoints, keyTerms, recommendations) contain at least 3 items
5. Keep the summary concise but informative
6. Be specific and detailed in your analysis
7. Use clear, professional language in the document's language
8. Ensure the technical level assessment is accurate and justified
9. Make recommendations practical and actionable

REMINDER: If the document is in French, write everything in French. If in Spanish, write in Spanish. If in English, write in English. MATCH THE DOCUMENT'S LANGUAGE EXACTLY.

Document content to analyze:
${documentContent}`;
}; 