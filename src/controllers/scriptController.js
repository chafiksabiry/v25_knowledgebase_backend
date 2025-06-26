const Script = require('../models/Script');
const { logger } = require('../utils/logger');
const axios = require('axios');

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

/**
 * Get all scripts for all gigs of a given company, with gig populated
 * @param {Object} req - Express request object with companyId in params
 * @param {Object} res - Express response object
 */
const getScriptsForCompany = async (req, res) => {
  try {
    const { companyId } = req.params;
    if (!companyId) {
      return res.status(400).json({ error: 'companyId is required' });
    }
    // Fetch gigs for the company from the GIGS API
    const gigsApiUrl = process.env.GIGS_API_URL;
    const gigsResponse = await axios.get(`${gigsApiUrl}/gigs/company/${companyId}`);
    const gigs = Array.isArray(gigsResponse.data.data) ? gigsResponse.data.data : [];
    const gigMap = {};
    gigs.forEach(gig => { gigMap[gig._id] = gig; });
    // Get all scripts for these gigs
    const gigIds = gigs.map(g => g._id);
    const scripts = await Script.find({ gigId: { $in: gigIds } }).sort({ createdAt: -1 }).lean();
    // Populate gig info in each script
    const scriptsWithGig = scripts.map(script => ({ ...script, gig: gigMap[script.gigId?.toString()] || null }));
    res.status(200).json({ success: true, data: scriptsWithGig });
  } catch (error) {
    logger.error('Error fetching scripts for company:', error);
    res.status(500).json({ error: 'Failed to fetch scripts for company', details: error.message });
  }
};

/**
 * Delete a script by its ID
 * @param {Object} req - Express request object with scriptId in params
 * @param {Object} res - Express response object
 */
const deleteScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }

    const script = await Script.findById(scriptId);
    if (!script) {
      return res.status(404).json({ error: 'Script not found' });
    }

    await Script.findByIdAndDelete(scriptId);
    logger.info(`Script deleted successfully: ${scriptId}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'Script deleted successfully',
      data: { deletedScriptId: scriptId }
    });
  } catch (error) {
    logger.error('Error deleting script:', error);
    res.status(500).json({ 
      error: 'Failed to delete script', 
      details: error.message 
    });
  }
};

module.exports = {
  getScriptsForGig,
  getScriptsForCompany,
  deleteScript
}; 