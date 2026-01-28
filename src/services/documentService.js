const { ChatOpenAI } = require('@langchain/openai');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const Document = require('../models/Document');

exports.analyzeDocument = async (documentId) => {
  try {
    const document = await Document.findById(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Si le document a déjà une analyse récente (moins de 24h), la retourner
    if (document.analysis && document.analysis.analyzedAt) {
      const lastAnalysis = new Date(document.analysis.analyzedAt);
      const now = new Date();
      const hoursSinceLastAnalysis = (now - lastAnalysis) / (1000 * 60 * 60);
      
      if (hoursSinceLastAnalysis < 24) {
        return document.analysis;
      }
    }

    // Read document content
    const content = document.content;

    // Split content into chunks with larger size for better performance
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000, // Augmenté de 1000 à 2000
      chunkOverlap: 200
    });
    const chunks = await textSplitter.splitText(content);

    // Create vector store
    const embeddings = new OpenAIEmbeddings();
    const vectorStore = await MemoryVectorStore.fromTexts(
      chunks,
      chunks.map((_, i) => ({ id: i })),
      embeddings
    );

    // Prepare analysis prompts
    const analysisPrompts = {
      summary: "Provide a concise summary of this document.",
      domain: "What is the main domain or field this document belongs to?",
      theme: "What is the main theme or topic of this document?",
      mainPoints: "List the main points or key arguments presented in this document.",
      technicalLevel: "What is the technical level of this document? (Beginner, Intermediate, Advanced)",
      targetAudience: "Who is the target audience for this document?",
      keyTerms: "List the key technical terms or concepts used in this document.",
      recommendations: "Based on the content, what are the key recommendations or conclusions?"
    };

    // Create two models: one for quick analysis and one for detailed analysis
    const quickModel = new ChatOpenAI({ 
      temperature: 0.7,
      modelName: "gpt-3.5-turbo" // Plus rapide pour les analyses simples
    });

    const detailedModel = new ChatOpenAI({ 
      temperature: 0.7,
      modelName: "gpt-4" // Plus précis pour les analyses complexes
    });

    // Séparer les prompts en deux groupes
    const quickAnalysisPrompts = {
      domain: analysisPrompts.domain,
      theme: analysisPrompts.theme,
      technicalLevel: analysisPrompts.technicalLevel,
      targetAudience: analysisPrompts.targetAudience
    };

    const detailedAnalysisPrompts = {
      summary: analysisPrompts.summary,
      mainPoints: analysisPrompts.mainPoints,
      keyTerms: analysisPrompts.keyTerms,
      recommendations: analysisPrompts.recommendations
    };

    // Fonction pour analyser un groupe de prompts en parallèle
    const analyzePrompts = async (prompts, model) => {
      const analysisTasks = Object.entries(prompts).map(async ([key, prompt]) => {
        const relevantDocs = await vectorStore.similaritySearch(prompt, 3);
        const context = relevantDocs.map(doc => doc.pageContent).join('\n');
        
        const messages = [
          new SystemMessage("You are a helpful AI assistant that analyzes documents."),
          new HumanMessage(`${prompt}\n\nContext:\n${context}`)
        ];
        
        const response = await model.invoke(messages);
        return [key, response.content.trim()];
      });

      return Object.fromEntries(await Promise.all(analysisTasks));
    };

    // Exécuter les analyses en parallèle
    const [quickAnalysis, detailedAnalysis] = await Promise.all([
      analyzePrompts(quickAnalysisPrompts, quickModel),
      analyzePrompts(detailedAnalysisPrompts, detailedModel)
    ]);

    // Combiner les résultats
    const analysis = {
      ...quickAnalysis,
      ...detailedAnalysis,
      analyzedAt: new Date()
    };

    // Update document with analysis results
    document.analysis = analysis;
    await document.save();

    return analysis;
  } catch (error) {
    console.error('Error in document analysis:', error);
    throw error;
  }
}; 