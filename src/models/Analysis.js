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
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    summary: { type: String },
    insights: [{
      title: { type: String, required: true },
      description: { type: String, required: true },
      category: { 
        type: String, 
        enum: ['gap', 'recommendation', 'strength', 'weakness'],
        required: true 
      },
      severity: { 
        type: String, 
        enum: ['high', 'medium', 'low']
      },
      confidence: { type: Number, required: true }
    }],
    metrics: {
      clarity: { type: Number },
      completeness: { type: Number },
      consistency: { type: Number },
      accuracy: { type: Number },
      relevance: { type: Number },
      overallScore: { type: Number }
    },
    contentGaps: [{
      description: { type: String, required: true },
      severity: { 
        type: String, 
        enum: ['high', 'medium', 'low'],
        required: true 
      },
      affectedSections: [{ type: String }],
      recommendation: { type: String }
    }],
    recommendations: [{
      description: { type: String, required: true },
      priority: { 
        type: String, 
        enum: ['high', 'medium', 'low'],
        required: true 
      },
      impact: { type: String, required: true },
      implementationDifficulty: { 
        type: String, 
        enum: ['easy', 'moderate', 'difficult']
      }
    }],
    keyTopics: [{ type: String }],
    companyId: { type: String },
    processingTime: { type: Number },
    error: { type: String }
  },
  { timestamps: true }
);

// Create and export the Analysis model
module.exports = mongoose.model('Analysis', AnalysisSchema); 