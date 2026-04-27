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
    console.log('\n========================================');
    console.log('🔍  VÉRIFICATION DU CORPUS AVANT GÉNÉRATION');
    console.log('========================================\n');

    const { companyId, gig, typeClient, langueTon, contexte } = req.body;

    // Log request parameters
    console.log('📋 PARAMÈTRES DE LA REQUÊTE:');
    console.log('---------------------------');
    console.log(`Company ID: ${companyId}`);
    console.log(`Gig: ${gig?.title || 'N/A'}`);
    console.log(`Type Client: ${typeClient}`);
    console.log(`Langue/Ton: ${langueTon}`);
    console.log(`Contexte: ${contexte || 'Non spécifié'}`);
    console.log();

    // Validation checks
    if (!companyId) {
      console.log('❌ ERREUR: Company ID manquant\n');
      return res.status(400).json({ error: 'Company ID is required' });
    }
    if (!gig || !gig._id) {
      console.log('❌ ERREUR: Information du Gig manquante\n');
      return res.status(400).json({ error: 'A gig selection is required to generate a script.' });
    }
    if (!typeClient || !langueTon) {
      console.log('❌ ERREUR: Paramètres requis manquants\n');
      return res.status(400).json({ error: 'Type de client and langue/ton are required.' });
    }

    // Initialize Vertex AI if needed
    if (!vertexAIService.vertexAI) {
      console.log('🔄 Initialisation de Vertex AI...');
      await vertexAIService.initialize();
      console.log('✅ Vertex AI initialisé\n');
    }

    // Vérifier les documents en base de données
    const documents = await Document.find({ companyId });
    const recentDocs = documents.filter(doc =>
      new Date(doc.createdAt) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    );

    console.log('📊 ÉTAT DE LA BASE DE DONNÉES:');
    console.log('----------------------------');
    console.log(`Total documents: ${documents.length}`);
    console.log(`Documents récents (7 jours): ${recentDocs.length}`);
    console.log('Types de documents:');
    const docTypes = documents.reduce((acc, doc) => {
      acc[doc.type] = (acc[doc.type] || 0) + 1;
      return acc;
    }, {});
    Object.entries(docTypes).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
    console.log();

    // Vérifier le contenu du corpus
    const corpusContent = await vertexAIService._getCorpusContent(companyId);
    const callRecordings = corpusContent.filter(item =>
      item.title.toLowerCase().includes('call') ||
      item.title.toLowerCase().includes('recording')
    );
    const otherDocuments = corpusContent.filter(item =>
      !item.title.toLowerCase().includes('call') &&
      !item.title.toLowerCase().includes('recording')
    );

    console.log('📝 ÉTAT DU CORPUS:');
    console.log('----------------');
    console.log(`Total éléments: ${corpusContent.length}`);
    console.log(`Enregistrements d'appels: ${callRecordings.length}`);
    console.log(`Autres documents: ${otherDocuments.length}`);
    console.log();

    if (callRecordings.length > 0) {
      console.log('🎯 DÉTAIL DES ENREGISTREMENTS D\'APPELS:');
      console.log('------------------------------------');
      callRecordings.forEach(recording => {
        const modifiedDate = new Date(recording.lastModifiedTime);
        const isRecent = modifiedDate > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        console.log(`  - ${recording.title}`);
        console.log(`    Dernière modification: ${modifiedDate.toLocaleDateString()}`);
        console.log(`    Statut: ${isRecent ? '🟢 Récent' : '🟡 Plus ancien'}`);
      });
      console.log();
    } else {
      console.log('⚠️  ATTENTION: Aucun enregistrement d\'appel trouvé!\n');
    }

    // Vérifier le statut global
    const corpusStatus = await vertexAIService.checkCorpusStatus(companyId);

    console.log('📈 RÉSUMÉ FINAL:');
    console.log('--------------');
    console.log(`État du corpus: ${corpusStatus.exists ? '✅ Existe' : '❌ N\'existe pas'}`);
    console.log(`Documents dans le corpus: ${corpusStatus.documentCount}`);
    console.log(`Enregistrements d'appels: ${corpusStatus.callRecordingCount}`);
    console.log(`Total éléments: ${corpusStatus.totalCount}`);
    console.log('\n========================================\n');

    // Vérifications critiques
    // MODIFIÉ : On ne bloque plus si le corpus n'existe pas ou s'il n'y a pas d'enregistrements.
    // On loggera simplement l'information.
    if (!corpusStatus.exists) {
      console.log('⚠️  INFO: Corpus non trouvé ou vide. La génération se fera sur la base des connaissances générales.\n');
    }

    if (corpusStatus.callRecordingCount === 0) {
      console.log('⚠️  INFO: Aucun enregistrement d\'appel trouvé. La génération se fera sans exemples d\'appels passés.\n');
    }

    // Construire le prompt pour la génération
    console.log('🔄 PRÉPARATION DU PROMPT...\n');

    const prompt = `You are HARX KB Script Assistant.

Generate a normal, ready-to-use call script in plain text (markdown allowed).
Do NOT use DISC profiling.
Do NOT force phases, JSON structure, or training-plan style output.
Keep the script simple, concise, practical, and directly usable.

Inputs:
- Gig title: ${gig?.title || 'N/A'}
- Gig description: ${gig?.description || 'N/A'}
- Language/Tone: ${langueTon}
${contexte ? `- User context: ${contexte}` : ''}

Output rules:
- Return script lines only (no JSON, no XML, no code fences).
- Favor short alternating lines (Agent / Candidate).
- If context is missing, infer reasonably and still provide a usable script.`;

    // Utiliser la logique RAG pour enrichir le prompt avec le contexte documentaire
    console.log('🔄 CONSULTATION DU CORPUS POUR LA GÉNÉRATION DE SCRIPT...\n');
    const response = await vertexAIService.queryKnowledgeBase(companyId, prompt);

    // Log response metadata
    console.log('📄 MÉTADONNÉES DE LA RÉPONSE DE Vertex AI:');
    console.log('----------------------------------------');
    console.log(`Candidats présents: ${!!response.candidates ? 'Oui' : 'Non'}`);
    console.log(`Nombre de candidats: ${response.candidates?.length || 0}`);
    console.log(`Citations présentes: ${!!response.candidates?.[0]?.citationMetadata?.citations ? 'Oui' : 'Non'}`);
    console.log(`Nombre de citations: ${response.candidates?.[0]?.citationMetadata?.citations?.length || 0}`);
    console.log();

    // Log citations if available
    if (response.candidates?.[0]?.citationMetadata?.citations) {
      console.log('Sources utilisées pour la génération de script:');
      response.candidates[0].citationMetadata.citations.forEach(citation => {
        console.log(`  - ${citation.title}`);
      });
      console.log();
    }

    // Extraire la réponse générée
    let scriptContent;
    if (response.candidates && response.candidates[0]) {
      if (response.candidates[0].content && response.candidates[0].content.parts) {
        scriptContent = response.candidates[0].content.parts[0].text;
        console.log('Contenu du script extrait de content.parts');
      } else if (response.candidates[0].text) {
        scriptContent = response.candidates[0].text;
        console.log('Contenu du script extrait de text');
      } else {
        scriptContent = response.candidates[0];
        console.log('Contenu du script extrait de candidate');
      }
    } else if (response.text) {
      scriptContent = response.text;
      console.log('Contenu du script extrait de response.text');
    } else if (typeof response === 'string') {
      scriptContent = response;
      console.log('Contenu du script extrait de string response');
    } else {
      console.log('Structure de réponse inattendue:', response);
      throw new Error('Unexpected response structure from Vertex AI');
    }

    // Log script content length
    console.log('Statistiques du contenu du script généré:');
    console.log('----------------------------------------');
    console.log(`Longueur du contenu: ${scriptContent.length}`);
    console.log(`Type de contenu: ${typeof scriptContent}`);
    console.log();
    // Nettoyer le JSON généré pour enlever les blocs de code markdown
    if (typeof scriptContent === 'string') {
      scriptContent = scriptContent.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    }
    // Backward-compatible parsing:
    // - If model still returns JSON array, keep it.
    // - If model returns plain text (expected mode), convert to one script step to avoid 500.
    let scriptArray = [];
    try {
      console.log('Tentative de parsing du contenu du script en JSON...');
      let parsed = null;
      try {
        parsed = JSON.parse(scriptContent);
      } catch {
        const jsonArrayMatch = String(scriptContent).match(/\[[\s\S]*\]/);
        if (jsonArrayMatch) {
          parsed = JSON.parse(jsonArrayMatch[0]);
        }
      }

      if (Array.isArray(parsed)) {
        scriptArray = parsed;
        console.log('Contenu du script parsé en tableau JSON:', {
          arrayLength: scriptArray.length,
          phases: scriptArray.map(item => item.phase).filter((v, i, a) => a.indexOf(v) === i)
        });
      } else {
        throw new Error('Non-JSON response');
      }
    } catch (e) {
      console.log('Réponse non JSON détectée, fallback texte activé:', {
        error: e.message,
        previewContent: String(scriptContent).substring(0, 200) + '...'
      });
      scriptArray = [
        {
          phase: 'Script',
          actor: 'agent',
          replica: String(scriptContent || '').trim() || 'Script indisponible.'
        }
      ];
    }

    // Validate script structure
    console.log('Validation de la structure du script...');
    const phases = scriptArray.map(item => item.phase);
    const uniquePhases = [...new Set(phases)];
    console.log('Analyse des phases du script:');
    console.log('------------------------------');
    console.log(`Nombre total d'étapes: ${scriptArray.length}`);
    console.log(`Phases uniques: ${uniquePhases.length}`);
    console.log('Distribution des phases:');
    phases.reduce((acc, phase) => {
      acc[phase] = (acc[phase] || 0) + 1;
      return acc;
    }, {});

    // Save the script in the database
    console.log('Sauvegarde du script dans la base de données...');
    const scriptDoc = await Script.create({
      gigId: gig._id,
      gig,
      targetClient: typeClient,
      language: langueTon,
      details: contexte,
      script: scriptArray
    });
    console.log('Script sauvegardé avec succès:', {
      scriptId: scriptDoc._id,
      stepsCount: scriptArray.length
    });

    // Prepare final response
    const finalResponse = {
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
          scriptId: scriptDoc._id,
          analysisStats: {
            totalSteps: scriptArray.length,
            uniquePhases: uniquePhases.length,
            phasesDistribution: phases.reduce((acc, phase) => {
              acc[phase] = (acc[phase] || 0) + 1;
              return acc;
            }, {}),
            citationsUsed: response.candidates?.[0]?.citationMetadata?.citations?.length || 0
          }
        }
      }
    };

    console.log('\n✅ GÉNÉRATION TERMINÉE\n');
    console.log('Sources utilisées:');
    if (response.candidates?.[0]?.citationMetadata?.citations) {
      response.candidates[0].citationMetadata.citations.forEach(citation => {
        console.log(`  - ${citation.title}`);
      });
    }
    console.log('\n========================================\n');

    logger.info('Script generation completed successfully');
    res.status(200).json(finalResponse);
  } catch (error) {
    console.log('\n❌ ERREUR LORS DE LA GÉNÉRATION:');
    console.log('-----------------------------');
    console.log(error.message);
    console.log('\n========================================\n');

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