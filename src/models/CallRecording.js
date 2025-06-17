const mongoose = require('mongoose');

const callRecordingSchema = new mongoose.Schema({
  contactId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  recordingUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  transcriptUrl: {
    type: String
  },

  analysis: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending'
    },
    summary: {
      type: Object,
      default: {
        keyIdeas: [],
        lastUpdated: null
      }
    },
    transcription: {
      status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
      },
      segments: [
        {
          start: { type: String, required: true }, // mm:ss.SSS
          end: { type: String, required: true },   // mm:ss.SSS
          speaker: { type: String },
          text: { type: String, required: true }
        }
      ],
      lastUpdated: { type: Date },
      error: { type: String, default: null }
    },
    error: String
  },
  sentiment: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    default: 'neutral'
  },
  tags: [{
    type: String
  }],
  aiInsights: [{
    type: String
  }],
  repId: {
    type: String,
    required: true
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  processingOptions: {
    transcription: {
      type: Boolean,
      default: true
    },
    sentiment: {
      type: Boolean,
      default: true
    },
    insights: {
      type: Boolean,
      default: true
    }
  },
  audioState: {
    isPlaying: Boolean,
    currentTime: Number,
    duration: Number,
    audioInstance: String,
    showPlayer: Boolean,
    showTranscript: Boolean
  }
});

module.exports = mongoose.model('CallRecording', callRecordingSchema); 