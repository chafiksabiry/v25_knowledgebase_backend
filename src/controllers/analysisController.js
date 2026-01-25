const { logger } = require('../utils/logger');
const Document = require('../models/Document');
const Analysis = require('../models/Analysis');
const Company = require('../models/Company');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { vertexAIService } = require('../config/vertexAIConfig');

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper functions for document processing
const extractDocumentSections = (content) => {
  // Simple section extraction based on common patterns
  const sections = {
    introduction: '',
    conclusion: '',
    mainContent: ''
  };

  // Try to identify introduction (first paragraph)
  const paragraphs = content.split('\n\n');
  if (paragraphs.length > 0) {
    sections.introduction = paragraphs[0];
  }

  // Try to identify conclusion (last paragraph)
  if (paragraphs.length > 1) {
    sections.conclusion = paragraphs[paragraphs.length - 1];
  }

  // Main content (everything in between)
  sections.mainContent = paragraphs.slice(1, -1).join('\n\n');

  return sections;
};

const extractMainTopics = (content) => {
  // Extract headings and main points
  const topics = new Set();

  // Look for markdown-style headings
  const headingMatches = content.match(/^#{1,3}\s+(.+)$/gm) || [];
  headingMatches.forEach(heading => {
    topics.add(heading.replace(/^#{1,3}\s+/, '').trim());
  });

  // Look for capitalized phrases that might be topics
  const potentialTopics = content.match(/[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){0,2}/g) || [];
  potentialTopics.forEach(topic => {
    if (topic.length > 3) {
      topics.add(topic.trim());
    }
  });

  return Array.from(topics).slice(0, 10); // Return top 10 topics
};

const extractKeyPoints = (content) => {
  const keyPoints = [];

  // Extract bullet points
  const bulletPoints = content.match(/[-*]\s+([^\n]+)/g) || [];
  bulletPoints.forEach(point => {
    keyPoints.push(point.replace(/[-*]\s+/, '').trim());
  });

  // Extract sentences that seem important (contain key phrases)
  const importantPhrases = [
    'important', 'note', 'key', 'must', 'should',
    'remember', 'essential', 'critical', 'crucial'
  ];

  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  sentences.forEach(sentence => {
    if (importantPhrases.some(phrase => sentence.toLowerCase().includes(phrase))) {
      keyPoints.push(sentence.trim());
    }
  });

  return keyPoints.slice(0, 5); // Return top 5 key points
};

const identifyTopics = (doc) => {
  const topics = new Set();

  // Add topics from tags
  if (doc.tags && doc.tags.length > 0) {
    doc.tags.forEach(tag => topics.add(tag));
  }

  // Add topics from title/name
  const titleWords = doc.name.split(/\s+/)
    .filter(word => word.length > 3)
    .map(word => word.toLowerCase());
  titleWords.forEach(word => topics.add(word));

  // Add topics from content headings
  const extractedTopics = extractMainTopics(doc.content);
  extractedTopics.forEach(topic => topics.add(topic));

  return Array.from(topics);
};

const calculateTopicRelevance = (doc, topic) => {
  const topicLower = topic.toLowerCase();
  let relevance = 0;

  // Check title relevance
  if (doc.name.toLowerCase().includes(topicLower)) relevance += 3;

  // Check tags relevance
  if (doc.tags.some(tag => tag.toLowerCase().includes(topicLower))) relevance += 2;

  // Check content relevance (basic word frequency)
  const wordCount = (doc.content.toLowerCase().match(new RegExp(topicLower, 'g')) || []).length;
  relevance += Math.min(wordCount / 10, 5); // Cap at 5 points

  return Math.min(relevance / 10, 1); // Normalize to 0-1
};

// Helper function to analyze documents using RAG
async function analyzeDocumentsWithRAG(companyId, documents) {
  try {
    // Initialize RAG corpus for the company
    await vertexAIService.createRagCorpus(companyId);

    // Import documents to the corpus
    await vertexAIService.importDocumentsToCorpus(companyId, documents);

    // Single comprehensive query with all three aspects
    const query = `Analyze the provided documents comprehensively to identify topics, knowledge gaps, and recommendations. 
Return your analysis as a structured JSON object with three main sections:

{
  "topicAnalysis": {
    "summary": "Brief 2-3 sentence overview of main topics",
    "mainTopics": [
      {
        "topic": "Name of topic",
        "description": "Brief description",
        "relatedDocuments": [
          {
            "id": "document id if available, otherwise omit this field",
            "name": "document name",
            "relevance": "Brief explanation of relevance"
          }
        ]
      }
    ]
  },
  "knowledgeGaps": {
    "summary": "Brief overview of main gaps",
    "gaps": [
      {
        "gap": "Description of the gap",
        "impact": "Brief description of the impact",
        "affectedAreas": ["Area 1", "Area 2"],
        "relatedDocuments": [
          {
            "id": "document id if available, otherwise omit this field",
            "name": "document name",
            "context": "Why this document is relevant to the gap"
          }
        ]
      }
    ]
  },
  "recommendations": {
    "summary": "Brief overview of recommendations",
    "priorities": [
      {
        "recommendation": "Specific recommendation",
        "priority": "HIGH|MEDIUM|LOW",
        "rationale": "Brief explanation",
        "implementation": "Quick implementation guide",
        "relatedGaps": ["Reference to specific gaps"],
        "affectedDocuments": [
          {
            "id": "document id if available, otherwise omit this field",
            "name": "document name"
          }
        ]
      }
    ]
  }
}

Ensure your response contains only valid JSON - no introductory or explanatory text before or after the JSON structure.`;

    // Execute the single unified query
    logger.info(`Running comprehensive analysis query for company ${companyId}...`);
    const response = await vertexAIService.queryKnowledgeBase(companyId, query);

    // Handle different response structures and parse JSON
    let resultText;
    if (response.candidates && response.candidates[0]) {
      if (response.candidates[0].content && response.candidates[0].content.parts) {
        resultText = response.candidates[0].content.parts[0].text;
      } else if (response.candidates[0].text) {
        resultText = response.candidates[0].text;
      } else if (typeof response.candidates[0] === 'string') {
        resultText = response.candidates[0];
      } else {
        logger.warn(`Unexpected response structure:`, response);
        resultText = 'Analysis result structure not recognized';
      }
    } else if (response.text) {
      resultText = response.text;
    } else if (typeof response === 'string') {
      resultText = response;
    } else {
      logger.warn(`Unable to extract text from response:`, response);
      resultText = 'Unable to extract analysis result';
    }

    // Parse the JSON response
    try {
      let parsedResult;
      if (typeof resultText === 'string') {
        // Extract JSON from the text if it's embedded (looking for { } pattern)
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : resultText;
        parsedResult = JSON.parse(jsonString);
      } else {
        parsedResult = resultText;
      }

      return parsedResult;
    } catch (e) {
      logger.error('Failed to parse analysis results as JSON:', e);
      // Return a simplified structure with the error message
      return {
        error: "Failed to parse analysis results as JSON",
        rawText: resultText
      };
    }
  } catch (error) {
    logger.error('Error in RAG analysis:', error);
    throw error;
  }
}

// Start a new analysis
const startAnalysis = async (req, res) => {
  try {
    const { companyId } = req.body;

    // Enhanced check for ongoing analysis
    const ongoingAnalyses = await Analysis.find({
      companyId,
      status: 'in_progress',
      startTime: { $gt: new Date(Date.now() - 30 * 60 * 1000) } // Within the last 30 minutes
    });

    if (ongoingAnalyses.length > 0) {
      logger.warn(`Rejected analysis request: Analysis already in progress for company ${companyId}`);
      return res.status(429).json({
        success: false,
        message: 'An analysis is already in progress for this company',
        analysisId: ongoingAnalyses[0]._id
      });
    }

    // Rate limiting - check if there was a recent analysis (success or failure) in the past 10 seconds
    const recentAnalyses = await Analysis.find({
      companyId,
      startTime: { $gt: new Date(Date.now() - 10 * 1000) } // Within the last 10 seconds
    });

    if (recentAnalyses.length > 0) {
      logger.warn(`Rejected analysis request: Rate limit exceeded for company ${companyId}`);
      return res.status(429).json({
        success: false,
        message: 'Please wait at least 10 seconds between analysis requests'
      });
    }

    // Check if we need to run a new analysis
    const latestAnalysis = await Analysis.findOne({
      companyId,
      status: 'completed'
    }).sort({ startTime: -1 });

    // Get current documents
    const documents = await Document.find({ companyId });

    if (!documents || documents.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No documents found for analysis'
      });
    }

    // Check if we need a new analysis
    if (latestAnalysis && latestAnalysis.documentCount === documents.length) {
      // Return existing analysis if document count hasn't changed
      return res.status(200).json({
        success: true,
        message: 'Using existing analysis',
        analysisId: latestAnalysis._id,
        results: latestAnalysis.results
      });
    }

    // Create new analysis record
    const analysis = new Analysis({
      companyId,
      status: 'in_progress',
      documentCount: documents.length,
      documentIds: documents.map(doc => doc._id),
      startTime: new Date()
    });

    await analysis.save();

    // Start RAG analysis in the background
    analyzeDocumentsWithRAG(companyId, documents)
      .then(async (results) => {
        // Update analysis with results
        analysis.results = results;
        analysis.status = 'completed';
        analysis.endTime = new Date();
        await analysis.save();

        logger.info(`Analysis completed for company ${companyId}`);
      })
      .catch(async (error) => {
        // Update analysis with error
        analysis.status = 'failed';
        analysis.error = error.message;
        analysis.endTime = new Date();
        await analysis.save();

        logger.error(`Analysis failed for company ${companyId}:`, error);
      });

    return res.status(200).json({
      success: true,
      message: 'Analysis started successfully',
      analysisId: analysis._id
    });
  } catch (error) {
    logger.error('Error starting analysis:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start analysis',
      error: error.message
    });
  }
};

