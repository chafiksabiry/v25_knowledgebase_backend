const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadCallRecording, getCallRecordings, deleteCallRecording } = require('../controllers/callRecordingController');

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
  const { companyId } = req.query;
  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required' });
  }
  await getCallRecordings(req, res);
});

// Upload a new call recording
router.post('/upload', upload.single('file'), async (req, res, next) => {
  const { companyId } = req.body;
  if (!companyId) {
    return res.status(400).json({ error: 'Company ID is required' });
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

module.exports = router; 