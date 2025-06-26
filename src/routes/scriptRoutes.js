const express = require('express');
const router = express.Router();

const scriptController = require('../controllers/scriptController');

// Récupérer tous les scripts d'un gig
router.get('/gig/:gigId', scriptController.getScriptsForGig);
// Récupérer tous les scripts d'une société (avec gig peuplé)
router.get('/company/:companyId', scriptController.getScriptsForCompany);

module.exports = router; 