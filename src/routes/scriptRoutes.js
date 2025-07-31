const express = require('express');
const router = express.Router();

const scriptController = require('../controllers/scriptController');

// Récupérer tous les scripts d'un gig
router.get('/gig/:gigId', scriptController.getScriptsForGig);
// Récupérer tous les scripts d'une société (avec gig peuplé)
router.get('/company/:companyId', scriptController.getScriptsForCompany);
// Mettre à jour le statut d'un script (activer/désactiver)
router.put('/:scriptId/status', scriptController.updateScriptStatus);
// Supprimer un script par son ID
router.delete('/:scriptId', scriptController.deleteScript);

module.exports = router; 