const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for FineTuningJob
const FineTuningJobSchema = new Schema(
  {
    jobId: { type: String, required: true, unique: true },
    model: { type: String, required: true },
    baseModel: { type: String, required: true },
    status: { 
      type: String, 
      enum: [
        'created',
        'pending',
        'running',
        'succeeded',
        'failed',
        'cancelled',
        'validating_files',
        'queued',
        'running',
        'succeeded',
        'failed',
        'cancelled'
      ],
      default: 'created'
    },
    fineTunedModel: { type: String },
    trainingFileId: { type: String, required: true },
    validationFileId: { type: String },
    hyperparameters: {
      nEpochs: { type: Number, required: true },
      batchSize: { type: Number },
      learningRateMultiplier: { type: Number }
    },
    trainingDocuments: [{ type: String, ref: 'Document' }],
    completedAt: { type: Date },
    error: { type: String },
    metrics: {
      trainLoss: { type: Number },
      validationLoss: { type: Number },
      epochCount: { type: Number }
    },
    description: { type: String },
    companyId: { type: String }
  },
  { timestamps: true }
);

// Create and export the FineTuningJob model
module.exports = mongoose.model('FineTuningJob', FineTuningJobSchema); 