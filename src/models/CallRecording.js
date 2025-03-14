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
  summary: {
    type: String
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