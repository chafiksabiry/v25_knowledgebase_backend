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
const { companyGuard, userGuard, from } = require('../middleware/routeGuards');

const corpus = companyGuard(from.param('companyId'));
const script = companyGuard(from.script());

// Initialize RAG corpus for a company
router.post('/corpus/initialize', companyGuard(from.body('companyId')), initializeCompanyCorpus);

// Sync documents to company's RAG corpus
router.post('/corpus/sync', companyGuard(from.body('companyId')), syncDocumentsToCorpus);

// Query the knowledge base
router.post('/query', companyGuard([from.body('companyId'), from.gig((req) => req.body && req.body.gigId)], { services: ['kb-read'] }), queryKnowledgeBase);

// Readiness of the knowledge base (documents usable by the REPS, analyses)
router.get('/readiness', companyGuard(from.userId('query')), getKnowledgeReadiness);
// Relevance / maturity score of the knowledge base (per gig) and passage search for AI agents
router.post('/score', companyGuard(from.userId('body')), require('../controllers/knowledgeInsightsController').getKnowledgeScore);
router.post(
  '/agent-search',
  require('../middleware/companyScope').authenticate({ serviceScopes: ['kb-agent-search'] }),
  // the controller checks the company of the body (assertCompanyAccess)
  companyGuard([], { services: ['kb-agent-search'] }),
  require('../controllers/knowledgeInsightsController').agentSearch
);
router.post('/reindex', companyGuard(from.userId('body')), require('../controllers/ragController').reindexKnowledgeBase);

// Analyze a document
router.post('/analyze/:id', companyGuard(from.document()), analyzeDocument);

// **NOUVEAU : Endpoints pour visualiser le corpus RAG**

// Voir le statut du corpus
router.get('/corpus/:companyId/status', corpus, getCorpusStatus);

// Voir les documents du corpus
router.get('/corpus/:companyId/documents', corpus, getCorpusDocuments);

// Voir le contenu d'un document
router.get('/corpus/:companyId/documents/:documentId', corpus, companyGuard(from.document('documentId')), getDocumentContent);

// Voir les statistiques du corpus
router.get('/corpus/:companyId/stats', corpus, getCorpusStats);

// Rechercher dans le corpus
router.get('/corpus/:companyId/search', corpus, searchInCorpus);

// Générer un script d'appel à partir du corpus RAG de la société
router.post('/generate-script', companyGuard([from.body('companyId'), from.gig((req) => req.body && req.body.gig && req.body.gig._id)]), require('../controllers/ragController').generateScript);
router.post('/scripts', companyGuard(from.gig((req) => req.body && req.body.gigId)), require('../controllers/ragController').createScript);
router.put('/scripts/:scriptId', script, companyGuard(from.gig((req) => req.body && req.body.gigId)), require('../controllers/ragController').updateScript);
router.get('/scripts', companyGuard(from.gig((req) => req.query.gigId), { reps: true, services: ['kb-read'] }), require('../controllers/ragController').listScripts);
router.put('/scripts/:scriptId/status', script, require('../controllers/ragController').updateScriptStatus);
router.delete('/scripts/:scriptId', script, require('../controllers/ragController').deleteScript);

// Translate document analysis to English
router.post('/translate-analysis', userGuard(), translateAnalysis);

module.exports = router; 