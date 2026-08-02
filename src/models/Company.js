const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  name: { type: String, required: true },
  industry: String,
  founded: String,
  headquarters: String,
  overview: { type: String, required: true },
  mission: String,
  culture: {
    values: [String],
    benefits: [String],
    workEnvironment: String
  },
  opportunities: {
    roles: [String],
    growthPotential: String,
    training: String
  },
  technology: {
    stack: [String],
    innovation: String
  },
  contact: {
    email: String,
    phone: String,
    address: String,
    website: String,
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  socialMedia: {
    linkedin: String,
    twitter: String,
    facebook: String,
    instagram: String
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Company', companySchema); 