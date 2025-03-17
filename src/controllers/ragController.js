const { vertexAIService } = require('../config/vertexAIConfig');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');

/**
 * Initialize a RAG corpus for a company
 * @param {Object} req - Express request object with companyId in body
 * @param {Object} res - Express response object
 */
const initializeCompanyCorpus = async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    logger.info(`Initializing Vertex AI for company ${companyId}`);
    
    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    logger.info('Creating RAG corpus...');
    // Create RAG corpus for the company
    const corpus = await vertexAIService.createRagCorpus(companyId);
    logger.info('RAG corpus created:', corpus);

    // Get all documents for the company
    const documents = await Document.find({ companyId });
    logger.info(`Found ${documents.length} documents for company ${companyId}`);

    // Import documents to the corpus if any exist
    if (documents.length > 0) {
      logger.info('Importing documents to corpus...');
      await vertexAIService.importDocumentsToCorpus(companyId, documents);
      logger.info('Documents imported successfully');
    }

    res.status(200).json({
      message: 'RAG corpus initialized successfully',
      corpus,
      documentsImported: documents.length
    });

  } catch (error) {
    logger.error('Error initializing RAG corpus:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data || error
    });
    
    res.status(500).json({ 
      error: 'Failed to initialize RAG corpus',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Sync documents to a company's RAG corpus
 * @param {Object} req - Express request object with companyId in body
 * @param {Object} res - Express response object
 */
const syncDocumentsToCorpus = async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    // Get all documents for the company
    const documents = await Document.find({ companyId });

    // Import documents to the corpus
    const result = await vertexAIService.importDocumentsToCorpus(companyId, documents);

    res.status(200).json({
      message: 'Documents synced to RAG corpus successfully',
      documentsImported: result.imported_rag_files_count
    });

  } catch (error) {
    logger.error('Error syncing documents to RAG corpus:', error);
    res.status(500).json({ error: 'Failed to sync documents to RAG corpus' });
  }
};

/**
 * Query the knowledge base using RAG
 * @param {Object} req - Express request object with companyId and query in body
 * @param {Object} res - Express response object
 */
const queryKnowledgeBase = async (req, res) => {
  try {
    const { companyId, query } = req.body;

    if (!companyId || !query) {
      return res.status(400).json({ error: 'Company ID and query are required' });
    }

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    // Query the knowledge base
    const response = await vertexAIService.queryKnowledgeBase(companyId, query);

    res.status(200).json({
      response: response.candidates[0].content,
      metadata: {
        citations: response.candidates[0].citationMetadata,
        safetyRatings: response.candidates[0].safetyRatings
      }
    });

  } catch (error) {
    logger.error('Error querying knowledge base:', error);
    res.status(500).json({ error: 'Failed to query knowledge base' });
  }
};

module.exports = {
  initializeCompanyCorpus,
  syncDocumentsToCorpus,
  queryKnowledgeBase
}; 