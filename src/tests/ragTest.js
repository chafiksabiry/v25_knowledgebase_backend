const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_COMPANY_ID = '67d18e2b319c11009f4f2a98'; // Replace with a valid company ID from your database

async function testRAGIntegration() {
  try {
    console.log('🚀 Starting RAG Integration Tests...\n');

    // Test 1: Initialize RAG Corpus
    console.log('Test 1: Initializing RAG Corpus');
    const initResponse = await axios.post(`${API_URL}/api/rag/corpus/initialize`, {
      companyId: TEST_COMPANY_ID
    });
    console.log('✅ Corpus Initialization Response:', initResponse.data);
    console.log('----------------------------------------\n');

    // Test 2: Sync Documents
    console.log('Test 2: Syncing Documents to Corpus');
    const syncResponse = await axios.post(`${API_URL}/api/rag/corpus/sync`, {
      companyId: TEST_COMPANY_ID
    });
    console.log('✅ Document Sync Response:', syncResponse.data);
    console.log('----------------------------------------\n');

    // Test 3: Query Knowledge Base
    console.log('Test 3: Querying Knowledge Base');
    const queryResponse = await axios.post(`${API_URL}/api/rag/query`, {
      companyId: TEST_COMPANY_ID,
      query: "What are the main topics covered in our documentation?"
    });
    console.log('✅ Query Response:', queryResponse.data);
    console.log('----------------------------------------\n');

    console.log('🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during testing:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the tests
testRAGIntegration(); 