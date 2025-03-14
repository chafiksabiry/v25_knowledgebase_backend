const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const { logger } = require('./utils/logger');
const documentRoutes = require('./routes/documentRoutes');
const fineTuningRoutes = require('./routes/fineTuningRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const app = require('./app');
const companyRoutes = require('./routes/companyRoutes');
const callRecordingRoutes = require('./routes/callRecordingRoutes');

// Load environment variables
dotenv.config();

// Create Express app
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for document uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/fine-tuning', fineTuningRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/call-recordings', callRecordingRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kb-analysis')
  .then(() => {
    logger.info('Connected to MongoDB');
    
    // Start the server
    app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Health check: http://localhost:${PORT}/health`);
      logger.info(`Documents API: http://localhost:${PORT}/api/documents`);
      logger.info(`Fine-tuning API: http://localhost:${PORT}/api/fine-tuning/jobs`);
    });
  })
  .catch((error) => {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  });

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled Rejection:', error);
});

module.exports = app; 