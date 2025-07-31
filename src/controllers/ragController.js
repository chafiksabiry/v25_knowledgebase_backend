const { vertexAIService } = require('../config/vertexAIConfig');
const Document = require('../models/Document');
const { logger } = require('../utils/logger');
const { generateDocumentAnalysisPrompt } = require('../prompts/documentAnalysisPrompt');
const Script = require('../models/Script');

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
      details: error.response?.data || error
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
    const analysisPrompt = generateDocumentAnalysisPrompt(document.content);

    // Perform analysis using RAG with a single call
    const response = await vertexAIService.queryKnowledgeBase(
      document.companyId,
      analysisPrompt
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
    logger.error('Error analyzing document:', {
      error: error.message,
      stack: error.stack,
      details: error.response?.data || error
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
    const { companyId, gig, typeClient, langueTon, contexte } = req.body;
    if (!companyId) {
      return res.status(400).json({ error: 'Company ID is required' });
    }
    if (!gig || !gig._id) {
      return res.status(400).json({ error: 'A gig selection is required to generate a script.' });
    }
    if (!typeClient || !langueTon) {
      return res.status(400).json({ error: 'Type de client and langue/ton are required.' });
    }
    // Initialize Vertex AI if not already initialized
    if (!vertexAIService.vertexAI) {
      await vertexAIService.initialize();
    }
    // Vérifier le statut du corpus
    const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);
    if (!corpusStatus.exists) {
      return res.status(400).json({ error: 'No documents or call recordings found in the knowledge base for this company.' });
    }
    // Construire dynamiquement le prompt contextuel pour la génération de script avec méthodologie REPS
    let scriptPrompt = `Tu es un expert en rédaction de scripts téléphoniques suivant la méthodologie REPS (REPS Call Phases).

Voici les informations du gig pour lequel tu dois générer un script :
${JSON.stringify(gig, null, 2)}

PARAMÈTRES DE L'APPEL :
- Type de client (profil DISC) : ${typeClient}
- Langue & ton souhaité : ${langueTon}
- Contexte spécifique : ${contexte || 'non précisé'}

⚠️  RÈGLE ABSOLUE : Tu DOIS inclure les 8 phases REPS dans l'ordre exact. AUCUNE phase ne peut être omise !

PHASES OBLIGATOIRES REPS (TOUTES les 8 phases sont REQUISES) :
1. "Context & Preparation" - OBLIGATOIRE : Préparation et mise en contexte avant l'appel
2. "SBAM & Opening" - OBLIGATOIRE : Salutation, Bonjour, Accroche, Motif
3. "Legal & Compliance" - OBLIGATOIRE : Aspects légaux et conformité
4. "Need Discovery" - OBLIGATOIRE : Découverte des besoins
5. "Value Proposition" - OBLIGATOIRE : Proposition de valeur
6. "Documents/Quote" - OBLIGATOIRE : Documentation et devis
7. "Objection Handling" - OBLIGATOIRE : Traitement des objections
8. "Confirmation & Closing" - OBLIGATOIRE : Confirmation et clôture

INSTRUCTIONS CRITIQUES :
🔴 COMMENCE IMPÉRATIVEMENT par la phase "Context & Preparation" - elle ne doit JAMAIS être omise
🔴 INCLUS toutes les 8 phases dans l'ordre exact - pas 7, pas 6, mais bien LES 8 PHASES
🔴 Chaque phase doit contenir au moins 1-2 répliques d'échange agent/lead

Structure de chaque objet JSON :
- 'actor' : 'agent' ou 'lead'  
- 'replica' : la phrase à dire (adaptée au profil DISC et au ton souhaité)
- 'phase' : utilise EXACTEMENT les noms de phases listés ci-dessus (copie-colle les noms exacts)

VÉRIFICATION FINALE : Assure-toi que ton script contient bien :
✅ Phase 1: "Context & Preparation" 
✅ Phase 2: "SBAM & Opening"
✅ Phase 3: "Legal & Compliance"
✅ Phase 4: "Need Discovery"
✅ Phase 5: "Value Proposition"
✅ Phase 6: "Documents/Quote"
✅ Phase 7: "Objection Handling"
✅ Phase 8: "Confirmation & Closing"

Adapte le contenu des répliques au type de client DISC spécifié, utilise le ton demandé, et intègre les informations du gig.

Retourne uniquement le tableau JSON, sans aucun texte ou explication autour.`;

    // Utiliser la logique RAG pour enrichir le prompt avec le contexte documentaire
    const response = await vertexAIService.queryKnowledgeBase(companyId, scriptPrompt);
    // Extraire la réponse générée
    let scriptContent;
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
    // Nettoyer le JSON généré pour enlever les blocs de code markdown
    if (typeof scriptContent === 'string') {
      scriptContent = scriptContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    }
    // Parse the script content as JSON array
    let scriptArray = [];
    try {
      scriptArray = JSON.parse(scriptContent);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse generated script as JSON.' });
    }
    // Save the script in the database
    const scriptDoc = await Script.create({
      gigId: gig._id,
      gig,
      targetClient: typeClient,
      language: langueTon,
      details: contexte,
      script: scriptArray
    });
    res.status(200).json({
      success: true,
      data: {
        script: scriptContent,
        metadata: {
          processedAt: new Date().toISOString(),
          model: process.env.VERTEX_AI_MODEL,
          corpusStatus: corpusStatus,
          gigInfo: {
            gigId: gig._id,
            gigTitle: gig.title,
            gigCategory: gig.category
          },
          scriptId: scriptDoc._id
        }
      }
    });
  } catch (error) {
    logger.error('Error generating script:', error);
    res.status(500).json({ error: 'Failed to generate script', details: error.message });
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
  translateAnalysis
}; 