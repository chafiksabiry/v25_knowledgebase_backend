const mongoose = require('mongoose');

const ScriptPhaseSchema = new mongoose.Schema({
  phase: { type: String, required: true },
  actor: { type: String, required: true }, // 'agent' or 'lead'
  replica: { type: String, required: true }
}, { _id: false });

const DialogueRowSchema = new mongoose.Schema({
  role: { type: String, enum: ['agent', 'lead'], required: true },
  text: { type: String, required: true }
}, { _id: false });

const LeadGuidanceSchema = new mongoose.Schema({
  leadLine: { type: String, required: true },
  suggestedAgentReplies: [{ type: String }]
}, { _id: false });

const TurnOptionSchema = new mongoose.Schema({
  leadReply: { type: String, required: true },
  agentReply: { type: String, required: true },
  nextTurnId: { type: String, default: null }
}, { _id: false });

const TurnSchema = new mongoose.Schema({
  id: { type: String, required: true },
  agentLine: { type: String, required: true },
  leadOptions: [TurnOptionSchema]
}, { _id: false });

const ScriptSchema = new mongoose.Schema({
  gigId: { type: mongoose.Schema.Types.ObjectId, ref: 'Gig', required: true },
  targetClient: { type: String, required: true }, // DISC
  language: { type: String, required: true },
  details: { type: String }, // context
  script: [ScriptPhaseSchema],
  playbook: {
    dialogue: [DialogueRowSchema],
    leadGuidance: [LeadGuidanceSchema],
    turns: [TurnSchema]
  },
  isActive: { type: Boolean, default: true }, // New field for script activation status
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Script', ScriptSchema); 