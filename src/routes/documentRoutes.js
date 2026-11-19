const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  createSectorKnowledge,
  uploadDocument,
  getAllDocuments,
  getDocumentsByGig,
  getDocumentById,
  deleteDocument,
  updateDocument,
  analyzeDocument
} = require('../controllers/documentController');
const { companyGuard, userGuard, from } = require('../middleware/routeGuards');

const gigParam = from.gig((req) => req.params.gigId);

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

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
    'text/html',
    'image/png',
    'image/jpeg',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Word, TXT, MD, HTML, image (PNG, JPEG, WebP) and Video files are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload a new document
router.post('/upload', upload.single('file'), companyGuard(from.userId('body')), uploadDocument);

// AI-generated knowledge base of one sector case, attached to one gig
router.post('/sector-knowledge', companyGuard([from.userId('body'), from.gig((req) => req.body && req.body.gigId)]), createSectorKnowledge);

// Get all documents
router.get('/', companyGuard(from.userId('query'), { services: ['kb-read'] }), getAllDocuments);

// Get documents by gig (must be before /:id)
router.get('/gig/:gigId', companyGuard(gigParam, { reps: true, services: ['kb-read'] }), getDocumentsByGig);

// Get a single document by ID
router.get('/:id', companyGuard(from.document()), getDocumentById);

// Analyze a document
router.get('/:id/analysis', companyGuard(from.document()), analyzeDocument);

// Delete a document
router.delete('/:id', companyGuard(from.document()), deleteDocument);

// Update document metadata
router.put('/:id', companyGuard(from.document()), updateDocument);

module.exports = router; 