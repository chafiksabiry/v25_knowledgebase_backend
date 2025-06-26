const Script = require('../models/Script');
const { logger } = require('../utils/logger');

/**
 * Get all scripts for a given gigId
 * @param {Object} req - Express request object with gigId in params
 * @param {Object} res - Express response object
 */
const getScriptsForGig = async (req, res) => {
  try {
    const { gigId } = req.params;
    if (!gigId) {
      return res.status(400).json({ error: 'gigId is required' });
    }
    const scripts = await Script.find({ gigId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: scripts });
  } catch (error) {
    logger.error('Error fetching scripts for gig:', error);
    res.status(500).json({ error: 'Failed to fetch scripts for gig', details: error.message });
  }
};

module.exports = {
  getScriptsForGig
}; 