// Get analysis status and results
const getAnalysis = async (req, res) => {
  try {
    const { companyId } = req.params;

    // Get the latest analysis for the company
    const analysis = await Analysis.findOne({ companyId })
      .sort({ startTime: -1 });

    return res.status(200).json({
      exists: !!analysis,
      analysis: analysis || null
    });
  } catch (error) {
    logger.error('Error fetching analysis:', error);
    return res.status(500).json({
      message: 'Failed to fetch analysis',
      error: error.message
    });
  }
};

// Get all analyses for a company
const getAllAnalyses = async (req, res) => {
  try {
    const { companyId } = req.params;

    const analyses = await Analysis.find({ companyId })
      .sort({ startTime: -1 });

    return res.status(200).json(analyses);
  } catch (error) {
    logger.error('Error fetching analyses:', error);
    return res.status(500).json({
      message: 'Failed to fetch analyses',
      error: error.message
    });
  }
};

// Helper function to create a context-aware prompt
function createContextAwarePrompt(query, companyContext = {}) {
  return `You are an expert AI assistant with deep knowledge in analyzing and interpreting business documents. You have access to ${companyContext.companyName || 'the company'}'s knowledge base.

Your task is to provide comprehensive, analytical, and actionable insights based on the information in the documents. While staying faithful to the source material, you should:

1. ANALYZE the information thoroughly
2. SYNTHESIZE related information from different parts of the documents
3. STRUCTURE your response in a clear, user-friendly format using HTML
4. HIGHLIGHT key points, numbers, and comparisons using HTML formatting
5. PROVIDE practical insights and recommendations when relevant
6. If comparing options or levels, CREATE HTML tables or structured comparisons
7. When numbers or specific data are available, INCLUDE them in your analysis

Question: ${query}

When answering:
- Start with a clear, direct answer to the question
- Use HTML bullet points (<ul>, <li>), tables (<table>, <tr>, <td>), or sections (<div>, <h3>, <h4>) to organize information
- Use <strong> tags for important terms and numbers for emphasis
- Use <em> tags for emphasis on key insights
- If the documents don't explicitly state something but it can be reasonably inferred from the provided information, you may include such insights while clearly indicating they are derived from the context
- If information is missing or unclear, specify what additional details would be helpful
- Use proper HTML formatting to make your response more readable and structured
- Wrap your entire response in a <div> container

Context will be provided below. Please analyze it thoroughly and provide a comprehensive response that helps the user make informed decisions.`;
}

