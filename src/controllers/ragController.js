const { vertexAIService } = require('../config/vertexAIConfig');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');
const { generateDocumentAnalysisPrompt } = require('../prompts/documentAnalysisPrompt');
const Script = require('../models/Script');
const Company = require('../models/Company');
const axios = require('axios');

/**
 * Helper function to call Anthropic Claude as a fallback
 * @param {string} prompt - The prompt to send to Claude
 * @returns {Promise<string>} - The generated script content
 */
const callAnthropicFallback = async (prompt) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    logger.warn('ANTHROPIC_API_KEY not found in environment, fallback skipped.');
    throw new Error('Vertex AI quota exhausted (429) and no Anthropic key available.');
  }

  logger.info('🔄 Attempting fallback generation with Claude...');
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      }
    );

    if (response.data && response.data.content && response.data.content[0]) {
      logger.info('✅ Generation successful with Claude fallback');
      return response.data.content[0].text;
    }
    throw new Error('Unexpected response format from Anthropic');
  } catch (error) {
    const errorDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    logger.error(`❌ Anthropic fallback failed: ${errorDetail}`);
    throw new Error(`Anthropic fallback failed: ${error.message}`);
  }
};

/**
 * Initialize a RAG corpus for a company
 * @param {Object} req - Express request object with companyId in body
 * @param {Object} res - Express response object
 */
const initializeCompanyCorpus = async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    logger.info(`Initializing Vertex AI for company ${companyId}`);

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    logger.info('Creating RAG corpus...');
    // Create RAG corpus for the company
    const corpus = await vertexAIService.createRagCorpus(companyId);
    logger.info('RAG corpus created:', corpus);

    // Get all documents for the company
    const documents = await Document.find({ companyId });
    logger.info(`Found ${documents.length} documents for company ${companyId}`);

    // Import documents to the corpus if any exist
    if (documents.length > 0) {
      logger.info('Importing documents to corpus...');
      await vertexAIService.importDocumentsToCorpus(companyId, documents);
      logger.info('Documents imported successfully');
    }

    res.status(200).json({
      message: 'RAG corpus initialized successfully',
      corpus,
      documentsImported: documents.length
    });

  } catch (error) {
    logger.error('Error initializing RAG corpus:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data || error.message
    });

    res.status(500).json({
      error: 'Failed to initialize RAG corpus',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Sync documents to a company's RAG corpus
 * @param {Object} req - Express request object with companyId in body
 * @param {Object} res - Express response object
 */
const syncDocumentsToCorpus = async (req, res) => {
  try {
    const { companyId } = req.body;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    // Get all documents for the company
    const documents = await Document.find({ companyId });

    // Import documents to the corpus
    const result = await vertexAIService.importDocumentsToCorpus(companyId, documents);

    res.status(200).json({
      message: 'Documents synced to RAG corpus successfully',
      documentsImported: result.imported_rag_files_count
    });

  } catch (error) {
    logger.error('Error syncing documents to RAG corpus:', error);
    res.status(500).json({ error: 'Failed to sync documents to RAG corpus' });
  }
};

/**
 * Query the knowledge base using RAG
 * @param {Object} req - Express request object with companyId and query in body
 * @param {Object} res - Express response object
 */
const queryKnowledgeBase = async (req, res) => {
  try {
    const { companyId, query } = req.body;

    if (!companyId || !query) {
      return res.status(400).json({ error: 'Company ID and query are required' });
    }

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    // **NOUVEAU : Récupérer le statut du corpus**
    const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);

    // Query the knowledge base
    const response = await vertexAIService.queryKnowledgeBase(companyId, query);

    // **MODIFIÉ : Inclure le statut détaillé du corpus dans les métadonnées**
    res.status(200).json({
      success: true,
      data: {
        answer: response.candidates[0].content.parts[0].text,
        metadata: {
          corpusStatus: corpusStatus,
          model: process.env.VERTEX_AI_MODEL,
          processedAt: new Date().toISOString(),
          citations: response.candidates[0].citationMetadata,
          safetyRatings: response.candidates[0].safetyRatings
        }
      }
    });

  } catch (error) {
    logger.error('Error querying knowledge base:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to query knowledge base',
      details: error.message
    });
  }
};

