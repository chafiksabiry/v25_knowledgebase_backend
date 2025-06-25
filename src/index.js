const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { logger } = require('./utils/logger');
const { vertexAIService } = require('./config/vertexAIConfig');
const documentRoutes = require('./routes/documentRoutes');
const fineTuningRoutes = require('./routes/fineTuningRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const companyRoutes = require('./routes/companyRoutes');
const callRecordingRoutes = require('./routes/callRecordingRoutes');
const ragRoutes = require('./routes/ragRoutes');
const scriptRoutes = require('./routes/scriptRoutes');

// Load environment variables
dotenv.config();

// Create Express app and HTTP server
const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN,
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
app.use('/api/rag', ragRoutes);
app.use('/api/scripts', scriptRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: process.env.NODE_ENV });
});

// Connect to MongoDB and initialize services
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kb-analysis')
  .then(async () => {
    logger.info('Connected to MongoDB');
    
    // Initialize Vertex AI
    try {
      await vertexAIService.initialize();
      logger.info('Vertex AI service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Vertex AI:', error);
      // Continue server startup even if Vertex AI fails
    }
    
    // Start the server
    server.listen(PORT, () => {
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