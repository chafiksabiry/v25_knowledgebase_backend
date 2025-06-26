const mongoose = require('mongoose');

const ScriptPhaseSchema = new mongoose.Schema({
  phase: { type: String, required: true },
  actor: { type: String, required: true }, // 'agent' or 'lead'
  replica: { type: String, required: true }
}, { _id: false });

const ScriptSchema = new mongoose.Schema({
  gigId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
  targetClient: { type: String, required: true }, // DISC
  language: { type: String, required: true },
  details: { type: String }, // context
  script: [ScriptPhaseSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Script', ScriptSchema); 