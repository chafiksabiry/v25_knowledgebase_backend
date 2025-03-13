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
  duration: Number,
  recordingUrl: {
    type: String,
    required: true
  },
  transcriptUrl: String,
  summary: String,
  sentiment: {
    type: String,
    enum: ['positive', 'negative', 'neutral'],
    default: 'neutral'
  },
  tags: [String],
  aiInsights: [String],
  repId: String,
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  processingOptions: {
    transcription: Boolean,
    sentiment: Boolean,
    insights: Boolean
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