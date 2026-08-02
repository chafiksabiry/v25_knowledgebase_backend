const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3001';

async function testRAGIntegration() {
  try {
    console.log('🧪 Testing RAG Integration...\n');

    // Create test files directory and sample file if they don't exist
    const testFilesDir = path.join(__dirname, 'test-files');
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir);
    }

    const sampleFilePath = path.join(testFilesDir, 'sample-rag-test.txt');
    if (!fs.existsSync(sampleFilePath)) {
      fs.writeFileSync(sampleFilePath, `This is a test document for RAG integration.

Key points to test:
1. Document upload should automatically add content to RAG corpus
2. Call recording upload should transcribe and add to RAG corpus
3. Knowledge base queries should include new content immediately

This document contains specific information about RAG testing that should be retrievable through the knowledge base.`);
    }

    // Test 1: Upload a document
    console.log('📄 Test 1: Uploading document...');
    const form = new FormData();
    form.append('file', fs.createReadStream(sampleFilePath), {
      filename: 'sample-rag-test.txt',
      contentType: 'text/plain'
    });
    form.append('name', 'RAG Test Document');
    form.append('description', 'A test document for RAG integration');
    form.append('tags', 'test,rag,integration');
    form.append('uploadedBy', 'test-user');
    form.append('userId', 'test-user-id');

    const uploadResponse = await axios.post(`${API_URL}/api/documents/upload`, form, {
      headers: {
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('✅ Document upload successful:', uploadResponse.data.message);
    const uploadedDoc = uploadResponse.data.document;

    // Test 2: Query the knowledge base immediately
    console.log('\n🔍 Test 2: Querying knowledge base...');
    const queryResponse = await axios.post(`${API_URL}/api/rag/query`, {
      companyId: 'test-company-id', // You'll need to use a real company ID
      query: 'What is RAG testing and what should be retrievable?'
    });

    console.log('✅ Knowledge base query successful');
    console.log('Response:', queryResponse.data.response);

    // Test 3: Test document deletion
    console.log('\n🗑️ Test 3: Deleting document...');
    const deleteResponse = await axios.delete(`${API_URL}/api/documents/${uploadedDoc.id}`);
    console.log('✅ Document deletion successful:', deleteResponse.data.message);

    console.log('\n🎉 All RAG integration tests completed successfully!');

  } catch (error) {
    console.error('❌ Error during RAG integration test:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

// Run the test
testRAGIntegration(); 