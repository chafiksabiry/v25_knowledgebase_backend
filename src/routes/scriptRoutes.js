const express = require('express');
const router = express.Router();

const scriptController = require('../controllers/scriptController');

// Récupérer tous les scripts d'un gig
router.get('/gig/:gigId', scriptController.getScriptsForGig);

module.exports = router; 