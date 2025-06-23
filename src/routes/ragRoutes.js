const express = require('express');
const router = express.Router();
const { 
  initializeCompanyCorpus,
  queryKnowledgeBase,
  syncDocumentsToCorpus,
  analyzeDocument,
  getCorpusStatus,
  getCorpusDocuments,
  getDocumentContent,
  getCorpusStats,
  searchInCorpus
} = require('../controllers/ragController');

// Initialize RAG corpus for a company
router.post('/corpus/initialize', initializeCompanyCorpus);

// Sync documents to company's RAG corpus
router.post('/corpus/sync', syncDocumentsToCorpus);

// Query the knowledge base
router.post('/query', queryKnowledgeBase);

// Analyze a document
router.post('/analyze/:id', analyzeDocument);

// **NOUVEAU : Endpoints pour visualiser le corpus RAG**

// Voir le statut du corpus
router.get('/corpus/:companyId/status', getCorpusStatus);

// Voir les documents du corpus
router.get('/corpus/:companyId/documents', getCorpusDocuments);

// Voir le contenu d'un document
router.get('/corpus/:companyId/documents/:documentId', getDocumentContent);

// Voir les statistiques du corpus
router.get('/corpus/:companyId/stats', getCorpusStats);

// Rechercher dans le corpus
router.get('/corpus/:companyId/search', searchInCorpus);

module.exports = router; 