const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for Document
const DocumentSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    fileUrl: { type: String, required: true },
    fileType: { type: String, required: true },
    content: { type: String, required: true },
    tags: [{ type: String }],
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    isProcessed: { type: Boolean, default: false },
    processingStatus: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    chunks: [{
      content: { type: String, required: true },
      index: { type: Number, required: true }
    }],
    metadata: {
      pageCount: { type: Number },
      wordCount: { type: Number },
      characterCount: { type: Number },
      createdAt: { type: Date, default: Date.now },
      modifiedAt: { type: Date },
      author: { type: String }
    },
    analysis: {
      summary: { type: String },
      keyTopics: [{ type: String }],
      sentimentScore: { type: Number },
      readabilityScore: { type: Number },
      gaps: [{
        description: { type: String, required: true },
        severity: { 
          type: String, 
          enum: ['high', 'medium', 'low'],
          required: true 
        }
      }],
      recommendations: [{ type: String }],
      lastAnalyzedAt: { type: Date }
    }
  },
  { timestamps: true }
);

// Create and export the Document model
module.exports = mongoose.model('Document', DocumentSchema); 