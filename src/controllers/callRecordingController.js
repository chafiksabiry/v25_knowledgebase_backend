const CallRecording = require('../models/CallRecording');
const Company = require('../models/Company');
const fs = require('fs').promises;
const path = require('path');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const { logger } = require('../utils/logger');

// Upload a new call recording
const uploadCallRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { contactId, date, duration, summary, sentiment, tags, aiInsights, repId, companyId } = req.body;

    // Validate companyId
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    // Upload to Cloudinary
    const filePath = req.file.path;
    const { url: recordingUrl, public_id: cloudinaryPublicId } = await uploadToCloudinary(filePath, 'call-recordings');

    // Create call recording record
    const callRecording = new CallRecording({
      contactId,
      date,
      duration,
      recordingUrl,
      cloudinaryPublicId,
      summary,
      sentiment,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      aiInsights: aiInsights ? aiInsights.split(',').map(insight => insight.trim()) : [],
      repId,
      companyId,
      processingOptions: {
        transcription: true,
        sentiment: true,
        insights: true
      },
      audioState: {
        isPlaying: false,
        currentTime: 0,
        duration: duration || 0,
        audioInstance: null,
        showPlayer: false,
        showTranscript: false
      }
    });

    await callRecording.save();

    // Delete local file after upload
    await fs.unlink(filePath);

    res.status(201).json({
      message: 'Call recording uploaded successfully',
      callRecording: {
        id: callRecording._id,
        contactId: callRecording.contactId,
        date: callRecording.date,
        duration: callRecording.duration,
        recordingUrl: callRecording.recordingUrl,
        summary: callRecording.summary,
        sentiment: callRecording.sentiment,
        tags: callRecording.tags,
        aiInsights: callRecording.aiInsights,
        repId: callRecording.repId,
        companyId: callRecording.companyId
      }
    });
  } catch (error) {
    logger.error('Error uploading call recording:', error);
    // Clean up local file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting local file:', unlinkError);
      }
    }
    res.status(500).json({ error: 'Failed to upload call recording' });
  }
};

const getCallRecordings = async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    const callRecordings = await CallRecording.find({ companyId });
    
    // Map the records to include id instead of _id
    const formattedRecordings = callRecordings.map(recording => ({
      id: recording._id,
      contactId: recording.contactId,
      date: recording.date,
      duration: recording.duration,
      recordingUrl: recording.recordingUrl,
      summary: recording.summary,
      sentiment: recording.sentiment,
      tags: recording.tags,
      aiInsights: recording.aiInsights,
      repId: recording.repId,
      companyId: recording.companyId
    }));

    res.status(200).json({ callRecordings: formattedRecordings });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch call recordings' });
  }
};

// Delete a call recording
const deleteCallRecording = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the call recording first
    const callRecording = await CallRecording.findById(id);
    if (!callRecording) {
      return res.status(404).json({ error: 'Call recording not found' });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(callRecording.cloudinaryPublicId);

    // Delete the record from the database
    await CallRecording.findByIdAndDelete(id);

    res.json({ message: 'Call recording deleted successfully' });
  } catch (error) {
    logger.error('Error deleting call recording:', error);
    res.status(500).json({ error: 'Failed to delete call recording' });
  }
};

module.exports = {
  uploadCallRecording,
  getCallRecordings,
  deleteCallRecording
}; 