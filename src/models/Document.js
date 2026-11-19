const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema for Document
const DocumentSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    fileUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    fileType: { type: String, required: true },
    // Empty when nothing could be extracted (scan without OCR, video): the document is then flagged no_text
    content: { type: String, default: '' },
    tags: [{ type: String }],
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: String, required: true },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      required: true
    },
    gigId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Gig',
      required: false
    },
    isProcessed: { type: Boolean, default: false },
    processingStatus: { 
      type: String, 
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    processingError: { type: String, default: null },
    chunks: [{
      content: { type: String, required: true },
      index: { type: Number, required: true },
      // Search vector (semantic retrieval). Not `select: false`: that adds a `chunks.embedding` exclusion which
      // collides with the `-chunks` projection of the list queries (Mongo "Path collision"). It is stripped from
      // JSON output instead (see the toJSON transform below).
      embedding: { type: [Number], default: undefined }
    }],
    embeddingModel: { type: String, default: null },
    embeddedAt: { type: Date, default: null },
    // How the text was obtained: text-layer | ocr | docx-structured | raw-text | text | none
    extraction: {
      method: { type: String, default: null },
      ocr: { type: Boolean, default: false },
      tables: { type: Number, default: 0 }
    },
    metadata: {
      wordCount: { type: Number },
      characterCount: { type: Number },
      sentenceCount: { type: Number },
      paragraphCount: { type: Number },
      createdAt: { type: Date, default: Date.now },
      modifiedAt: { type: Date },
      author: { type: String }
    },
    analysis: {
      summary: String,
      domain: String,
      theme: String,
      mainPoints: [String],
      technicalLevel: String,
      targetAudience: String,
      keyTerms: [String],
      recommendations: [String],
      analyzedAt: Date
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        if (Array.isArray(ret.chunks)) ret.chunks.forEach((chunk) => delete chunk.embedding);
        return ret;
      }
    }
  }
);

// Create and export the Document model
module.exports = mongoose.model('Document', DocumentSchema); 