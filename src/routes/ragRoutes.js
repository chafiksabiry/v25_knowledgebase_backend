const express = require('express');
const router = express.Router();
const { 
  initializeCompanyCorpus,
  queryKnowledgeBase,
  syncDocumentsToCorpus,
  analyzeDocument
} = require('../controllers/ragController');

// Initialize RAG corpus for a company
router.post('/corpus/initialize', initializeCompanyCorpus);

// Sync documents to company's RAG corpus
router.post('/corpus/sync', syncDocumentsToCorpus);

// Query the knowledge base
router.post('/query', queryKnowledgeBase);

// Analyze a document
router.post('/analyze/:id', analyzeDocument);

module.exports = router; 