const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for Analysis
const AnalysisSchema = new Schema(
  {
    companyId: {
      type: String,
      required: true,
      index: true
    },
    status: { 
      type: String, 
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress'
    },
    type: { 
      type: String, 
      enum: ['document', 'collection', 'knowledge-base'],
      default: 'knowledge-base'
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
    error: { 
      type: String 
    },
    results: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    // Optional detailed analysis fields
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
    // Progress tracking fields
    progress: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    }
  },
  { 
    timestamps: true 
  }
);

// Add index for efficient querying
AnalysisSchema.index({ companyId: 1, startTime: -1 });

// Create and export the Analysis model
module.exports = mongoose.model('Analysis', AnalysisSchema); 