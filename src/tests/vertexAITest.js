const { vertexAIService } = require('../config/vertexAIConfig');
const { logger } = require('../utils/logger');

async function testVertexAI() {
  try {
    // Test initialization
    logger.info('Testing Vertex AI initialization...');
    await vertexAIService.initialize();
    logger.info('✓ Vertex AI initialized successfully');

    // Test company ID for testing
    const testCompanyId = '67d18e2b319c11009f4f2a98';

    // Test corpus creation
    logger.info('Testing RAG corpus creation...');
    const corpus = await vertexAIService.createRagCorpus(testCompanyId);
    logger.info('✓ RAG corpus created:', corpus);

    // Test document import with sample content
    const testDocuments = [
      {
        _id: 'doc1',
        fileUrl: 'https://raw.githubusercontent.com/example/doc1.txt',
        title: 'Introduction to RAG Systems',
        content: `Retrieval-Augmented Generation (RAG) is a powerful approach that combines the benefits of retrieval-based and generation-based models.
                 Key components of RAG systems include:
                 1. Document processing and chunking
                 2. Semantic search and retrieval
                 3. Context-aware generation
                 RAG systems help improve the accuracy and reliability of AI responses by grounding them in specific documents.`
      },
      {
        _id: 'doc2',
        fileUrl: 'https://raw.githubusercontent.com/example/doc2.txt',
        title: 'Best Practices for Knowledge Base Management',
        content: `Effective knowledge base management requires:
                 1. Regular content updates
                 2. Proper document organization
                 3. Quality control measures
                 4. User feedback integration
                 A well-maintained knowledge base improves information accessibility and user satisfaction.`
      }
    ];

    // Mock the fetchDocumentContent method for testing
    vertexAIService.fetchDocumentContent = async (url) => {
      const doc = testDocuments.find(d => d.fileUrl === url);
      return doc ? doc.content : null;
    };

    logger.info('Testing document import...');
    const importResult = await vertexAIService.importDocumentsToCorpus(testCompanyId, testDocuments);
    logger.info('✓ Documents imported:', importResult);

    // Test knowledge base query
    const testQuery = 'What are the main components of RAG systems and best practices for knowledge base management?';
    logger.info('Testing knowledge base query...');
    const queryResult = await vertexAIService.queryKnowledgeBase(testCompanyId, testQuery);
    logger.info('✓ Query result:', queryResult);

    logger.info('All tests completed successfully! ✨');
  } catch (error) {
    logger.error('Test failed:', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Run the tests
testVertexAI(); 