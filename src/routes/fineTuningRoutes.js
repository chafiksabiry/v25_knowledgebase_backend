const express = require('express');
const router = express.Router();
const {
  createFineTuningJob,
  getAllFineTuningJobs,
  getFineTuningJobById,
  updateFineTuningJobStatus,
  cancelFineTuningJob,
  testFineTunedModel
} = require('../controllers/fineTuningController');

// Create a new fine-tuning job
router.post('/jobs', createFineTuningJob);

// Get all fine-tuning jobs
router.get('/jobs', getAllFineTuningJobs);

// Get a single fine-tuning job by ID
router.get('/jobs/:id', getFineTuningJobById);

// Update fine-tuning job status
router.put('/jobs/:id/status', updateFineTuningJobStatus);

// Cancel a fine-tuning job
router.post('/jobs/:id/cancel', cancelFineTuningJob);

// Test fine-tuned model
router.post('/test', testFineTunedModel);

module.exports = router; 