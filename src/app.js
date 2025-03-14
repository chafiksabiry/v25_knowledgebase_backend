const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { logger } = require('./utils/logger');
const loggerMiddleware = require('./middleware/loggerMiddleware');
const documentRoutes = require('./routes/documentRoutes');
const fineTuningRoutes = require('./routes/fineTuningRoutes');
const analysisRoutes = require('./routes/analysisRoutes');

// Initialize express app
const app = express();

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(loggerMiddleware);

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/fine-tuning', fineTuningRoutes);
app.use('/api/analysis', analysisRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kb-analysis')
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch(err => {
    logger.error('MongoDB connection error:', err);
  });

module.exports = app; 