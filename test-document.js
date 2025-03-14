require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3001';

async function testDocumentOperations() {
  try {
    // Create test files directory and sample file if they don't exist
    const testFilesDir = path.join(__dirname, 'test-files');
    if (!fs.existsSync(testFilesDir)) {
      fs.mkdirSync(testFilesDir);
    }

    const sampleFilePath = path.join(testFilesDir, 'sample.txt');
    if (!fs.existsSync(sampleFilePath)) {
      fs.writeFileSync(sampleFilePath, 'This is a sample document for testing purposes.\n\nIt contains multiple paragraphs and some basic content that can be processed by our system.\n\nWe can use this to test document uploading, processing, and analysis features.');
    }

    // 1. Upload a document
    console.log('Uploading document...');
    const form = new FormData();
    form.append('file', fs.createReadStream(sampleFilePath), {
      filename: 'sample.txt',
      contentType: 'text/plain'
    });
    form.append('name', 'Sample Document');
    form.append('description', 'A test document');
    form.append('tags', 'test,sample');
    form.append('uploadedBy', 'test-user');
    form.append('companyId', 'test-company');

    const uploadResponse = await axios.post(`${API_URL}/api/documents/upload`, form, {
      headers: {
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('Upload response:', uploadResponse.data);
    const uploadedDoc = uploadResponse.data.document;

    // 2. Get all documents
    console.log('\nFetching all documents...');
    const allDocsResponse = await axios.get(`${API_URL}/api/documents`);
    console.log('All documents:', allDocsResponse.data);

    // 3. Get specific document
    console.log('\nFetching uploaded document...');
    const docResponse = await axios.get(`${API_URL}/api/documents/${uploadedDoc.id}`);
    console.log('Document details:', docResponse.data);

    // 4. Update document
    console.log('\nUpdating document...');
    const updateResponse = await axios.put(`${API_URL}/api/documents/${uploadedDoc.id}`, {
      name: 'Updated Sample Document',
      description: 'Updated description',
      tags: 'test,sample,updated'
    });
    console.log('Update response:', updateResponse.data);

    // 5. Delete document
    console.log('\nDeleting document...');
    const deleteResponse = await axios.delete(`${API_URL}/api/documents/${uploadedDoc.id}`);
    console.log('Delete response:', deleteResponse.data);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
    }
  }
}

// Run the test
testDocumentOperations(); 