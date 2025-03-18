const { VertexAI } = require('@google-cloud/vertexai');
const dotenv = require('dotenv');
const { logger } = require('../utils/logger');
const path = require('path');
const axios = require('axios');
const fs = require('fs').promises;
const { extractTextFromFile } = require('../services/documentProcessingService');

dotenv.config();

// Ensure credentials path is absolute
const credentialsPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS);

// Vertex AI Configuration
const VERTEX_CONFIG = {
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.VERTEX_AI_LOCATION || 'us-central1',
  modelName: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash-001',
  credentials: credentialsPath
};

// RAG Configuration
const RAG_CONFIG = {
  chunkSize: 512,  // Size of text chunks for processing
  chunkOverlap: 100,  // Overlap between chunks to maintain context
  maxEmbeddingRequestsPerMin: 900,
  maxParsingRequestsPerMin: 120
};

class VertexAIService {
  constructor() {
    this.vertexAI = null;
    this.generativeModel = null;
    this.documentStore = new Map(); // In-memory store for document content
  }

  initialize() {
    try {
      if (!VERTEX_CONFIG.project) {
        throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set');
      }

      logger.info('Initializing Vertex AI with config:', {
        project: VERTEX_CONFIG.project,
        location: VERTEX_CONFIG.location,
        model: VERTEX_CONFIG.modelName
      });

      // Initialize Vertex AI
      this.vertexAI = new VertexAI({
        project: VERTEX_CONFIG.project,
        location: VERTEX_CONFIG.location,
        credentials: VERTEX_CONFIG.credentials
      });

      // Initialize the generative model
      this.generativeModel = this.vertexAI.preview.getGenerativeModel({
        model: VERTEX_CONFIG.modelName
      });

      logger.info('Vertex AI Service initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Vertex AI Service:', {
        error: error.message,
        stack: error.stack,
        config: VERTEX_CONFIG
      });
      throw error;
    }
  }

  async fetchDocumentContent(url) {
    try {
      // Create a temporary directory for downloads if it doesn't exist
      const tempDir = path.join(__dirname, '../../temp');
      await fs.mkdir(tempDir, { recursive: true });

      // Download the file
      const response = await axios({
        method: 'get',
        url: url,
        responseType: 'arraybuffer'
      });

      // Determine file type from URL or Content-Type header
      const fileType = response.headers['content-type'] || 'application/pdf';
      
      // Create a temporary file
      const tempFile = path.join(tempDir, `temp-${Date.now()}.pdf`);
      await fs.writeFile(tempFile, response.data);

      // Extract text from the file
      const extractedText = await extractTextFromFile(tempFile, fileType);

      // Clean up the temporary file
      await fs.unlink(tempFile);

      if (!extractedText) {
        throw new Error('Failed to extract text from document');
      }

      return extractedText;
    } catch (error) {
      logger.error(`Failed to fetch and process document from ${url}:`, error);
      return null;
    }
  }

  async createRagCorpus(companyId) {
    try {
      if (!this.vertexAI) {
        throw new Error('Vertex AI not initialized');
      }

      const corpusId = `company-${companyId}`;
      logger.info('Creating RAG corpus:', corpusId);

      // Initialize an empty corpus for the company
      this.documentStore.set(corpusId, []);

      const parent = `projects/${VERTEX_CONFIG.project}/locations/${VERTEX_CONFIG.location}`;
      
      logger.info(`Created RAG corpus for company ${companyId}`);
      return {
        name: `${parent}/corpuses/${corpusId}`,
        displayName: `Knowledge Base for Company ${companyId}`,
        status: 'CREATED'
      };
    } catch (error) {
      logger.error(`Failed to create RAG corpus for company ${companyId}:`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async importDocumentsToCorpus(companyId, documents) {
    try {
      if (!this.vertexAI) {
        throw new Error('Vertex AI not initialized');
      }

      logger.info(`Importing ${documents.length} documents for company ${companyId}`);
      const corpusId = `company-${companyId}`;
      const processedDocs = [];

      for (const doc of documents) {
        try {
          // Fetch and store document content
          const content = await this.fetchDocumentContent(doc.fileUrl);
          if (content) {
            // Store the document content in memory
            const docData = {
              id: doc._id,
              url: doc.fileUrl,
              content: content,
              title: doc.title
            };
            
            const corpus = this.documentStore.get(corpusId) || [];
            corpus.push(docData);
            this.documentStore.set(corpusId, corpus);

            processedDocs.push({
              id: doc._id,
              url: doc.fileUrl,
              status: 'PROCESSED'
            });
          }
        } catch (error) {
          logger.error(`Failed to process document ${doc._id}:`, error);
        }
      }

      logger.info(`Processed ${processedDocs.length} documents for company ${companyId}`);
      return {
        processedDocuments: processedDocs,
        status: 'SUCCESS'
      };
    } catch (error) {
      logger.error(`Failed to import documents for company ${companyId}:`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async queryKnowledgeBase(companyId, query) {
    try {
      if (!this.vertexAI) {
        throw new Error('Vertex AI not initialized');
      }

      const corpusId = `company-${companyId}`;
      const corpus = this.documentStore.get(corpusId) || [];

      if (corpus.length === 0) {
        throw new Error('No documents found in the knowledge base');
      }

      logger.info(`Querying knowledge base for company ${companyId}:`, { query });

      // Create a context from the stored documents
      const context = corpus.map(doc => `Document: ${doc.title}\nContent: ${doc.content}\n---\n`).join('\n');

      const prompt = `Using the following documents as context, please answer this question: "${query}"

Context:
${context}

Please provide a comprehensive answer based on the information in these documents.`;

      const result = await this.generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      });

      return result.response;
    } catch (error) {
      logger.error(`Failed to query knowledge base for company ${companyId}:`, {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async checkCorpusStatus(companyId) {
    try {
      if (!this.vertexAI) {
        throw new Error('Vertex AI not initialized');
      }

      const corpusId = `company-${companyId}`;
      const corpus = this.documentStore.get(corpusId);

      return {
        exists: !!corpus,
        documentCount: corpus ? corpus.length : 0
      };
    } catch (error) {
      logger.error(`Failed to check corpus status for company ${companyId}:`, error);
      throw error;
    }
  }
}

// Create and export a singleton instance
const vertexAIService = new VertexAIService();
module.exports = { vertexAIService, VERTEX_CONFIG, RAG_CONFIG }; 