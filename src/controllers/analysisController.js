const { logger } = require('../utils/logger');
const Document = require('../models/Document');
const Analysis = require('../models/Analysis');
const OpenAI = require('openai');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper functions for document processing
const extractDocumentSections = (content) => {
  // Simple section extraction based on common patterns
  const sections = {
    introduction: '',
    conclusion: '',
    mainContent: ''
  };

  // Try to identify introduction (first paragraph)
  const paragraphs = content.split('\n\n');
  if (paragraphs.length > 0) {
    sections.introduction = paragraphs[0];
  }

  // Try to identify conclusion (last paragraph)
  if (paragraphs.length > 1) {
    sections.conclusion = paragraphs[paragraphs.length - 1];
  }

  // Main content (everything in between)
  sections.mainContent = paragraphs.slice(1, -1).join('\n\n');

  return sections;
};

const extractMainTopics = (content) => {
  // Extract headings and main points
  const topics = new Set();
  
  // Look for markdown-style headings
  const headingMatches = content.match(/^#{1,3}\s+(.+)$/gm) || [];
  headingMatches.forEach(heading => {
    topics.add(heading.replace(/^#{1,3}\s+/, '').trim());
  });

  // Look for capitalized phrases that might be topics
  const potentialTopics = content.match(/[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){0,2}/g) || [];
  potentialTopics.forEach(topic => {
    if (topic.length > 3) {
      topics.add(topic.trim());
    }
  });

  return Array.from(topics).slice(0, 10); // Return top 10 topics
};

const extractKeyPoints = (content) => {
  const keyPoints = [];

  // Extract bullet points
  const bulletPoints = content.match(/[-*]\s+([^\n]+)/g) || [];
  bulletPoints.forEach(point => {
    keyPoints.push(point.replace(/[-*]\s+/, '').trim());
  });

  // Extract sentences that seem important (contain key phrases)
  const importantPhrases = [
    'important', 'note', 'key', 'must', 'should',
    'remember', 'essential', 'critical', 'crucial'
  ];
  
  const sentences = content.match(/[^.!?]+[.!?]+/g) || [];
  sentences.forEach(sentence => {
    if (importantPhrases.some(phrase => sentence.toLowerCase().includes(phrase))) {
      keyPoints.push(sentence.trim());
    }
  });

  return keyPoints.slice(0, 5); // Return top 5 key points
};

const identifyTopics = (doc) => {
  const topics = new Set();
  
  // Add topics from tags
  if (doc.tags && doc.tags.length > 0) {
    doc.tags.forEach(tag => topics.add(tag));
  }
  
  // Add topics from title/name
  const titleWords = doc.name.split(/\s+/)
    .filter(word => word.length > 3)
    .map(word => word.toLowerCase());
  titleWords.forEach(word => topics.add(word));
  
  // Add topics from content headings
  const extractedTopics = extractMainTopics(doc.content);
  extractedTopics.forEach(topic => topics.add(topic));
  
  return Array.from(topics);
};

const calculateTopicRelevance = (doc, topic) => {
  const topicLower = topic.toLowerCase();
  let relevance = 0;
  
  // Check title relevance
  if (doc.name.toLowerCase().includes(topicLower)) relevance += 3;
  
  // Check tags relevance
  if (doc.tags.some(tag => tag.toLowerCase().includes(topicLower))) relevance += 2;
  
  // Check content relevance (basic word frequency)
  const wordCount = (doc.content.toLowerCase().match(new RegExp(topicLower, 'g')) || []).length;
  relevance += Math.min(wordCount / 10, 5); // Cap at 5 points
  
  return Math.min(relevance / 10, 1); // Normalize to 0-1
};

/**
 * Analyze the entire knowledge base for a company
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const analyzeKnowledgeBase = async (req, res) => {
  try {
    const { companyId } = req.body;
    
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }
    
    logger.info(`Starting knowledge base analysis for company: ${companyId}`);
    
    // Create a new analysis record
    const analysis = new Analysis({
      documentId: 'knowledge-base',
      modelId: 'gpt-4',
      type: 'knowledge-base',
      status: 'processing',
      companyId
    });
    
    await analysis.save();
    
    // Fetch all documents for the company
    const documents = await Document.find({ companyId });
    
    if (documents.length === 0) {
      analysis.status = 'completed';
      analysis.summary = 'No documents found in the knowledge base.';
      await analysis.save();
      
      return res.status(200).json({
        message: 'Knowledge base analysis completed',
        analysis
      });
    }
    
    // Create a summary of the knowledge base for GPT
    const kbSummary = documents.map(doc => {
      return `Document: ${doc.name}\nDescription: ${doc.description || 'No description'}\nTags: ${doc.tags.join(', ') || 'No tags'}\nContent Summary: ${doc.content.substring(0, 500)}...\n---`;
    }).join('\n\n');
    
    // Start the analysis process asynchronously
    processKnowledgeBaseAnalysis(analysis._id, kbSummary, documents, companyId);
    
    // Return the analysis ID to the client
    res.status(202).json({
      message: 'Knowledge base analysis started',
      analysisId: analysis._id
    });
    
  } catch (error) {
    logger.error('Error starting knowledge base analysis:', error);
    res.status(500).json({ error: 'Failed to start knowledge base analysis' });
  }
};

/**
 * Process the knowledge base analysis using GPT
 * @param {string} analysisId - ID of the analysis record
 * @param {string} kbSummary - Summary of the knowledge base
 * @param {Array} documents - Array of documents in the knowledge base
 * @param {string} companyId - ID of the company
 */
const processKnowledgeBaseAnalysis = async (analysisId, kbSummary, documents, companyId) => {
  try {
    const startTime = Date.now();
    
    // Update analysis status with progress tracking
    const updateAnalysisProgress = async (stage, progress, batch = 0, totalBatches = 0) => {
      const analysis = await Analysis.findById(analysisId);
      if (analysis) {
        analysis.currentStage = stage;
        analysis.progress = progress;
        analysis.currentBatch = batch;
        analysis.totalBatches = totalBatches;
        await analysis.save();
      }
    };

    await updateAnalysisProgress('preprocessing', 0);
    
    // Process documents to create enhanced summaries
    const documentSummaries = documents.map(doc => {
      const sections = extractDocumentSections(doc.content);
      
      return {
        name: doc.name,
        type: doc.type || 'document',
        description: doc.description || '',
        contentSummary: {
          introduction: sections.introduction?.substring(0, 200),
          mainTopics: extractMainTopics(doc.content),
          keyPoints: extractKeyPoints(doc.content),
          conclusion: sections.conclusion?.substring(0, 200)
        },
        tags: doc.tags || [],
        metadata: {
          uploadedAt: doc.uploadedAt,
          lastModified: doc.lastModified,
          usageStats: doc.usagePercentage ? `${doc.usagePercentage}% usage` : 'No usage data'
        }
      };
    });

    await updateAnalysisProgress('topic-analysis', 20);

    // Create topic clusters
    const topicAnalysis = {
      totalDocuments: documents.length,
      documentTypes: {
        documents: documents.filter(d => d.type === 'document').length,
        videos: documents.filter(d => d.type === 'video').length,
        links: documents.filter(d => d.type === 'link').length
      },
      overview: {
        totalContent: documents.reduce((acc, doc) => acc + (doc.content?.length || 0), 0),
        averageDocumentLength: Math.round(documents.reduce((acc, doc) => acc + (doc.content?.length || 0), 0) / documents.length),
        topTags: [...new Set(documents.flatMap(doc => doc.tags || []))].slice(0, 10)
      },
      topicClusters: documents.reduce((clusters, doc) => {
        const topics = identifyTopics(doc);
        topics.forEach(topic => {
          if (!clusters[topic]) clusters[topic] = [];
          clusters[topic].push({
            docId: doc._id,
            docName: doc.name,
            relevance: calculateTopicRelevance(doc, topic)
          });
        });
        return clusters;
      }, {})
    };

    await updateAnalysisProgress('batch-processing', 40);

    // Process documents in batches
    const batchSize = 5;
    const totalBatches = Math.ceil(documentSummaries.length / batchSize);
    let allInsights = [];
    
    for (let i = 0; i < documentSummaries.length; i += batchSize) {
      const currentBatch = Math.floor(i / batchSize) + 1;
      await updateAnalysisProgress(
        'batch-processing',
        40 + (currentBatch / totalBatches) * 30,
        currentBatch,
        totalBatches
      );

      const batch = documentSummaries.slice(i, i + batchSize);
      
      const batchResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {
            role: "system",
            content: `You are an expert documentation analyst. Analyze this batch of documents and identify specific insights, gaps, and relationships between documents.`
          },
          {
            role: "user",
            content: `Document Batch ${currentBatch}/${totalBatches}:
${JSON.stringify(batch, null, 2)}

Analyze these documents focusing on:
1. Content quality and completeness
2. Topic coverage and depth
3. Relationships with other documents
4. Potential improvements`
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });
      
      allInsights.push(batchResponse.choices[0].message.content);
    }

    await updateAnalysisProgress('final-analysis', 70);

    // Final comprehensive analysis
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: `You are an expert documentation analyst. Analyze the knowledge base with focus on:
- Topic coverage and gaps
- Documentation quality and consistency
- User journey and information accessibility
- Technical depth and completeness
- Cross-referencing and interconnections between documents`
        },
        {
          role: "user",
          content: `Knowledge Base Analysis Request:

Structure Overview:
${JSON.stringify(topicAnalysis, null, 2)}

Document Insights:
${allInsights.join('\n\n')}

Provide a comprehensive analysis focusing on:
1. Overall Documentation Health
2. Topic Coverage Analysis
3. Critical Gaps and Recommendations
4. Content Quality Assessment
5. User Experience and Accessibility
6. Integration and Cross-referencing
7. Priority Improvements

Format the response as JSON with the following structure:
{
  "summary": "Overall assessment",
  "topicAnalysis": {
    "coveredTopics": ["topic1", "topic2"],
    "missingTopics": ["topic3"],
    "topicRelationships": [{"from": "topic1", "to": "topic2", "relationship": "depends on"}]
  },
  "contentQuality": {
    "strengths": [],
    "weaknesses": [],
    "consistencyIssues": []
  },
  "recommendations": [
    {
      "area": "topic|structure|quality|accessibility",
      "description": "",
      "affectedDocuments": ["doc1", "doc2"],
      "priority": "high|medium|low",
      "effort": "small|medium|large"
    }
  ]
}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });
    
    await updateAnalysisProgress('saving-results', 90);

    // Parse and save the analysis results
    const analysisResult = JSON.parse(finalResponse.choices[0].message.content);
    
    // Update the analysis record
    const analysis = await Analysis.findById(analysisId);
    
    if (!analysis) {
      logger.error(`Analysis record not found: ${analysisId}`);
      return;
    }
    
    analysis.status = 'completed';
    analysis.summary = analysisResult.summary;
    analysis.topicAnalysis = analysisResult.topicAnalysis;
    analysis.contentQuality = analysisResult.contentQuality;
    analysis.recommendations = analysisResult.recommendations;
    analysis.processingTime = Date.now() - startTime;
    
    await analysis.save();
    
    logger.info(`Knowledge base analysis completed for company: ${companyId}`);
    
  } catch (error) {
    logger.error('Error processing knowledge base analysis:', error);
    
    // Update the analysis record with error
    try {
      const analysis = await Analysis.findById(analysisId);
      
      if (analysis) {
        analysis.status = 'failed';
        analysis.error = error.message;
        await analysis.save();
      }
    } catch (updateError) {
      logger.error('Error updating analysis record:', updateError);
    }
  }
};

/**
 * Get a specific analysis by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAnalysisById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const analysis = await Analysis.findById(id);
    
    if (!analysis) {
      return res.status(404).json({ error: 'Analysis not found' });
    }
    
    res.status(200).json({ analysis });
    
  } catch (error) {
    logger.error('Error fetching analysis:', error);
    res.status(500).json({ error: 'Failed to fetch analysis' });
  }
};

/**
 * Get all analyses for a company
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const getAllAnalyses = async (req, res) => {
  try {
    const { companyId } = req.query;
    
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }
    
    const analyses = await Analysis.find({ companyId }).sort({ createdAt: -1 });
    
    res.status(200).json({ analyses });
    
  } catch (error) {
    logger.error('Error fetching analyses:', error);
    res.status(500).json({ error: 'Failed to fetch analyses' });
  }
};

module.exports = {
  analyzeKnowledgeBase,
  getAnalysisById,
  getAllAnalyses
}; 