/**
 * Ask a specific question about company documents
 */
async function askQuestion(req, res) {
  try {
    const { userId, query } = req.body;
    if (!userId || !query) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'User ID and query are required',
          code: 'MISSING_USER_ID_AND_QUERY'
        }
      });
    }

    // Get companyId from userId
    const company = await Company.findOne({ userId });
    const companyId = company._id;

    logger.info(`Processing question for company ${companyId}:`, { query });

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      logger.info('Initializing Vertex AI service...');
      await vertexAIService.initialize();
    }

    // **MODIFIÉ : Récupère le statut complet et détaillé du corpus**
    const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);

    // Si le corpus est vide, on peut s'arrêter ici.
    if (!corpusStatus.exists) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No documents or call recordings found in the knowledge base for this company.',
          code: 'CORPUS_EMPTY'
        }
      });
    }

    // Create a context-aware prompt
    const contextAwarePrompt = createContextAwarePrompt(query);

    // Query the knowledge base using Vertex AI
    const response = await vertexAIService.queryKnowledgeBase(companyId, contextAwarePrompt);

    // Handle different response structures
    let answer;
    if (response.candidates && response.candidates[0]) {
      if (response.candidates[0].content && response.candidates[0].content.parts) {
        answer = response.candidates[0].content.parts[0].text;
      } else if (response.candidates[0].text) {
        answer = response.candidates[0].text;
      } else {
        answer = response.candidates[0];
      }
    } else if (response.text) {
      answer = response.text;
    } else if (typeof response === 'string') {
      answer = response;
    } else {
      throw new Error('Unexpected response structure from Vertex AI');
    }

    // **FINAL FIX: Clean up response to remove markdown code blocks (handles both backticks and single quotes)**
    const cleanedAnswer = answer.replace(/^(?:```|''')(?:html)?\s*|\s*(?:```|''')$/g, '').trim();

    return res.json({
      success: true,
      data: {
        answer: cleanedAnswer,
        metadata: {
          processedAt: new Date().toISOString(),
          model: process.env.VERTEX_AI_MODEL,
          // **MODIFIÉ : Renvoie l'objet de statut complet**
          corpusStatus: corpusStatus
        }
      }
    });

  } catch (error) {
    logger.error('Error processing question:', error);
    return res.status(500).json({
      success: false,
      error: {
        message: 'Failed to process question',
        code: 'PROCESSING_ERROR',
        details: error.message
      }
    });
  }
}

// Controller function to analyze company documents with RAG
const analyzeCompanyDocuments = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { documentIds } = req.body;

    // Check for ongoing analysis for this company
    const ongoingAnalysis = await Analysis.findOne({
      companyId,
      status: 'in_progress'
    });

    if (ongoingAnalysis) {
      return res.status(429).json({
        message: 'Analysis already in progress for this company',
        analysisId: ongoingAnalysis._id
      });
    }

    // Fetch documents from database
    let documents = [];
    if (documentIds && documentIds.length > 0) {
      documents = await Document.find({
        _id: { $in: documentIds },
        companyId
      });
    } else {
      documents = await Document.find({ companyId });
    }

    if (!documents || documents.length === 0) {
      return res.status(404).json({
        message: 'No documents found for analysis'
      });
    }

    // Create new analysis record
    const analysis = new Analysis({
      companyId,
      status: 'in_progress',
      type: 'rag',
      documentCount: documents.length,
      documentIds: documents.map(doc => doc._id),
      startTime: new Date()
    });

    await analysis.save();

    // Run RAG analysis in the background
    (async () => {
      try {
        // Format documents for RAG processing
        const formattedDocs = documents.map(doc => ({
          id: doc._id.toString(),
          name: doc.title || 'Untitled',
          content: doc.content
        }));

        // Perform analysis
        const analysisResults = await analyzeDocumentsWithRAG(companyId, formattedDocs);

        // Update analysis record with results
        analysis.status = 'completed';
        analysis.endTime = new Date();
        analysis.results = analysisResults;

        await analysis.save();
        logger.info(`Analysis completed for company ${companyId}`);
      } catch (error) {
        // Update analysis record with error
        analysis.status = 'failed';
        analysis.endTime = new Date();
        analysis.error = error.message || 'Unknown error occurred during analysis';

        await analysis.save();
        logger.error(`Analysis failed for company ${companyId}:`, error);
      }
    })();

    // Return immediate response with analysis ID
    return res.status(202).json({
      message: 'Analysis started',
      analysisId: analysis._id
    });
  } catch (error) {
    logger.error('Error initiating analysis:', error);
    return res.status(500).json({
      message: 'Failed to initiate analysis',
      error: error.message
    });
  }
};

module.exports = {
  analyzeDocumentsWithRAG,
  startAnalysis,
  getAnalysis,
  getAllAnalyses,
  askQuestion,
  createContextAwarePrompt,
  analyzeCompanyDocuments
}; 