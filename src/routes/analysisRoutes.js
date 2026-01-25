const express = require('express');
const router = express.Router();
const { startAnalysis, getAnalysis, getAllAnalyses, askQuestion, analyzeCompanyDocuments } = require('../controllers/analysisController');

// Start a new analysis for a company
router.post('/start', startAnalysis);

// Ask a specific question about company documents
router.post('/ask', askQuestion);

// Analyze specific documents
router.post('/:companyId/analyze-selected', analyzeCompanyDocuments);

// Get the latest analysis for a company
router.get('/:companyId', getAnalysis);

// Get all analyses for a company
router.get('/:companyId/all', getAllAnalyses);

module.exports = router; 