const CallRecording = require('../models/CallRecording');
const Company = require('../models/Company');
const fs = require('fs').promises;
const path = require('path');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const { logger } = require('../utils/logger');
const { getAudioSummaryService } = require('../services/callAnalysisService');

// Upload a new call recording
const uploadCallRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { contactId, date, duration, summary, sentiment, tags, aiInsights, repId, userId } = req.body;

    // Validate companyId
    const company = await Company.findOne({ userId });
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
      companyId: company._id,
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
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const company = await Company.findOne({ userId });
    const callRecordings = await CallRecording.find({ companyId: company._id });
    
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

// Get audio summary for a call recording
const getAudioSummary = async (req, res) => {
    try {
        const { recordingId } = req.params;
        
        // Find the recording
        const recording = await CallRecording.findById(recordingId);
        if (!recording) {
            return res.status(404).json({ error: 'Call recording not found' });
        }

        // Check if recording has a file URL
        if (!recording.recordingUrl) {
            return res.status(400).json({ error: 'No audio file found for this recording' });
        }

        // Check if analysis is already completed
        if (recording.analysis?.status === 'completed' && recording.analysis?.summary?.keyIdeas?.length > 0) {
            return res.json({
                message: 'Audio summary retrieved from cache',
                summary: recording.analysis.summary
            });
        }

        // Update analysis status to processing
        recording.analysis = {
            status: 'processing',
            summary: recording.analysis?.summary || { keyIdeas: [], lastUpdated: null },
            error: null
        };
        await recording.save();

        try {
            // Get summary from service
            const summary = await getAudioSummaryService(recording.recordingUrl);
            
            // Transform the summary to match our schema
            const keyIdeas = summary['key-ideas'].map(idea => {
                const [title, description] = Object.entries(idea)[0];
                return {
                    title,
                    description
                };
            });

            // Update recording with summary
            recording.analysis = {
                status: 'completed',
                summary: {
                    keyIdeas,
                    lastUpdated: new Date()
                },
                error: null
            };
            await recording.save();

            return res.json({
                message: 'Audio summary generated successfully',
                summary: recording.analysis.summary
            });
        } catch (error) {
            // Update status on error
            recording.analysis = {
                status: 'failed',
                summary: recording.analysis?.summary || { keyIdeas: [], lastUpdated: null },
                error: error.message
            };
            await recording.save();
            
            logger.error('Error generating audio summary:', error);
            return res.status(500).json({ 
                error: 'Failed to generate audio summary',
                details: error.message 
            });
        }
    } catch (error) {
        logger.error('Error in getAudioSummary controller:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            details: error.message 
        });
    }
};

module.exports = {
  uploadCallRecording,
  getCallRecordings,
  deleteCallRecording,
  getAudioSummary
}; 