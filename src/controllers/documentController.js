const fs = require('fs').promises;
const path = require('path');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');
const { extractTextFromFileDetailed, calculateDocumentMetrics } = require('../services/documentProcessingService');
const { chunkDocument } = require('../utils/textProcessing');
const Company = require('../models/Company');
const { uploadToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const documentService = require('../services/documentService');
const { vertexAIService } = require('../config/vertexAIConfig');
const { generateSectorKnowledge, writeTempMarkdown } = require('../services/sectorKnowledgeService');
const { indexDocument } = require('../services/retrievalService');
const { runDocumentAnalysis, MIN_USABLE_CHARS } = require('../services/documentAnalysisService');

// Create, with the AI, the knowledge base of one sector case (auto insurance, health insurance...) for ONE gig.
// Scoped to the gig so that no other gig is fed with sector content that does not concern it.
const createSectorKnowledge = async (req, res) => {
  try {
    const { userId, gigId, sectorId, sectorName, outline, language, country, gigTitle, gigDescription, force } = req.body || {};
    if (!userId || !gigId || !sectorId || !sectorName) {
      return res.status(400).json({ error: 'userId, gigId, sectorId and sectorName are required' });
    }
    const company = await Company.findOne({ userId });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const tag = `sector:${sectorId}`;
    const existing = await Document.findOne({ companyId: company._id, gigId, tags: tag });
    if (existing && !force) {
      return res.status(200).json({ created: false, alreadyExists: true, document: { id: existing._id, name: existing.name } });
    }

    const content = await generateSectorKnowledge({ sectorName, outline, gigTitle, gigDescription, country, language });
    const filePath = await writeTempMarkdown(`kb-${sectorId}`, content);
    let uploaded;
    try {
      uploaded = await uploadToCloudinary(filePath, 'documents', 'raw');
    } finally {
      await fs.unlink(filePath).catch(() => undefined);
    }

    if (existing) {
      await deleteFromCloudinary(existing.cloudinaryPublicId).catch(() => undefined);
      await Document.deleteOne({ _id: existing._id });
    }

    const metrics = calculateDocumentMetrics(content);
    const document = new Document({
      name: `${sectorName} — base de connaissances (IA)`,
      description: 'Généré par IA à partir du catalogue sectoriel. À valider avant usage.',
      fileUrl: uploaded.url,
      cloudinaryPublicId: uploaded.public_id,
      fileType: 'text/markdown',
      content,
      tags: [tag, 'ai-generated'],
      uploadedBy: 'ai',
      companyId: company._id,
      gigId,
      isProcessed: true,
      processingStatus: 'completed',
      extraction: { method: 'ai-generated', ocr: false, tables: 0 },
      chunks: chunkDocument(content).map((chunk, index) => ({ content: chunk, index })),
      metadata: { ...metrics, createdAt: new Date(), modifiedAt: new Date() },
    });
    await document.save();

    setImmediate(async () => {
      try {
        await indexDocument(document);
      } catch (err) {
        logger.error(`Background indexing failed for sector document ${document._id}:`, err.message);
      }
      try {
        await runDocumentAnalysis(document);
      } catch (err) {
        logger.error(`Background analysis failed for sector document ${document._id}:`, err.message);
      }
    });

    res.status(201).json({ created: true, document: { id: document._id, name: document.name, gigId: document.gigId, tags: document.tags } });
  } catch (error) {
    logger.error('Error creating sector knowledge base:', error);
    res.status(500).json({ error: 'Failed to create sector knowledge base', details: error.message });
  }
};

// Upload a new document
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name, description, tags, uploadedBy, userId, gigId } = req.body;

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
    const extraction = await extractTextFromFileDetailed(filePath, fileType);
    const extractedText = extraction.text || '';

    // Chunk the document (only if we have text)
    const chunks = extractedText ? chunkDocument(extractedText) : [];

    // Calculate document metrics (only if we have text)
    const metrics = extractedText ? calculateDocumentMetrics(extractedText) : {
      wordCount: 0,
      characterCount: 0,
      sentenceCount: 0,
      paragraphCount: 0
    };

    const hasUsableText = extractedText.trim().length >= MIN_USABLE_CHARS;

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
      gigId: gigId || null,
      // The "RAG" reads the extracted text: a document without usable text feeds nothing.
      isProcessed: hasUsableText,
      processingStatus: hasUsableText ? 'completed' : 'failed',
      processingError: hasUsableText ? null : 'no_text',
      extraction: { method: extraction.method, ocr: extraction.ocr, tables: extraction.tables },
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

    // Analyse in the background so the summary is ready when the user opens the document.
    if (hasUsableText) {
      // Semantic index (embeddings) so the reps' assistant can retrieve the right passage, then the
      // analysis. Sequential: both save the same document.
      setImmediate(async () => {
        try {
          await indexDocument(document);
        } catch (err) {
          logger.error(`Background indexing failed for document ${document._id}:`, err.message);
        }
        try {
          await runDocumentAnalysis(document);
        } catch (err) {
          logger.error(`Background analysis failed for document ${document._id}:`, err.message);
        }
      });
    }

    if (document.gigId) {
      try {
        const { notifyKbDocumentAdded } = require('../services/repNotificationClient');
        void notifyKbDocumentAdded({
          gigId: document.gigId,
          documentId: document._id,
          documentName: document.name,
        }).catch((err) => logger.error('KB document notification failed:', err));
      } catch (err) {
        logger.error('KB document notification import failed:', err);
      }
    }

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
        processingStatus: document.processingStatus,
        processingError: document.processingError,
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
    const { gigId } = req.query;

    const query = { companyId };
    if (gigId && gigId !== 'all') {
      query.gigId = gigId;
    }

    const documents = await Document.find(query).select('-content -chunks');
    res.status(200).json({ documents });
  } catch (error) {
    logger.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

const getDocumentsByGig = async (req, res) => {
  try {
    const gigId = String(req.params.gigId || '').trim();
    if (!gigId) return res.status(400).json({ error: 'gigId is required' });
    const documents = await Document.find({ gigId }).select('-content -chunks').sort({ uploadedAt: -1, createdAt: -1 });
    res.status(200).json({ documents });
  } catch (error) {
    logger.error('Error fetching documents by gig:', error);
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
  createSectorKnowledge,
  uploadDocument,
  getAllDocuments,
  getDocumentsByGig,
  getDocumentById,
  deleteDocument,
  updateDocument,
  analyzeDocument
}; 