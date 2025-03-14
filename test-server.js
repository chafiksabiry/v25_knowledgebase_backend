require('dotenv').config();
const axios = require('axios');

const API_URL = 'http://localhost:3001';

async function testServer() {
  try {
    // Test the health endpoint
    console.log('Testing server health...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('Server health response:', healthResponse.data);
    
    // Test available routes
    console.log('\nTesting available routes...');
    try {
      const docsResponse = await axios.get(`${API_URL}/api/documents`);
      console.log('Documents route is working:', docsResponse.status === 200);
    } catch (error) {
      console.error('Documents route error:', error.message);
    }
    
    try {
      const jobsResponse = await axios.get(`${API_URL}/api/fine-tuning/jobs`);
      console.log('Fine-tuning jobs route is working:', jobsResponse.status === 200);
    } catch (error) {
      console.error('Fine-tuning jobs route error:', error.message);
    }
    
  } catch (error) {
    console.error('Server test failed:', error.message);
    console.log('Make sure your server is running on port 3001');
  }
}

testServer(); 