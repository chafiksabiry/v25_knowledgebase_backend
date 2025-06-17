const CallRecording = require('../models/CallRecording');
const Company = require('../models/Company');
const fs = require('fs').promises;
const path = require('path');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const { logger } = require('../utils/logger');
const { getAudioSummaryService, getAudioTranscriptionService, getAudioTranscriptionWhisperService, getCallScoringService } = require('../services/callAnalysisService');

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
        // Set summary to processing using $set
        await CallRecording.updateOne(
            { _id: recordingId },
            {
                $set: {
                    'analysis.summary': {
                        keyIdeas: recording.analysis?.summary?.keyIdeas || [],
                        lastUpdated: null
                    },
                    'analysis.status': 'processing',
                    'analysis.error': null
                }
            }
        );
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
            // Set summary to completed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.summary': {
                            keyIdeas,
                            lastUpdated: new Date()
                        },
                        'analysis.status': 'completed',
                        'analysis.error': null
                    }
                }
            );
            // Reload the document to get the latest summary
            const updatedRecording = await CallRecording.findById(recordingId);
            return res.json({
                message: 'Audio summary generated successfully',
                summary: updatedRecording.analysis.summary
            });
        } catch (error) {
            // Set summary to failed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.summary': recording.analysis?.summary || { keyIdeas: [], lastUpdated: null },
                        'analysis.status': 'failed',
                        'analysis.error': error.message
                    }
                }
            );
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

// Get audio transcription for a call recording
const getAudioTranscription = async (req, res) => {
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
        // Check if transcription is already completed
        if (recording.analysis?.transcription?.status === 'completed' && Array.isArray(recording.analysis.transcription.segments) && recording.analysis.transcription.segments.length > 0) {
            return res.json({
                message: 'Audio transcription retrieved from cache',
                transcription: recording.analysis.transcription
            });
        }
        // Set transcription to processing using $set
        await CallRecording.updateOne(
            { _id: recordingId },
            {
                $set: {
                    'analysis.transcription': {
                        status: 'processing',
                        segments: recording.analysis?.transcription?.segments || [],
                        lastUpdated: null,
                        error: null
                    }
                }
            }
        );
        try {
            // Get transcription from service
            let transcription = await getAudioTranscriptionService(recording.recordingUrl);
            // Ensure all segments have mm:ss.SSS format for start/end
            if (transcription && Array.isArray(transcription.segments)) {
                transcription.segments = transcription.segments.map(segment => ({
                    ...segment,
                    start: formatToMMSSSSS(segment.start),
                    end: formatToMMSSSSS(segment.end)
                }));
            }
            // Set transcription to completed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.transcription': transcription
                    }
                }
            );
            // Reload the document to get the latest transcription
            const updatedRecording = await CallRecording.findById(recordingId);
            return res.json({
                message: 'Audio transcription generated successfully',
                transcription: updatedRecording.analysis.transcription
            });
        } catch (error) {
            // Set transcription to failed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.transcription': {
                            status: 'failed',
                            segments: recording.analysis?.transcription?.segments || [],
                            lastUpdated: null,
                            error: error.message
                        }
                    }
                }
            );
            return res.status(500).json({
                error: 'Failed to generate audio transcription',
                details: error.message
            });
        }
    } catch (error) {
        logger.error('Error in getAudioTranscription controller:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};

// Get call scoring for a call recording
const getCallScoring = async (req, res) => {
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
        // Check if scoring is already completed
        if (recording.analysis?.scoring && recording.analysis?.scoring.status === 'completed') {
            return res.json({
                message: 'Call scoring retrieved from cache',
                scoring: recording.analysis.scoring
            });
        }
        // Set scoring to processing using $set
        await CallRecording.updateOne(
            { _id: recordingId },
            {
                $set: {
                    'analysis.scoring': {
                        status: 'processing',
                        result: null,
                        lastUpdated: null,
                        error: null
                    }
                }
            }
        );
        try {
            // Get scoring from service
            let scoring = await getCallScoringService(recording.recordingUrl);
            // Set scoring to completed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.scoring': {
                            status: 'completed',
                            result: scoring,
                            lastUpdated: new Date(),
                            error: null
                        }
                    }
                }
            );
            // Reload the document to get the latest scoring
            const updatedRecording = await CallRecording.findById(recordingId);
            return res.json({
                message: 'Call scoring generated successfully',
                scoring: updatedRecording.analysis.scoring
            });
        } catch (error) {
            // Set scoring to failed using $set
            await CallRecording.updateOne(
                { _id: recordingId },
                {
                    $set: {
                        'analysis.scoring': {
                            status: 'failed',
                            result: null,
                            lastUpdated: null,
                            error: error.message
                        }
                    }
                }
            );
            return res.status(500).json({
                error: 'Failed to generate call scoring',
                details: error.message
            });
        }
    } catch (error) {
        logger.error('Error in getCallScoring controller:', error);
        return res.status(500).json({
            error: 'Internal server error',
            details: error.message
        });
    }
};

// Helper to format time to mm:ss.SSS
function formatToMMSSSSS(time) {
    if (typeof time === 'string' && /^\d{2}:\d{2}\.\d{3}$/.test(time)) {
        return time; // already in correct format
    }
    // Try to parse as seconds or mm:ss
    let totalMs = 0;
    if (typeof time === 'number') {
        totalMs = Math.round(time * 1000);
    } else if (typeof time === 'string') {
        // mm:ss or mm:ss.SSS
        const match = time.match(/^(\d{2}):(\d{2})(\.(\d{1,3}))?$/);
        if (match) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const ms = match[4] ? match[4].padEnd(3, '0') : '000';
            return `${match[1]}:${match[2]}.${ms}`;
        } else if (/^\d+(\.\d+)?$/.test(time)) {
            // seconds as string
            totalMs = Math.round(parseFloat(time) * 1000);
        }
    }
    // Convert ms to mm:ss.SSS
    const min = String(Math.floor(totalMs / 60000)).padStart(2, '0');
    const sec = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, '0');
    const ms = String(totalMs % 1000).padStart(3, '0');
    return `${min}:${sec}.${ms}`;
}

module.exports = {
  uploadCallRecording,
  getCallRecordings,
  deleteCallRecording,
  getAudioSummary,
  getAudioTranscription,
  getCallScoring
}; 