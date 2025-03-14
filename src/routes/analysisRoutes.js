const express = require('express');
const router = express.Router();
const { analyzeKnowledgeBase, getAnalysisById, getAllAnalyses } = require('../controllers/analysisController');

// Route to analyze the entire knowledge base
router.post('/knowledge-base', analyzeKnowledgeBase);

// Route to get a specific analysis by ID
router.get('/:id', getAnalysisById);

// Route to get all analyses for a company
router.get('/', getAllAnalyses);

module.exports = router; 