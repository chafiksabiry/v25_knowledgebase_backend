const fs = require('fs');
const path = require('path');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');
const { extractTextFromFile, calculateDocumentMetrics } = require('../services/documentProcessingService');
const { chunkDocument } = require('../utils/textProcessing');

// Upload a new document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    logger.info(`Processing uploaded file: ${req.file.originalname}`);

    const { name, description, tags, uploadedBy, companyId } = req.body;
    
    // Extract text from the uploaded file
    const fileUrl = `/uploads/${req.file.filename}`;
    const filePath = path.join(__dirname, '../../', fileUrl);
    const fileType = req.file.mimetype;
    
    // Extract text from the file
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
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Get all documents
const getAllDocuments = async (req, res) => {
  try {
    const { companyId } = req.query;
    const query = companyId ? { companyId } : {};
    const documents = await Document.find(query).select('-content -chunks');
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

    // Delete file from filesystem
    const filePath = path.join(__dirname, '../../', document.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

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

module.exports = {
  uploadDocument,
  getAllDocuments,
  getDocumentById,
  deleteDocument,
  updateDocument
}; 