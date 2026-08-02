const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { 
    uploadCallRecording, 
    getCallRecordings, 
    deleteCallRecording,
    getAudioSummary,
    getAudioTranscription,
    getCallScoring
} = require('../controllers/callRecordingController');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Retrieve call recordings for a given company
router.get('/', async (req, res) => {
  const { userId } = req.query;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  await getCallRecordings(req, res);
});

// Upload a new call recording
router.post('/upload', upload.single('file'), async (req, res, next) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  await uploadCallRecording(req, res, next);
});

// Delete a call recording
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Call Recording ID is required' });
  }
  await deleteCallRecording(req, res);
});

// Generate summary for a call recording
router.post('/:recordingId/analyze/summary', async (req, res) => {
  const { recordingId } = req.params;
  if (!recordingId) {
    return res.status(400).json({ error: 'Call Recording ID is required' });
  }
  await getAudioSummary(req, res);
});

// Generate transcription for a call recording
router.post('/:recordingId/analyze/transcription', async (req, res) => {
  const { recordingId } = req.params;
  if (!recordingId) {
    return res.status(400).json({ error: 'Call Recording ID is required' });
  }
  await getAudioTranscription(req, res);
});

// Generate scoring for a call recording
router.post('/:recordingId/analyze/scoring', async (req, res) => {
  const { recordingId } = req.params;
  if (!recordingId) {
    return res.status(400).json({ error: 'Call Recording ID is required' });
  }
  await getCallScoring(req, res);
});

module.exports = router; 