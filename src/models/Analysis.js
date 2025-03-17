const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for Analysis
const AnalysisSchema = new Schema(
  {
    documentId: { type: String, required: true },
    modelId: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['document', 'collection', 'knowledge-base'],
      default: 'document'
    },
    status: { 
      type: String, 
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress'
    },
    summary: { type: String },
    topicAnalysis: {
      coveredTopics: [{ type: String }],
      missingTopics: [{ type: String }],
      topicRelationships: [{
        from: { type: String },
        to: { type: String },
        relationship: { type: String }
      }]
    },
    contentQuality: {
      strengths: [{ type: String }],
      weaknesses: [{ type: String }],
      consistencyIssues: [{ type: String }]
    },
    recommendations: [{
      area: { 
        type: String, 
        enum: ['topic', 'structure', 'quality', 'accessibility']
      },
      description: { type: String },
      affectedDocuments: [{ type: String }],
      priority: { 
        type: String, 
        enum: ['high', 'medium', 'low']
      },
      effort: { 
        type: String, 
        enum: ['small', 'medium', 'large']
      }
    }],
    companyId: {
      type: String,
      required: true,
      index: true
    },
    processingTime: { type: Number },
    error: { type: String },
    // Progress tracking fields
    currentStage: {
      type: String,
      enum: ['idle', 'preprocessing', 'topic-analysis', 'batch-processing', 'final-analysis', 'saving-results'],
      default: 'idle'
    },
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    currentBatch: {
      type: Number,
      default: 0
    },
    totalBatches: {
      type: Number,
      default: 0
    },
    documentCount: {
      type: Number,
      required: true
    },
    documentIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document'
    }],
    startTime: {
      type: Date,
      required: true
    },
    endTime: {
      type: Date
    },
    results: {
      topics: {
        type: String
      },
      gaps: {
        type: String
      },
      relationships: {
        type: String
      },
      recommendations: {
        type: String
      }
    }
  },
  { timestamps: true }
);

// Add index for efficient querying
AnalysisSchema.index({ companyId: 1, startTime: -1 });

// Create and export the Analysis model
module.exports = mongoose.model('Analysis', AnalysisSchema); 