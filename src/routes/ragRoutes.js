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
  searchInCorpus,
  translateAnalysis,
  getKnowledgeReadiness
} = require('../controllers/ragController');

// Initialize RAG corpus for a company
router.post('/corpus/initialize', initializeCompanyCorpus);

// Sync documents to company's RAG corpus
router.post('/corpus/sync', syncDocumentsToCorpus);

// Query the knowledge base
router.post('/query', queryKnowledgeBase);

// Readiness of the knowledge base (documents usable by the REPS, analyses)
router.get('/readiness', getKnowledgeReadiness);
// Relevance / maturity score of the knowledge base (per gig) and passage search for AI agents
router.post('/score', require('../controllers/knowledgeInsightsController').getKnowledgeScore);
router.post(
  '/agent-search',
  require('../middleware/companyScope').authenticate({ serviceScopes: ['kb-agent-search'] }),
  require('../controllers/knowledgeInsightsController').agentSearch
);
router.post('/reindex', require('../controllers/ragController').reindexKnowledgeBase);

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

// Générer un script d'appel à partir du corpus RAG de la société
router.post('/generate-script', require('../controllers/ragController').generateScript);
router.post('/scripts', require('../controllers/ragController').createScript);
router.put('/scripts/:scriptId', require('../controllers/ragController').updateScript);
router.get('/scripts', require('../controllers/ragController').listScripts);
router.put('/scripts/:scriptId/status', require('../controllers/ragController').updateScriptStatus);
router.delete('/scripts/:scriptId', require('../controllers/ragController').deleteScript);

// Translate document analysis to English
router.post('/translate-analysis', translateAnalysis);

module.exports = router; 