/**
 * **NOUVEAU : Obtenir le statut du corpus RAG**
 * @param {Object} req - Express request object with companyId in params
 * @param {Object} res - Express response object
 */
const getCorpusStatus = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    const status = await vertexAIService.checkCorpusStatus(companyId);

    res.status(200).json({ companyId, status });

  } catch (error) {
    logger.error('Error getting corpus status:', error);
    res.status(500).json({ error: 'Failed to get corpus status' });
  }
};

/**
 * **NOUVEAU : Obtenir la liste des documents du corpus**
 * @param {Object} req - Express request object with companyId in params
 * @param {Object} res - Express response object
 */
const getCorpusDocuments = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    const documents = await vertexAIService.getCorpusDocuments(companyId);

    res.status(200).json({ companyId, documents, count: documents.length });

  } catch (error) {
    logger.error('Error getting corpus documents:', error);
    res.status(500).json({ error: 'Failed to get corpus documents' });
  }
};

/**
 * **NOUVEAU : Obtenir le contenu d'un document spécifique**
 * @param {Object} req - Express request object with companyId and documentId in params
 * @param {Object} res - Express response object
 */
const getDocumentContent = async (req, res) => {
  try {
    const { companyId, documentId } = req.params;

    if (!companyId || !documentId) {
      return res.status(400).json({ error: 'Company ID and Document ID are required' });
    }

    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    const document = await vertexAIService.getDocumentContent(companyId, documentId);

    res.status(200).json({ companyId, document });

  } catch (error) {
    logger.error('Error getting document content:', error);
    res.status(500).json({ error: 'Failed to get document content' });
  }
};

/**
 * **NOUVEAU : Obtenir les statistiques du corpus**
 * @param {Object} req - Express request object with companyId in params
 * @param {Object} res - Express response object
 */
const getCorpusStats = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    const stats = await vertexAIService.getCorpusStats(companyId);

    res.status(200).json({ companyId, stats });

  } catch (error) {
    logger.error('Error getting corpus stats:', error);
    res.status(500).json({ error: 'Failed to get corpus stats' });
  }
};

/**
 * **NOUVEAU : Rechercher dans le corpus**
 * @param {Object} req - Express request object with companyId in params and searchTerm in query
 * @param {Object} res - Express response object
 */
const searchInCorpus = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { searchTerm } = req.query;

    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }

    if (!searchTerm) {
      return res.status(400).json({ error: 'Search term is required' });
    }

    if (!vertexAIService.vertexAI) {
      vertexAIService.initialize();
    }

    const results = await vertexAIService.searchInCorpus(companyId, searchTerm);

    res.status(200).json({ companyId, searchTerm, results, count: results.length });

  } catch (error) {
    logger.error('Error searching in corpus:', error);
    res.status(500).json({ error: 'Failed to search in corpus' });
  }
};

/**
 * Analyze a document using RAG
 * @param {Object} req - Express request object with documentId in params
 * @param {Object} res - Express response object
 */
