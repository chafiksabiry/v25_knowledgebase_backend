const express = require('express');
const router = express.Router();
const { addCompany } = require('../controllers/companyController');

// Route to add a new company
router.post('/add', addCompany);

module.exports = router; 