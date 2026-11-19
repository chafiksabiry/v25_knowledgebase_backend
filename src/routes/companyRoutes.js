const express = require('express');
const router = express.Router();
const { addCompany } = require('../controllers/companyController');
const { adminOnly } = require('../middleware/routeGuards');

// Route to add a new company
router.post('/add', adminOnly, addCompany);

module.exports = router; 