const analyzeDocument = async (req, res) => {
  try {
    const { id: documentId } = req.params;

    if (!documentId) {
      return res.status(400).json({ error: 'Document ID is required' });
    }

    // Get the document
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    // Generate analysis prompt
    const isVideo = document.fileType && document.fileType.startsWith('video/');
    const analysisPrompt = generateDocumentAnalysisPrompt(isVideo ? "This is a video file. Please analyze its context and provide a summary based on your knowledge if available, or a general assessment if it's new." : document.content);

    // Perform analysis using RAG with a single call
    // For videos, we might want to pass different parameters to vertexAIService later
    const response = await vertexAIService.queryKnowledgeBase(
      document.companyId,
      analysisPrompt,
      isVideo ? { fileUrl: document.fileUrl, fileType: document.fileType } : null
    );

    // Parse the response to get the analysis results
    let analysisResults;
    try {
      logger.info('Raw response from Vertex AI:', JSON.stringify(response, null, 2));

      // Vérifier la structure de la réponse
      if (!response || !response.candidates || !response.candidates[0]) {
        throw new Error('Invalid response structure from Vertex AI');
      }

      // Extraire le contenu de la réponse
      let content;
      if (response.candidates[0].content && response.candidates[0].content.parts) {
        content = response.candidates[0].content.parts[0].text;
      } else if (response.candidates[0].text) {
        content = response.candidates[0].text;
      } else if (typeof response.candidates[0] === 'string') {
        content = response.candidates[0];
      } else {
        throw new Error('Unable to extract content from response');
      }

      // Essayer de parser le contenu comme JSON
      try {
        // D'abord, essayer de parser directement
        analysisResults = JSON.parse(content);
      } catch (jsonError) {
        // Si ça échoue, essayer d'extraire le JSON avec une regex
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResults = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No valid JSON found in response');
        }
      }

      // Valider la structure des résultats
      const requiredFields = ['summary', 'domain', 'theme', 'mainPoints', 'technicalLevel', 'targetAudience', 'keyTerms', 'recommendations'];
      const missingFields = requiredFields.filter(field => !analysisResults[field]);

      if (missingFields.length > 0) {
        logger.warn('Missing fields in analysis results:', missingFields);
        // Remplir les champs manquants avec des valeurs par défaut
        missingFields.forEach(field => {
          if (field === 'mainPoints' || field === 'keyTerms' || field === 'recommendations') {
            analysisResults[field] = ['Not available'];
          } else {
            analysisResults[field] = 'Not available';
          }
        });
      }

    } catch (parseError) {
      logger.error('Error parsing analysis results:', {
        error: parseError.message,
        response: response,
        stack: parseError.stack
      });
      throw new Error('Failed to parse analysis results: ' + parseError.message);
    }

    // Update document with analysis results
    document.analysis = {
      ...analysisResults,
      analyzedAt: new Date()
    };
    await document.save();

    res.status(200).json(document.analysis);

  } catch (error) {
    logger.error('Error checking corpus status:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data || error.message
    });

    res.status(500).json({
      error: 'Failed to analyze document',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Generate a call script using the company RAG corpus
 * @param {Object} req - Express request object with companyId, gig, typeClient, language, details in body
 * @param {Object} res - Express response object
 */
const generateScript = async (req, res) => {
  try {
    const { companyId, gig, typeClient, langueTon, contexte, currentScript, currentPlaybook, chatHistory } = req.body;
    // Validation checks
    if (!gig || !gig._id) {
      return res.status(400).json({ error: 'A gig selection is required to generate a script.' });
    }
    if (!typeClient || !langueTon) {
      return res.status(400).json({ error: 'Type de client and langue/ton are required.' });
    }

    // Initialize Vertex AI if needed
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
      console.log('✅ Vertex AI initialisé\n');
    }

    console.log('Mode generation: GIG ONLY (sans consultation KB)');
    console.log('\n========================================\n');

    // Construire le prompt pour la génération
    console.log('🔄 PRÉPARATION DU PROMPT...\n');

    const normalizedChatHistory = Array.isArray(chatHistory)
      ? chatHistory
        .map((msg) => {
          const role = String(msg?.role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user';
          const text = String(msg?.content || '').trim();
          return text ? `${role.toUpperCase()}: ${text}` : '';
        })
        .filter(Boolean)
        .join('\n')
      : '';

    const prompt = contexte ? `You are generating a linear sales call script based on the following Job/Mission details.
 
JOB DETAILS (PRIMARY FOUNDATION):
- TITRE DU JOB : ${gig.title || ''}
- DESCRIPTION : ${gig.description || ''}
- CATEGORIE/INDUSTRIE : ${gig.category || gig.industry || ''}

Instructions:
${contexte}

${normalizedChatHistory ? `Chat history:\n${normalizedChatHistory}` : ''}

Format the output strictly as a linear dialogue of alternating lines.
Do NOT output JSON or any other formatting. Use exactly this format:
Agent: <dialogue text>
Lead: <dialogue text>
Agent: <dialogue text>

Return ONLY the generated dialogue script.` : `You are generating a linear sales call script based on the following Job/Mission details.
  
  JOB DETAILS (PRIMARY FOUNDATION):
  - TITRE DU JOB : ${gig.title || ''}
  - DESCRIPTION : ${gig.description || ''}
  - CATEGORIE/INDUSTRIE : ${gig.category || gig.industry || ''}

  CRITICAL REQUIREMENTS:
  1. The script MUST flow naturally and cover the following phases in a continuous linear dialogue:
     - Opening & SBAM
     - Legal & Compliance (Agent MUST state: "the call may be recorded for quality and training purposes")
     - Need Discovery
     - Value Proposition
     - Document/Quote presentation
     - Objection Handling
     - Confirmation & Closing
  
  2. The script must be a single linear conversation with exactly one response/replica for each agent and lead turn. No multiple branching options or alternatives.
  3. Keep sentences short, natural, and highly suited for spoken conversation. Do not use placeholders like [Company] or [Name]. Use [Nom du prospect] for the prospect's name.
  
  Client Profile:
  - Type: ${typeClient}
  - Language/Tone: ${langueTon}
  
  ${normalizedChatHistory ? `Chat history:\n${normalizedChatHistory}` : ''}

  Format the output strictly as a linear dialogue of alternating lines. Use exactly this format:
  Agent: Bonjour [Nom du prospect], ...
  Lead: Bonjour, ...
  Agent: ...
  
  Return ONLY the generated dialogue script. Do NOT wrap in JSON.`;

    // Génération directe sur base du gig uniquement (pas de KB/RAG).
    let scriptContent;
    let response;
    try {
      const result = await vertexAIService.generativeModel.generateContent(prompt);
      response = result.response;

      // Log response metadata
      console.log('📄 MÉTADONNÉES DE LA RÉPONSE DE Vertex AI:');
      console.log('----------------------------------------');
      console.log(`Candidats présents: ${!!response.candidates ? 'Oui' : 'Non'}`);
      console.log(`Nombre de candidats: ${response.candidates?.length || 0}`);
      console.log();

      // Extraire la réponse générée
      if (response.candidates && response.candidates[0]) {
        if (response.candidates[0].content && response.candidates[0].content.parts) {
          scriptContent = response.candidates[0].content.parts[0].text;
        } else if (response.candidates[0].text) {
          scriptContent = response.candidates[0].text;
        } else {
          scriptContent = response.candidates[0];
        }
      } else if (response.text) {
        scriptContent = response.text;
      } else if (typeof response === 'string') {
        scriptContent = response;
      } else {
        throw new Error('Unexpected response structure from Vertex AI');
      }
    } catch (error) {
      const errorMsg = error.message || 'Unknown Vertex AI Error';
      const isQuotaError = errorMsg.includes('429') ||
        errorMsg.includes('404') ||
        errorMsg.toLowerCase().includes('quota') ||
        errorMsg.toLowerCase().includes('not found') ||
        errorMsg.toLowerCase().includes('overloaded') ||
        error.status === 429 ||
        error.status === 404;

      if (isQuotaError) {
        logger.warn(`⚠️ Vertex AI error (${errorMsg}). Triggering Claude fallback...`);
        scriptContent = await callAnthropicFallback(prompt);
      } else {
        logger.error(`❌ Error during script generation (Vertex AI): ${errorMsg}`);
        throw error;
      }
    }

    // Nettoyer le contenu
    if (typeof scriptContent === 'string') {
      scriptContent = scriptContent.replace(/^```(?:json|text|plaintext)?\s*|\s*```$/g, '').trim();
    }

    // Parse the script content line by line
    const rawLines = String(scriptContent || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const dialogueRows = rawLines.map((line) => {
      const normalized = line.replace(/^\[[^\]]+\]\s*/, '').trim();
      const m = normalized.match(/^(Agent|Lead|Candidate|Client)\s*:\s*(.+)$/i);
      if (m) {
        const actor = String(m[1] || '').toLowerCase();
        return {
          role: actor === 'agent' ? 'agent' : 'lead',
          text: String(m[2] || '').trim(),
          phase: 'Dialogue'
        };
      }
      return {
        role: 'agent',
        text: String(normalized || '').trim(),
        phase: 'Dialogue'
      };
    }).filter((row) => row.text);

    // Apply "Bonjour [Nom du prospect]" guardrail on first agent line
    const firstAgentIdx = dialogueRows.findIndex((row) => row.role === 'agent');
    if (firstAgentIdx >= 0) {
      let firstText = String(dialogueRows[firstAgentIdx].text || '').trim();
      firstText = firstText.replace(/^(Bonjour|Salut|Allô)\s+[^,!.?]+[,!.?]?/i, '$1').trim();

      if (!firstText.toLowerCase().startsWith('bonjour [nom du prospect]')) {
        if (firstText.toLowerCase().startsWith('bonjour')) {
          dialogueRows[firstAgentIdx].text = `Bonjour [Nom du prospect], ${firstText.slice(7).replace(/^[\s,]+/, '')}`;
        } else {
          dialogueRows[firstAgentIdx].text = `Bonjour [Nom du prospect], ${firstText}`;
        }
      }
    }

    const scriptArray = dialogueRows.map((row) => ({
      phase: 'Dialogue',
      actor: row.role === 'lead' ? 'lead' : 'agent',
      replica: String(row.text || '').trim(),
    })).filter((row) => row.replica);

    // Prepare clean linear response
    const finalResponse = {
      success: true,
      data: {
        script: dialogueRows.map((row) => `${row.role === 'lead' ? 'Lead' : 'Agent'}: ${row.text}`).join('\n'),
        playbook: {
          dialogue: dialogueRows,
          leadGuidance: [],
          turns: [],
        },
        metadata: {
          processedAt: new Date().toISOString(),
          model: process.env.VERTEX_AI_MODEL,
          sourceMode: 'gig_only',
          gigInfo: {
            gigId: gig._id,
            gigTitle: gig.title,
            gigCategory: gig.category
          },
          scriptId: null,
          analysisStats: {
            totalSteps: scriptArray.length,
            uniquePhases: 1,
            phasesDistribution: { 'Dialogue': scriptArray.length },
            citationsUsed: 0
          }
        }
      }
    };

    console.log('\n✅ GÉNÉRATION TERMINÉE (LINEAR)\n');
    logger.info('Linear script generation completed successfully');
    res.status(200).json(finalResponse);
  } catch (error) {
    console.log('\n❌ ERREUR LORS DE LA GÉNÉRATION:');
    console.log('-----------------------------');
    console.log(error.message);
    console.log('\n========================================\n');

    logger.error('Error generating script:', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to generate script', details: error.message });
  }
};

/**
 * List scripts filtered by gig
 * @param {Object} req
 * @param {Object} res
 */
const listScripts = async (req, res) => {
  try {
    const { gigId, isActive } = req.query;
    if (!gigId) {
      return res.status(400).json({ error: 'gigId query param is required' });
    }

    const filter = { gigId };
    if (typeof isActive !== 'undefined') {
      filter.isActive = String(isActive).toLowerCase() === 'true';
    }

    const scripts = await Script.find(filter)
      .sort({ createdAt: -1 })
      .select('_id gigId targetClient language details script playbook isActive createdAt')
      .lean();

    return res.status(200).json({
      success: true,
      data: scripts,
    });
  } catch (error) {
    logger.error('Error listing scripts:', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Failed to list scripts', details: error.message });
  }
};

/**
 * Create script in database (called on explicit validate action)
 * @param {Object} req
 * @param {Object} res
 */
const createScript = async (req, res) => {
  try {
    const { gigId, targetClient, language, details, script, playbook, isActive } = req.body || {};
    if (!gigId) return res.status(400).json({ error: 'gigId is required' });
    if (!targetClient || !language) {
      return res.status(400).json({ error: 'targetClient and language are required' });
    }

    const scriptArray = Array.isArray(script) ? script : [];
    const safeScript = scriptArray
      .map((row) => ({
        phase: String(row?.phase || 'Dialogue').trim() || 'Dialogue',
        actor: String(row?.actor || 'agent').toLowerCase() === 'lead' ? 'lead' : 'agent',
        replica: String(row?.replica || '').trim(),
      }))
      .filter((row) => row.replica);

    if (safeScript.length === 0) {
      return res.status(400).json({ error: 'script array must contain at least one dialogue line' });
    }

    // One script per gig: validate action updates existing or creates once.
    const created = await Script.findOneAndUpdate(
      { gigId },
      {
        gigId,
        targetClient,
        language,
        details: String(details || '').trim(),
        script: safeScript,
        playbook: playbook && typeof playbook === 'object' ? playbook : undefined,
        isActive: typeof isActive === 'boolean' ? isActive : true,
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(201).json({
      success: true,
      data: {
        _id: created._id,
        gigId: created.gigId,
        isActive: created.isActive,
        createdAt: created.createdAt,
      },
    });
  } catch (error) {
    logger.error('Error creating script:', error);
    return res.status(500).json({ error: 'Failed to create script', details: error.message });
  }
};

/**
 * Update script status (activate/deactivate)
 * @param {Object} req
 * @param {Object} res
 */
const updateScriptStatus = async (req, res) => {
  try {
    const { scriptId } = req.params;
    const { isActive } = req.body || {};
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ error: 'isActive boolean is required' });
    }

    const updated = await Script.findByIdAndUpdate(
      scriptId,
      { isActive },
      { new: true, runValidators: true }
    )
      .select('_id gigId isActive createdAt')
      .lean();

    if (!updated) {
      return res.status(404).json({ error: 'Script not found' });
    }

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Error updating script status:', error);
    return res.status(500).json({ error: 'Failed to update script status', details: error.message });
  }
};

/**
 * Delete script by id
 * @param {Object} req
 * @param {Object} res
 */
const deleteScript = async (req, res) => {
  try {
    const { scriptId } = req.params;
    if (!scriptId) {
      return res.status(400).json({ error: 'scriptId is required' });
    }

    const deleted = await Script.findByIdAndDelete(scriptId).lean();
    if (!deleted) {
      return res.status(404).json({ error: 'Script not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        _id: deleted._id,
      },
    });
  } catch (error) {
    logger.error('Error deleting script:', error);
    return res.status(500).json({ error: 'Failed to delete script', details: error.message });
  }
};

/**
 * Translate document analysis to English
 * @param {Object} req - Express request object with analysis and targetLanguage in body
 * @param {Object} res - Express response object
 */
const translateAnalysis = async (req, res) => {
  try {
    const { analysis, targetLanguage } = req.body;

    if (!analysis || !targetLanguage) {
      return res.status(400).json({ error: 'Analysis object and target language are required' });
    }

    logger.info('Translating document analysis to:', targetLanguage);

    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }

    // Create translation prompt
    const translationPrompt = `You are a professional translator. Translate the following document analysis to ${targetLanguage} while maintaining the exact same JSON structure and format.

IMPORTANT: 
- Keep the exact same JSON structure
- Translate all text content to ${targetLanguage}
- Maintain the same level of detail and professionalism
- Ensure technical terms are appropriately translated
- Keep the same array lengths for mainPoints, keyTerms, and recommendations

Original analysis to translate:
${JSON.stringify(analysis, null, 2)}

Return only the translated JSON object with the same structure:`;

    // Generate translation using the initialized generative model
    const result = await vertexAIService.generativeModel.generateContent(translationPrompt);
    const response = result.response;

    logger.info('Raw translation response:', JSON.stringify(response, null, 2));

    // Extract content using the same pattern as document analysis
    let content;
    if (!response || !response.candidates || !response.candidates[0]) {
      throw new Error('Invalid response structure from Vertex AI');
    }

    if (response.candidates[0].content && response.candidates[0].content.parts) {
      content = response.candidates[0].content.parts[0].text;
    } else if (response.candidates[0].text) {
      content = response.candidates[0].text;
    } else if (typeof response.candidates[0] === 'string') {
      content = response.candidates[0];
    } else {
      throw new Error('Unable to extract content from response');
    }

    logger.info('Extracted content:', content);

    // Parse the JSON response
    let translatedAnalysis;
    try {
      // First, try to parse directly
      translatedAnalysis = JSON.parse(content);
    } catch (jsonError) {
      // If that fails, try to extract JSON with regex
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        translatedAnalysis = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in response');
      }
    }

    logger.info('Successfully translated analysis');

    res.status(200).json({
      success: true,
      translatedAnalysis,
      originalLanguage: 'auto-detected',
      targetLanguage
    });

  } catch (error) {
    logger.error('Error translating analysis:', error);
    res.status(500).json({
      error: 'Failed to translate analysis',
      details: error.message
    });
  }
};

module.exports = {
  initializeCompanyCorpus,
  syncDocumentsToCorpus,
  queryKnowledgeBase,
  getCorpusStatus,
  getCorpusDocuments,
  getDocumentContent,
  getCorpusStats,
  searchInCorpus,
  analyzeDocument,
  generateScript,
  createScript,
  listScripts,
  updateScriptStatus,
  deleteScript,
  translateAnalysis
}; 