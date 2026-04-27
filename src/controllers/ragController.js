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

    console.log('Mode generation: GIG ONLY (sans consultation KB)');
    console.log('\n========================================\n');

    // Construire le prompt pour la génération
    console.log('🔄 PRÉPARATION DU PROMPT...\n');

    const prompt = `You are HARX Professional Script Assistant.

Goal:
Generate a professional recruitment call script based ONLY on the selected gig.
No DISC, no training modules, no KB references, no JSON output.

Context:
- Gig title: ${gig?.title || 'N/A'}
- Gig description: ${gig?.description || 'N/A'}
- Language/Tone requested: ${langueTon}
${contexte ? `- User instruction: ${contexte}` : ''}

Mandatory writing rules:
1) Output ONLY dialogue lines.
2) Each line MUST start with one of these prefixes exactly:
   - Agent:
   - Lead:
3) Alternate naturally between Agent and Lead.
4) Keep a professional, polite, confident tone (HR/recruitment quality).
5) Avoid placeholders like [Your Name], [Company], [Candidate Name].
   Use neutral realistic wording when details are missing.
   NEVER use bracket placeholders like [ ... ] in any output line.
6) Keep lines concise and actionable.
7) Include likely lead reactions (interest, hesitation, objection, availability).
8) End with a clear professional close and next step.

Output format example:
Agent: Bonjour, je vous appelle concernant le poste de ...
Lead: Bonjour, je vous écoute.
Agent: ...
Lead: ...

Return only the script lines with Agent:/Lead: prefixes.`;

    // Génération directe sur base du gig uniquement (pas de KB/RAG).
    const result = await vertexAIService.generativeModel.generateContent(prompt);
    const response = result.response;

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

    // Build an advanced guidance playbook from generated dialogue.
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
          text: String(m[2] || '')
            .replace(/\[[^\]]+\]/g, '')
            .trim(),
        };
      }
      return {
        role: 'agent',
        text: String(normalized || '')
          .replace(/\[[^\]]+\]/g, '')
          .trim(),
      };
    }).filter((row) => row.text);
    const leadGuidance = [];
    for (let i = 0; i < dialogueRows.length; i += 1) {
      const row = dialogueRows[i];
      if (row.role !== 'lead') continue;
      const suggestions = [];
      for (let j = i + 1; j < dialogueRows.length; j += 1) {
        const next = dialogueRows[j];
        if (next.role === 'lead') break;
        if (next.role === 'agent' && next.text) suggestions.push(next.text);
        if (suggestions.length >= 3) break;
      }
      leadGuidance.push({
        leadLine: row.text,
        suggestedAgentReplies:
          suggestions.length > 0
            ? suggestions
            : [
                'Merci pour votre retour. Je vous explique rapidement les points cles du poste.',
                'Tres bien, je vais vous poser 2 questions pour confirmer votre adequation.',
              ],
      });
    }

    // Build advanced branching turns:
    // each agent line has 2-3 lead options, each option has the matching agent reply.
    let branchingTurns = [];
    try {
      const branchingPrompt = `Convert this script into an interactive branching playbook.

INPUT SCRIPT:
${String(scriptContent || '')}

Return STRICT JSON only in this exact shape:
{
  "turns": [
    {
      "agentLine": "Agent line",
      "leadOptions": [
        { "leadReply": "Possible lead reply 1", "agentReply": "Best agent reply to option 1" },
        { "leadReply": "Possible lead reply 2", "agentReply": "Best agent reply to option 2" },
        { "leadReply": "Possible lead reply 3", "agentReply": "Best agent reply to option 3" }
      ]
    }
  ]
}

Rules:
- 6 to 10 turns
- 2 to 3 leadOptions per turn
- Professional recruitment context
- No placeholders like [Company] or [Name]
- Keep replies concise and realistic
- Output JSON only`;

      const branchingResult = await vertexAIService.generativeModel.generateContent(branchingPrompt);
      const branchingResponse = branchingResult.response;
      let branchingText = '';
      if (branchingResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
        branchingText = String(branchingResponse.candidates[0].content.parts[0].text);
      } else if (branchingResponse?.candidates?.[0]?.text) {
        branchingText = String(branchingResponse.candidates[0].text);
      } else if (typeof branchingResponse?.text === 'string') {
        branchingText = String(branchingResponse.text);
      }
      branchingText = branchingText.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      const parsed = JSON.parse(branchingText);
      const turns = Array.isArray(parsed?.turns) ? parsed.turns : [];
      branchingTurns = turns
        .map((t) => ({
          agentLine: String(t?.agentLine || '').trim(),
          leadOptions: Array.isArray(t?.leadOptions)
            ? t.leadOptions
                .map((o) => ({
                  leadReply: String(o?.leadReply || '').trim(),
                  agentReply: String(o?.agentReply || '').trim(),
                }))
                .filter((o) => o.leadReply && o.agentReply)
                .slice(0, 3)
            : [],
        }))
        .filter((t) => t.agentLine && t.leadOptions.length >= 2)
        .slice(0, 10);
    } catch (branchErr) {
      console.log('Branching JSON generation failed, fallback heuristic used:', String(branchErr?.message || branchErr));
    }

    if (branchingTurns.length === 0) {
      // Fallback heuristic from dialogue rows.
      const fallbackTurns = [];
      for (let i = 0; i < dialogueRows.length; i += 1) {
        if (dialogueRows[i]?.role !== 'agent') continue;
        const agentLine = String(dialogueRows[i]?.text || '').trim();
        if (!agentLine) continue;
        let leadReply = '';
        let agentReply = '';
        for (let j = i + 1; j < dialogueRows.length; j += 1) {
          const row = dialogueRows[j];
          if (!leadReply && row.role === 'lead') {
            leadReply = String(row.text || '').trim();
            continue;
          }
          if (leadReply && row.role === 'agent') {
            agentReply = String(row.text || '').trim();
            break;
          }
          if (leadReply && row.role === 'lead') break;
        }
        const defaultAgentReply =
          agentReply || 'Merci pour votre retour. Je vous donne les informations essentielles en 30 secondes.';
        const opts = [
          {
            leadReply: leadReply || 'Oui, je vous ecoute.',
            agentReply: defaultAgentReply,
          },
          {
            leadReply: 'C est interessant, pouvez-vous preciser le role ?',
            agentReply:
              'Bien sur. Le poste est centre sur les missions cles du gig, avec un cadre clair et une evolution possible.',
          },
          {
            leadReply: 'Je ne suis pas disponible maintenant.',
            agentReply: 'Je comprends. Quel serait le meilleur moment pour vous rappeler rapidement ?',
          },
        ];
        fallbackTurns.push({
          agentLine,
          leadOptions: opts.slice(0, 3),
        });
        if (fallbackTurns.length >= 8) break;
      }
      branchingTurns = fallbackTurns;
    }

    // Build deterministic ids and explicit links between turns
    // so frontend can follow scenario branches reliably.
    const normalizeLine = (text) =>
      String(text || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    const byAgentLine = new Map();
    branchingTurns.forEach((turn, idx) => {
      const key = normalizeLine(turn?.agentLine);
      if (key && !byAgentLine.has(key)) byAgentLine.set(key, idx);
    });
    const linkedTurns = branchingTurns.map((turn, idx) => {
      const turnId = `turn_${idx + 1}`;
      const options = Array.isArray(turn?.leadOptions) ? turn.leadOptions : [];
      const linkedOptions = options.map((opt) => {
        const nextIdx = byAgentLine.get(normalizeLine(opt?.agentReply));
        return {
          leadReply: String(opt?.leadReply || '').trim(),
          agentReply: String(opt?.agentReply || '').trim(),
          nextTurnId: typeof nextIdx === 'number' ? `turn_${nextIdx + 1}` : null,
        };
      });
      return {
        id: turnId,
        agentLine: String(turn?.agentLine || '').trim(),
        leadOptions: linkedOptions,
      };
    });
    // Persist structured dialogue (no prefix in text).
    let scriptArray = dialogueRows.map((row) => ({
      phase: 'Dialogue',
      actor: row.role === 'lead' ? 'lead' : 'agent',
      replica: String(row.text || '').trim(),
    })).filter((row) => row.replica);

    if (scriptArray.length === 0) {
      scriptArray = [
        {
          phase: 'Dialogue',
          actor: 'agent',
          replica: 'Script indisponible.'
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

    // Do NOT save here: persistence happens only on explicit validation action.
    console.log('Aucune sauvegarde DB pendant generation (validation requise).');

    // Prepare final response
    const finalResponse = {
      success: true,
      data: {
        script: dialogueRows.map((row) => row.text).join('\n'),
        playbook: {
          dialogue: dialogueRows,
          leadGuidance,
          turns: linkedTurns,
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
            uniquePhases: uniquePhases.length,
            phasesDistribution: phases.reduce((acc, phase) => {
              acc[phase] = (acc[phase] || 0) + 1;
              return acc;
            }, {}),
            citationsUsed: 0
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
    logger.error('Error listing scripts:', error);
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
  translateAnalysis
}; 