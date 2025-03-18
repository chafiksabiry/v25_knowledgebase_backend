const { logger } = require('../utils/logger');
const Document = require('../models/Document');
const Analysis = require('../models/Analysis');
const OpenAI = require('openai');
const dotenv = require('dotenv');
const { vertexAIService } = require('../config/vertexAIConfig');
const { getIO } = require('../config/socketConfig');

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

    // Prepare analysis queries
    const analysisQueries = [
      {
        type: 'topics',
        query: 'What are the main topics and themes covered in these documents? Please provide a structured analysis with main topics and subtopics.'
      },
      {
        type: 'gaps',
        query: 'What are the potential knowledge gaps or missing information in these documents? Consider completeness, clarity, and areas that might need more detail.'
      },
      {
        type: 'relationships',
        query: 'What are the key relationships and connections between different topics in these documents? How do they relate to each other?'
      },
      {
        type: 'recommendations',
        query: 'What specific recommendations can you make to improve this knowledge base? Consider organization, completeness, and clarity.'
      }
    ];

    // Execute analysis queries
    const analysisResults = {};
    for (const { type, query } of analysisQueries) {
      logger.info(`Running analysis query for ${type}...`);
      const response = await vertexAIService.queryKnowledgeBase(companyId, query);
      
      // Add debug logging
      logger.debug('Response structure:', JSON.stringify(response, null, 2));
      
      // Handle different response structures
      let resultText;
      if (response.candidates && response.candidates[0]) {
        if (response.candidates[0].content && response.candidates[0].content.parts) {
          resultText = response.candidates[0].content.parts[0].text;
        } else if (response.candidates[0].text) {
          resultText = response.candidates[0].text;
        } else if (typeof response.candidates[0] === 'string') {
          resultText = response.candidates[0];
        } else {
          logger.warn(`Unexpected response structure for ${type}:`, response);
          resultText = 'Analysis result structure not recognized';
        }
      } else if (response.text) {
        resultText = response.text;
      } else if (typeof response === 'string') {
        resultText = response;
      } else {
        logger.warn(`Unable to extract text from response for ${type}:`, response);
        resultText = 'Unable to extract analysis result';
      }

      analysisResults[type] = resultText;
    }

    return analysisResults;
  } catch (error) {
    logger.error('Error in RAG analysis:', error);
    throw error;
  }
}

// Start a new analysis
const startAnalysis = async (req, res) => {
  try {
    const { companyId } = req.body;
    const io = getIO();

    // Check if there's already an ongoing analysis
    const existingAnalysis = await Analysis.findOne({
      companyId,
      status: 'in_progress'
    });

    if (existingAnalysis) {
      return res.status(400).json({
        success: false,
        message: 'An analysis is already in progress for this company'
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

    // Emit analysis started event
    io.to(`company-${companyId}`).emit('analysis_update', {
      status: 'started',
      analysisId: analysis._id,
      progress: 0
    });

    // Start RAG analysis in the background
    analyzeDocumentsWithRAG(companyId, documents)
      .then(async (results) => {
        // Update analysis with results
        analysis.results = results;
        analysis.status = 'completed';
        analysis.endTime = new Date();
        await analysis.save();
        
        // Emit completion event with results
        io.to(`company-${companyId}`).emit('analysis_update', {
          status: 'completed',
          analysisId: analysis._id,
          progress: 100,
          results
        });
        
        logger.info(`Analysis completed for company ${companyId}`);
      })
      .catch(async (error) => {
        // Update analysis with error
        analysis.status = 'failed';
        analysis.error = error.message;
        analysis.endTime = new Date();
        await analysis.save();
        
        // Emit error event
        io.to(`company-${companyId}`).emit('analysis_update', {
          status: 'failed',
          analysisId: analysis._id,
          error: error.message
        });
        
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
3. STRUCTURE your response in a clear, user-friendly format
4. HIGHLIGHT key points, numbers, and comparisons using markdown formatting
5. PROVIDE practical insights and recommendations when relevant
6. If comparing options or levels, CREATE tables or structured comparisons
7. When numbers or specific data are available, INCLUDE them in your analysis

Question: ${query}

When answering:
- Start with a clear, direct answer to the question
- Use bullet points, tables, or sections to organize information
- Bold important terms and numbers for emphasis
- If the documents don't explicitly state something but it can be reasonably inferred from the provided information, you may include such insights while clearly indicating they are derived from the context
- If information is missing or unclear, specify what additional details would be helpful
- Use markdown formatting to make your response more readable

Context will be provided below. Please analyze it thoroughly and provide a comprehensive response that helps the user make informed decisions.`;
}

/**
 * Ask a specific question about company documents
 */
async function askQuestion(req, res) {
    try {
        const { companyId, query } = req.body;

        if (!companyId) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Company ID is required',
                    code: 'MISSING_COMPANY_ID'
                }
            });
        }

        if (!query) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'Query is required',
                    code: 'MISSING_QUERY'
                }
            });
        }

        logger.info(`Processing question for company ${companyId}:`, { query });

        // Get current documents from DB
        const documents = await Document.find({ companyId });
        
        if (!documents || documents.length === 0) {
            return res.status(400).json({
                success: false,
                error: {
                    message: 'No documents found for this company',
                    code: 'NO_DOCUMENTS'
                }
            });
        }

        // Initialize Vertex AI if not already initialized
        if (!vertexAIService.vertexAI) {
            logger.info('Initializing Vertex AI service...');
            vertexAIService.initialize();
        }

        // Check if RAG corpus exists and is up to date
        const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);
        const needsUpdate = !corpusStatus.exists || corpusStatus.documentCount !== documents.length;

        if (needsUpdate) {
            logger.info(`Updating RAG corpus for company ${companyId}...`);
            // Create/update the corpus with current documents
            await vertexAIService.createRagCorpus(companyId);
            await vertexAIService.importDocumentsToCorpus(companyId, documents);
            logger.info(`RAG corpus updated successfully for company ${companyId}`);
        } else {
            logger.info(`Using existing RAG corpus for company ${companyId}`);
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

        return res.json({
            success: true,
            data: {
                answer,
                metadata: {
                    processedAt: new Date().toISOString(),
                    model: process.env.VERTEX_AI_MODEL,
                    corpusStatus: {
                        wasUpdated: needsUpdate,
                        documentCount: documents.length
                    }
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

module.exports = {
  analyzeDocumentsWithRAG,
  startAnalysis,
  getAnalysis,
  getAllAnalyses,
  askQuestion,
  createContextAwarePrompt
}; 