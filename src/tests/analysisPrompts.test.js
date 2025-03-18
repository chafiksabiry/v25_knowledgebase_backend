const { vertexAIService } = require('../config/vertexAIConfig');
const { logger } = require('../utils/logger');
const { analyzeDocumentsWithRAG } = require('../controllers/analysisController');
const Document = require('../models/Document');
const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    throw error;
  }
}

async function testRAGAnalysis() {
  try {
    logger.info('Starting RAG Analysis test...');

    // Real company ID
    const companyId = '67d18e2b319c11009f4f2a98';

    // Fetch real documents from the database
    const documents = await Document.find({ companyId });
    
    if (!documents || documents.length === 0) {
      throw new Error('No documents found for the specified company');
    }

    logger.info(`Found ${documents.length} documents for analysis`);
    
    // Log document titles for reference
    logger.info('Documents to analyze:');
    documents.forEach(doc => {
      logger.info(`- ${doc.title || doc.name} (${doc.type || 'no type'})`);
    });

    // Run RAG analysis
    logger.info('\nRunning RAG analysis on company documents...');
    const analysisResults = await analyzeDocumentsWithRAG(companyId, documents);

    // Log results for each analysis type
    logger.info('\nAnalysis Results:');
    for (const [type, result] of Object.entries(analysisResults)) {
      logger.info(`\n${type.toUpperCase()} ANALYSIS:`);
      logger.info(result);
    }

    return analysisResults;
  } catch (error) {
    logger.error('RAG Analysis test failed:', error);
    throw error;
  }
}

async function testContextAwarePrompts() {
  try {
    logger.info('Starting Context-Aware Prompts test...');

    // Real company ID
    const companyId = '67d18e2b319c11009f4f2a98';

    // Fetch real documents from the database
    const documents = await Document.find({ companyId });

    if (!documents || documents.length === 0) {
      throw new Error('No documents found for the specified company');
    }

    // Test queries based on common knowledge base questions
    const testQueries = [
      {
        query: "What are the main topics covered in our documentation?",
        description: "Overview of documentation coverage"
      },
      {
        query: "What are our current policies and procedures?",
        description: "Policy documentation check"
      },
      {
        query: "What technical requirements are mentioned in our documentation?",
        description: "Technical requirements analysis"
      },
      {
        query: "What are the key processes described in our documentation?",
        description: "Process documentation check"
      },
      {
        query: "Are there any security-related guidelines in our documentation?",
        description: "Security documentation check"
      }
    ];

    // Test each query
    logger.info('Testing specific queries against company documents...');
    for (const { query, description } of testQueries) {
      logger.info(`\n=== ${description} ===`);
      logger.info(`Query: "${query}"`);
      
      const response = await vertexAIService.queryKnowledgeBase(companyId, query);

      logger.info('Response:');
      logger.info(response.candidates[0].content.parts[0].text);
      logger.info('---');
    }

  } catch (error) {
    logger.error('Context-Aware Prompts test failed:', error);
    throw error;
  }
}

// Run the tests
async function runTests() {
  try {
    // Connect to MongoDB
    await connectDB();

    // Initialize Vertex AI
    await vertexAIService.initialize();

    // Test RAG Analysis
    logger.info('\n=== Testing RAG Analysis with Real Documents ===\n');
    await testRAGAnalysis();

    // Test Context-Aware Prompts
    logger.info('\n=== Testing Context-Aware Prompts with Real Documents ===\n');
    await testContextAwarePrompts();

    logger.info('\nAll tests completed successfully! ✨');

    // Close MongoDB connection
    await mongoose.connection.close();
  } catch (error) {
    logger.error('Tests failed:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests();
}

module.exports = {
  testRAGAnalysis,
  testContextAwarePrompts
}; 