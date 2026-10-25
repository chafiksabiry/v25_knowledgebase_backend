const mongoose = require('mongoose');
const Document = require('../models/Document');
const Company = require('../models/Company');
const { logger } = require('../utils/logger');
const { scoreKnowledgeBase } = require('../services/knowledgeScoring');
const { retrieveChunks } = require('../services/retrievalService');

const MAX_DOCUMENTS = 300;
const MAX_GIGS = 50;
const AGENT_MAX_PASSAGES = 5;
const AGENT_PASSAGE_CHARS = 700;

const sameId = (a, b) => String(a) === String(b);

/**
 * Relevance + maturity score of the knowledge base, per gig (company-wide documents count for every gig).
 * POST /api/rag/score  { userId, gigs?: [{ id, title, description }] }
 * Without gigs, one company-level score is returned under the key "all".
 */
const getKnowledgeScore = async (req, res) => {
  try {
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'User ID is required' });
    const company = await Company.findOne({ userId });
    if (!company) return res.status(404).json({ error: 'No company found for this user' });

    const gigs = (Array.isArray(req.body.gigs) ? req.body.gigs : [])
      .filter((g) => g && g.id && mongoose.Types.ObjectId.isValid(String(g.id)))
      .slice(0, MAX_GIGS);

    const rows = await Document.find({ companyId: company._id })
      .select('name content analysis uploadedAt gigId metadata.wordCount embeddedAt')
      .sort({ uploadedAt: -1 })
      .limit(MAX_DOCUMENTS)
      .lean();

    const documents = rows.map((d) => ({
      id: String(d._id),
      name: d.name,
      content: d.content || '',
      words: (d.metadata && d.metadata.wordCount) || 0,
      indexed: Boolean(d.embeddedAt),
      analyzed: Boolean(d.analysis && d.analysis.summary),
      analysis: d.analysis || null,
      uploadedAt: d.uploadedAt,
      gigId: d.gigId ? String(d.gigId) : null,
    }));

    const scores = {};
    if (gigs.length === 0) {
      scores.all = scoreKnowledgeBase({ documents });
    } else {
      for (const gig of gigs) {
        const own = documents.filter((d) => !d.gigId || sameId(d.gigId, gig.id));
        scores[String(gig.id)] = scoreKnowledgeBase({ documents: own, gig: { title: gig.title, description: gig.description } });
      }
    }

    res.status(200).json({
      success: true,
      data: { companyId: String(company._id), truncated: rows.length >= MAX_DOCUMENTS, scores },
    });
  } catch (error) {
    logger.error('Error computing knowledge score:', error);
    res.status(500).json({ error: 'Failed to compute knowledge score' });
  }
};

/**
 * Passages of the knowledge base that answer a question, for an AI agent working a gig (live call, chat...).
 * POST /api/rag/agent-search  { companyId, gigId, query, topK? }
 * Short passages only: the agent has a few seconds to answer, and nothing is invented here.
 */
const agentSearch = async (req, res) => {
  try {
    const { companyId, gigId, query } = req.body || {};
    const topK = Math.min(Math.max(parseInt(req.body && req.body.topK, 10) || 3, 1), AGENT_MAX_PASSAGES);
    if (!companyId || !mongoose.Types.ObjectId.isValid(String(companyId))) {
      return res.status(400).json({ error: 'A valid companyId is required' });
    }
    if (!query || !String(query).trim()) return res.status(400).json({ error: 'query is required' });
    if (gigId && !mongoose.Types.ObjectId.isValid(String(gigId))) {
      return res.status(400).json({ error: 'gigId is not valid' });
    }

    const chunks = await retrieveChunks({
      companyId: new mongoose.Types.ObjectId(String(companyId)),
      gigId: gigId ? new mongoose.Types.ObjectId(String(gigId)) : null,
      query: String(query).slice(0, 500),
      topK,
    });
    res.status(200).json({
      success: true,
      data: {
        found: chunks.length > 0,
        passages: chunks.map((c) => ({
          documentId: c.documentId,
          title: c.title,
          score: Math.round(c.score * 100) / 100,
          content: String(c.content).slice(0, AGENT_PASSAGE_CHARS),
        })),
      },
    });
  } catch (error) {
    logger.error('Error in agent knowledge search:', error);
    res.status(500).json({ error: 'Failed to search the knowledge base' });
  }
};

module.exports = { getKnowledgeScore, agentSearch };
