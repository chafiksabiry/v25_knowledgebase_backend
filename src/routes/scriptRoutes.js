const express = require('express');
const router = express.Router();

const scriptController = require('../controllers/scriptController');
const { companyGuard, userGuard, from } = require('../middleware/routeGuards');

const script = companyGuard(from.script());

// Récupérer tous les scripts d'un gig
router.get('/gig/:gigId', companyGuard(from.gig((req) => req.params.gigId), { reps: true, services: ['kb-read'] }), scriptController.getScriptsForGig);

// Récupérer tous les scripts d'une société (avec gig peuplé)
router.get('/company/:companyId', companyGuard(from.param('companyId')), scriptController.getScriptsForCompany);

// Mettre à jour le statut d'un script (activer/désactiver)
router.put('/:scriptId/status', script, scriptController.updateScriptStatus);

// Régénérer complètement un script
router.post('/:scriptId/regenerate', script, scriptController.regenerateScript);

// Affiner une partie spécifique du script avec un prompt
router.post('/:scriptId/refine', script, scriptController.refineScriptPart);

// Modifier directement le contenu d'un script
router.put('/:scriptId/content', script, scriptController.updateScriptContent);

// Ajouter une nouvelle réplique à une phase spécifique
router.post('/:scriptId/replicas', script, scriptController.addReplica);

// Supprimer une réplique spécifique
router.delete('/:scriptId/replicas/:replicaIndex', script, scriptController.deleteReplica);

// Supprimer un script par son ID
router.delete('/:scriptId', script, scriptController.deleteScript);

module.exports = router; 