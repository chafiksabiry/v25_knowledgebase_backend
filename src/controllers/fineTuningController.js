const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const Document = require('../models/Document');
const FineTuningJob = require('../models/FineTuningJob');
const { logger } = require('../utils/logger');
const { prepareTrainingData } = require('../services/fineTuningService');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Create a new fine-tuning job
const createFineTuningJob = async (req, res) => {
  try {
    const { 
      documentIds, 
      model = process.env.FINE_TUNING_MODEL || 'gpt-3.5-turbo', 
      nEpochs = 3,
      description,
      companyId
    } = req.body;
    
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return res.status(400).json({ error: 'Document IDs are required' });
    }
    
    logger.info(`Creating fine-tuning job for ${documentIds.length} documents`);
    
    // Fetch documents
    const documents = await Document.find({ _id: { $in: documentIds } });
    
    if (documents.length === 0) {
      return res.status(404).json({ error: 'No documents found with the provided IDs' });
    }
    
    // Prepare training data
    const trainingData = await prepareTrainingData(documents);
    
    // Save training data to a file
    const trainingFilePath = path.join(__dirname, '../../uploads', `training-${Date.now()}.jsonl`);
    fs.writeFileSync(trainingFilePath, trainingData.join('\n'));
    
    // Upload training file to OpenAI
    const trainingFile = await openai.files.create({
      file: fs.createReadStream(trainingFilePath),
      purpose: 'fine-tune',
    });
    
    // Create fine-tuning job
    const fineTuningResponse = await openai.fineTuning.jobs.create({
      training_file: trainingFile.id,
      model,
      hyperparameters: {
        n_epochs: nEpochs
      }
    });
    
    // Save job to database
    const fineTuningJob = new FineTuningJob({
      jobId: fineTuningResponse.id,
      model: fineTuningResponse.fine_tuned_model || `ft:${model}:${companyId}:${Date.now()}`,
      baseModel: model,
      status: fineTuningResponse.status,
      trainingFileId: trainingFile.id,
      hyperparameters: {
        nEpochs
      },
      trainingDocuments: documentIds,
      description,
      companyId
    });
    
    await fineTuningJob.save();
    
    res.status(201).json({
      message: 'Fine-tuning job created successfully',
      job: {
        id: fineTuningJob._id,
        jobId: fineTuningJob.jobId,
        status: fineTuningJob.status,
        model: fineTuningJob.model,
        createdAt: fineTuningJob.createdAt
      }
    });
  } catch (error) {
    logger.error('Error creating fine-tuning job:', error);
    res.status(500).json({ error: 'Failed to create fine-tuning job' });
  }
};

// Get all fine-tuning jobs
const getAllFineTuningJobs = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    const query = companyId ? { companyId } : {};
    const jobs = await FineTuningJob.find(query);
    
    res.status(200).json({ jobs });
  } catch (error) {
    logger.error('Error fetching fine-tuning jobs:', error);
    res.status(500).json({ error: 'Failed to fetch fine-tuning jobs' });
  }
};

// Get a single fine-tuning job by ID
const getFineTuningJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await FineTuningJob.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Fine-tuning job not found' });
    }
    
    res.status(200).json({ job });
  } catch (error) {
    logger.error(`Error fetching fine-tuning job ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch fine-tuning job' });
  }
};

// Update fine-tuning job status
const updateFineTuningJobStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await FineTuningJob.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Fine-tuning job not found' });
    }
    
    // Get the latest status from OpenAI
    const openaiJob = await openai.fineTuning.jobs.retrieve(job.jobId);
    
    // Update job status
    job.status = openaiJob.status;
    
    // If job is completed, update the fine-tuned model
    if (openaiJob.status === 'succeeded' && openaiJob.fine_tuned_model) {
      job.fineTunedModel = openaiJob.fine_tuned_model;
      job.completedAt = new Date();
    }
    
    // If job failed, update the error
    if (openaiJob.status === 'failed') {
      job.error = openaiJob.error?.message || 'Unknown error';
    }
    
    await job.save();
    
    res.status(200).json({
      message: 'Fine-tuning job status updated',
      job: {
        id: job._id,
        jobId: job.jobId,
        status: job.status,
        fineTunedModel: job.fineTunedModel,
        error: job.error
      }
    });
  } catch (error) {
    logger.error(`Error updating fine-tuning job ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update fine-tuning job status' });
  }
};

// Cancel a fine-tuning job
const cancelFineTuningJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await FineTuningJob.findById(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Fine-tuning job not found' });
    }
    
    // Only cancel if job is still running
    if (job.status === 'running' || job.status === 'pending') {
      await openai.fineTuning.jobs.cancel(job.jobId);
      
      // Update job status
      job.status = 'cancelled';
      await job.save();
    }
    
    res.status(200).json({
      message: 'Fine-tuning job cancelled',
      job: {
        id: job._id,
        jobId: job.jobId,
        status: job.status
      }
    });
  } catch (error) {
    logger.error(`Error cancelling fine-tuning job ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to cancel fine-tuning job' });
  }
};

// Test fine-tuned model
const testFineTunedModel = async (req, res) => {
  try {
    const { modelId, content, systemPrompt } = req.body;
    
    if (!modelId || !content) {
      return res.status(400).json({ error: 'Model ID and content are required' });
    }

    // Use OpenAI API to test the model
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages: [
        {
          role: "system",
          content: systemPrompt || "You are an AI trained on APRIL documentation."
        },
        {
          role: "user",
          content: content
        }
      ],
      temperature: 0.7
    });

    res.status(200).json({
      result: completion.choices[0].message.content,
      usage: completion.usage
    });
  } catch (error) {
    logger.error('Error testing fine-tuned model:', error);
    res.status(500).json({ error: 'Failed to test fine-tuned model', details: error.message });
  }
};

module.exports = {
  createFineTuningJob,
  getAllFineTuningJobs,
  getFineTuningJobById,
  updateFineTuningJobStatus,
  cancelFineTuningJob,
  testFineTunedModel
}; 