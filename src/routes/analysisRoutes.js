const express = require('express');
const router = express.Router();
const { startAnalysis, getAnalysis, getAllAnalyses, askQuestion } = require('../controllers/analysisController');
const { companyGuard, userGuard, from } = require('../middleware/routeGuards');

// Start a new analysis for a company
router.post('/start', companyGuard(from.body('companyId')), startAnalysis);

// Ask a specific question about company documents
router.post('/ask', companyGuard(from.userId('body')), askQuestion);

// Get the latest analysis for a company
router.get('/:companyId', companyGuard(from.param('companyId')), getAnalysis);

// Get all analyses for a company
router.get('/:companyId/all', companyGuard(from.param('companyId')), getAllAnalyses);

module.exports = router; 