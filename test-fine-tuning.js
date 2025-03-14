require('dotenv').config();
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');

const API_URL = 'http://localhost:3000/api';

async function testFineTuning() {
  try {
    console.log('\n=== Testing Fine-Tuning Operations ===\n');

    // First, upload a test document to use for fine-tuning
    console.log('1. Uploading test document...');
    const formData = new FormData();
    const testFile = await fs.readFile(path.join(__dirname, 'test-data', 'sample.txt'));
    formData.append('file', Buffer.from(testFile), 'sample.txt');
    formData.append('name', 'Test Document');
    formData.append('description', 'A test document for fine-tuning');
    formData.append('tags', JSON.stringify(['test', 'fine-tuning']));

    const uploadResponse = await axios.post(`${API_URL}/documents/upload`, formData, {
      headers: formData.getHeaders()
    });
    console.log('Document uploaded:', uploadResponse.data);

    // Create a fine-tuning job
    console.log('\n2. Creating fine-tuning job...');
    const jobData = {
      model: 'gpt-3.5-turbo',
      baseModel: 'gpt-3.5-turbo',
      trainingDocuments: [uploadResponse.data._id],
      description: 'Test fine-tuning job',
      hyperparameters: {
        nEpochs: 3
      }
    };

    const createJobResponse = await axios.post(`${API_URL}/fine-tuning/jobs`, jobData);
    console.log('Fine-tuning job created:', createJobResponse.data);

    // Get all fine-tuning jobs
    console.log('\n3. Getting all fine-tuning jobs...');
    const getAllJobsResponse = await axios.get(`${API_URL}/fine-tuning/jobs`);
    console.log('All fine-tuning jobs:', getAllJobsResponse.data);

    // Get specific job
    console.log('\n4. Getting specific fine-tuning job...');
    const jobId = createJobResponse.data._id;
    const getJobResponse = await axios.get(`${API_URL}/fine-tuning/jobs/${jobId}`);
    console.log('Specific job details:', getJobResponse.data);

    // Update job description
    console.log('\n5. Updating fine-tuning job description...');
    const updateData = {
      description: 'Updated test fine-tuning job description'
    };
    const updateJobResponse = await axios.patch(`${API_URL}/fine-tuning/jobs/${jobId}`, updateData);
    console.log('Updated job:', updateJobResponse.data);

    // Cancel job (if possible)
    console.log('\n6. Attempting to cancel fine-tuning job...');
    const cancelJobResponse = await axios.post(`${API_URL}/fine-tuning/jobs/${jobId}/cancel`);
    console.log('Cancel job response:', cancelJobResponse.data);

    console.log('\n=== Fine-Tuning Tests Completed Successfully ===\n');
  } catch (error) {
    console.error('Error during fine-tuning tests:', error.response?.data || error.message);
  }
}

testFineTuning(); 