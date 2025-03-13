const Company = require('../models/Company');

// Add a new company
const addCompany = async (req, res) => {
  try {
    const { name } = req.body;
    const company = new Company({ name });
    await company.save();
    res.status(201).json({ message: 'Company added successfully', company });
  } catch (error) {
    res.status(500).json({ error: 'Failed to add company' });
  }
};

module.exports = {
  addCompany
}; 