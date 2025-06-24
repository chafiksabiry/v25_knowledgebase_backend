const fs = require('fs').promises;
const path = require('path');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');
const { extractTextFromFile, calculateDocumentMetrics } = require('../services/documentProcessingService');
const { chunkDocument } = require('../utils/textProcessing');
const Company = require('../models/Company');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const documentService = require('../services/documentService');
const { vertexAIService } = require('../config/vertexAIConfig');

// Upload a new document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name, description, tags, uploadedBy, userId } = req.body;

    // Check if companyId is provided
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    // Validate companyId
    const company = await Company.findOne({ userId });
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const companyId = company._id;

    // Upload file to Cloudinary
    const filePath = req.file.path;
    const { url: fileUrl, public_id: cloudinaryPublicId } = await uploadToCloudinary(filePath, 'documents');

    // Extract text from the file
    const fileType = req.file.mimetype;
    const extractedText = await extractTextFromFile(filePath, fileType);

    // Chunk the document
    const chunks = chunkDocument(extractedText);

    // Calculate document metrics
    const metrics = calculateDocumentMetrics(extractedText);

    // Create document record
    const document = new Document({
      name: name || req.file.originalname,
      description: description || '',
      fileUrl,
      cloudinaryPublicId,
      fileType,
      content: extractedText,
      tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
      uploadedBy,
      companyId,
      chunks: chunks.map((chunk, index) => ({
        content: chunk,
        index
      })),
      metadata: {
        ...metrics,
        createdAt: new Date(),
        modifiedAt: new Date()
      }
    });

    await document.save();

    // Delete local file after upload
    await fs.unlink(filePath);

    res.status(201).json({
      message: 'Document uploaded successfully',
      document: {
        id: document._id,
        name: document.name,
        description: document.description,
        fileUrl: document.fileUrl,
        fileType: document.fileType,
        tags: document.tags,
        uploadedAt: document.uploadedAt,
        isProcessed: document.isProcessed,
        metadata: document.metadata
      }
    });
  } catch (error) {
    logger.error('Error uploading document:', error);
    // Clean up local file if it exists
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        logger.error('Error deleting local file:', unlinkError);
      }
    }
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Get all documents
const getAllDocuments = async (req, res) => {
  try {
    const { userId } = req.query;

    // Check if companyId is provided
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }
    // Find the company associated with the userId
    const company = await Company.findOne({ userId });

    if (!company) {
      return res.status(404).json({ error: 'No company found for this user' });
    }

    const companyId = company._id;

    const documents = await Document.find({ companyId }).select('-content -chunks');
    res.status(200).json({ documents });
  } catch (error) {
    logger.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// Get document by ID
const getDocumentById = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    res.status(200).json({ document });
  } catch (error) {
    logger.error(`Error fetching document ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

// Delete document
const deleteDocument = async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(document.cloudinaryPublicId);

    await Document.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Document deleted successfully' });
  } catch (error) {
    logger.error(`Error deleting document ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};

// Update document
const updateDocument = async (req, res) => {
  try {
    const { name, description, tags } = req.body;
    const document = await Document.findById(req.params.id);

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (name) document.name = name;
    if (description) document.description = description;
    if (tags) document.tags = tags.split(',').map(tag => tag.trim());

    await document.save();

    res.status(200).json({
      message: 'Document updated successfully',
      document: {
        id: document._id,
        name: document.name,
        description: document.description,
        tags: document.tags
      }
    });
  } catch (error) {
    logger.error(`Error updating document ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to update document' });
  }
};

const analyzeDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await documentService.analyzeDocument(id);
    res.json(analysis);
  } catch (error) {
    console.error('Error analyzing document:', error);
    res.status(500).json({ 
      error: 'Failed to analyze document',
      details: error.message 
    });
  }
};

module.exports = {
  uploadDocument,
  getAllDocuments,
  getDocumentById,
  deleteDocument,
  updateDocument,
  analyzeDocument
}; 