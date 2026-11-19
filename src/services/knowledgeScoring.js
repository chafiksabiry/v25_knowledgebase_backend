/**
 * Relevance and maturity scoring of a knowledge base (documents of a company, optionally for one gig).
 *
 * Pure functions: no database, no AI. The score is an explainable estimate built from the content itself:
 *  - coverage   : which topics a REP needs on a call are actually written down (offer, pricing, objections...)
 *  - depth      : how much usable material there is
 *  - exploitable: documents the REPS (and AI agents) can really search (text extracted, indexed, analysed)
 *  - freshness  : age of the documents
 *  - alignment  : how close the documents are to the gig (title + description), only when a gig is given
 * It measures coverage and quality of the material, NOT the factual accuracy of what is written.
 */

const MIN_USABLE_CHARS = 40;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Topics a REP needs to convert; keywords are FR + EN. A topic is "covered" with >= 2 distinct hits. */
const TOPICS = [
  { id: 'offer', keywords: ['produit', 'offre', 'garantie', 'formule', 'gamme', 'catalogue', 'service', 'couverture', 'product', 'feature', 'coverage', 'plan '] },
  { id: 'pricing', keywords: ['tarif', 'prix', 'cotisation', 'prime', 'coût', 'cout', 'remise', 'abonnement', '€', 'eur ', 'price', 'pricing', 'discount', 'fee', 'cost'] },
  { id: 'objections', keywords: ['objection', 'trop cher', 'pas intéress', 'réfléchir', 'reflechir', 'hésit', 'hesit', 'rétractation', 'retractation', 'rebuttal', 'too expensive', 'not interested', 'think about it'] },
  { id: 'compliance', keywords: ['conformité', 'conformite', 'rgpd', 'gdpr', 'légal', 'legal', 'réglementation', 'reglementation', 'devoir de conseil', 'consentement', 'mentions', 'compliance', 'regulat', 'consent', 'bloctel', 'do not call'] },
  { id: 'process', keywords: ['procédure', 'procedure', 'étape', 'etape', 'souscription', 'parcours', 'mode opératoire', 'process', 'workflow', 'onboarding', 'steps', 'comment faire'] },
  { id: 'faq', keywords: ['faq', 'questions fréquentes', 'questions frequentes', 'foire aux questions', 'frequently asked', 'glossaire', 'glossary', 'question :', 'q:'] },
  { id: 'arguments', keywords: ['concurren', 'comparatif', 'avantage', 'différenc', 'difference', 'argumentaire', 'pitch', 'competitor', 'benchmark', 'unique selling', 'usp', 'bénéfice', 'benefice', 'benefit'] },
];

const WEIGHTS = { coverage: 0.35, depth: 0.2, exploitable: 0.2, freshness: 0.1, alignment: 0.15 };

/** Maturity levels, from the lowest. `min` is the score floor; `needs` are topics required (at least partial). */
const LEVELS = [
  { level: 1, id: 'starting', min: 0, needs: [] },
  { level: 2, id: 'basic', min: 25, needs: [] },
  { level: 3, id: 'operational', min: 50, needs: ['offer', 'pricing'] },
  { level: 4, id: 'solid', min: 70, needs: ['offer', 'pricing', 'objections', 'compliance'] },
  { level: 5, id: 'reference', min: 85, needs: TOPICS.map((t) => t.id) },
];

const STOPWORDS = new Set([
  'les', 'des', 'une', 'pour', 'dans', 'avec', 'sur', 'par', 'aux', 'est', 'sont', 'que', 'qui', 'vos', 'nos', 'leur', 'plus', 'tout', 'cette', 'ces',
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'your', 'our', 'are', 'you', 'will', 'can', 'their', 'have',
]);

const clamp01 = (n) => Math.max(0, Math.min(1, n));
const pct = (n) => Math.round(clamp01(n) * 100);

function terms(text) {
  return [...new Set((String(text || '').toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((w) => !STOPWORDS.has(w)))];
}

/** Share of the gig's terms found in the document (name + start of the content + key terms): 0..1. */
function gigAlignment(doc, gigTerms) {
  if (!gigTerms.length) return null;
  const haystack = `${doc.name || ''} ${(doc.analysis && doc.analysis.keyTerms || []).join(' ')} ${String(doc.content || '').slice(0, 20000)}`.toLowerCase();
  let hits = 0;
  for (const term of gigTerms) if (haystack.includes(term)) hits += 1;
  // A document does not need to mention every word of the gig: ~35% of the terms is already a clear match.
  return clamp01(hits / gigTerms.length / 0.35);
}

function freshness(doc, now) {
  const uploaded = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : null;
  if (!uploaded) return 0.5;
  const ageDays = (now - uploaded) / DAY_MS;
  if (ageDays <= 180) return 1;
  if (ageDays >= 540) return 0;
  return 1 - (ageDays - 180) / 360;
}

/** Quality of one document as a source for the REPS: 0..100 (independent from the gig). */
function documentQuality(doc, now) {
  const usable = String(doc.content || '').trim().length >= MIN_USABLE_CHARS;
  if (!usable) return 0;
  const words = doc.words || 0;
  const depth = clamp01(words / 600);
  return pct(0.4 + 0.2 * depth + 0.15 * (doc.indexed ? 1 : 0) + 0.1 * (doc.analyzed ? 1 : 0) + 0.15 * freshness(doc, now));
}

function detectTopics(usableDocs) {
  return TOPICS.map((topic) => {
    const foundIn = new Set();
    const hits = new Set();
    for (const doc of usableDocs) {
      const text = `${doc.name || ''} ${String(doc.content || '').slice(0, 200000)}`.toLowerCase();
      for (const kw of topic.keywords) {
        if (text.includes(kw)) {
          hits.add(kw);
          foundIn.add(doc.id);
        }
      }
    }
    const status = hits.size >= 2 ? 'covered' : hits.size === 1 ? 'partial' : 'missing';
    return { id: topic.id, status, documents: foundIn.size };
  });
}

function levelFor(score, topics, usableCount) {
  const status = Object.fromEntries(topics.map((t) => [t.id, t.status]));
  let reached = LEVELS[0];
  if (usableCount === 0) return reached;
  for (const lvl of LEVELS) {
    if (score >= lvl.min && lvl.needs.every((id) => status[id] === 'covered' || status[id] === 'partial')) reached = lvl;
    else break;
  }
  return reached;
}

/**
 * @param {object} input
 * @param {Array} input.documents  [{id,name,content,words,indexed,analyzed,analysis,uploadedAt,gigId}]
 * @param {{title?:string,description?:string}|null} input.gig
 * @param {Date} [input.now]
 */
function scoreKnowledgeBase({ documents = [], gig = null, now = new Date() } = {}) {
  const nowMs = now.getTime();
  const gigTerms = gig ? terms(`${gig.title || ''} ${gig.title || ''} ${gig.description || ''}`).slice(0, 60) : [];
  const usableDocs = documents.filter((d) => String(d.content || '').trim().length >= MIN_USABLE_CHARS);

  const docRows = documents.map((doc) => {
    const usable = usableDocs.includes(doc);
    const alignment = usable ? gigAlignment(doc, gigTerms) : null;
    return {
      id: doc.id,
      quality: documentQuality(doc, nowMs),
      relevance: alignment === null ? null : pct(alignment),
      usable,
    };
  });

  const topics = detectTopics(usableDocs);
  const coveredPoints = topics.reduce((n, t) => n + (t.status === 'covered' ? 1 : t.status === 'partial' ? 0.5 : 0), 0);

  const totalWords = usableDocs.reduce((n, d) => n + (d.words || 0), 0);
  const dimensions = {
    coverage: pct(coveredPoints / TOPICS.length),
    depth: pct(0.7 * clamp01(totalWords / 3000) + 0.3 * clamp01(usableDocs.length / 3)),
    exploitable: documents.length
      ? pct(
          0.5 * (usableDocs.length / documents.length) +
            0.3 * (usableDocs.length ? usableDocs.filter((d) => d.indexed).length / usableDocs.length : 0) +
            0.2 * (usableDocs.length ? usableDocs.filter((d) => d.analyzed).length / usableDocs.length : 0)
        )
      : 0,
    freshness: usableDocs.length ? pct(usableDocs.reduce((n, d) => n + freshness(d, nowMs), 0) / usableDocs.length) : 0,
    alignment: null,
  };
  const alignments = docRows.filter((r) => r.relevance !== null);
  if (gigTerms.length && alignments.length) {
    // The best-matching document defines most of the alignment: a KB is not penalised for also holding general documents.
    const values = alignments.map((r) => r.relevance);
    const mean = values.reduce((n, v) => n + v, 0) / values.length;
    dimensions.alignment = Math.round(0.7 * Math.max(...values) + 0.3 * mean);
  } else if (gigTerms.length) {
    dimensions.alignment = 0;
  }

  const active = Object.keys(WEIGHTS).filter((k) => dimensions[k] !== null);
  const weightSum = active.reduce((n, k) => n + WEIGHTS[k], 0);
  const score = Math.round(active.reduce((n, k) => n + dimensions[k] * WEIGHTS[k], 0) / weightSum);
  const cappedScore = usableDocs.length === 0 ? Math.min(score, 10) : score;

  const level = levelFor(cappedScore, topics, usableDocs.length);
  const next = LEVELS.find((l) => l.level === level.level + 1) || null;

  // Recommendations, most useful first. Codes only: the front translates them.
  const recommendations = [];
  if (documents.length === 0) recommendations.push({ code: 'add_first_document', priority: 1 });
  else if (usableDocs.length === 0) recommendations.push({ code: 'fix_unreadable_documents', priority: 1 });
  else if (usableDocs.length < documents.length) recommendations.push({ code: 'fix_unreadable_documents', priority: 2, count: documents.length - usableDocs.length });
  const topicPriority = ['offer', 'pricing', 'objections', 'compliance', 'process', 'faq', 'arguments'];
  for (const id of topicPriority) {
    const t = topics.find((x) => x.id === id);
    if (usableDocs.length && t.status !== 'covered') {
      recommendations.push({ code: `add_${id}`, topic: id, priority: 3 + topicPriority.indexOf(id), partial: t.status === 'partial' });
    }
  }
  if (usableDocs.length && usableDocs.filter((d) => !d.indexed).length) recommendations.push({ code: 'index_documents', priority: 12, count: usableDocs.filter((d) => !d.indexed).length });
  if (usableDocs.length && usableDocs.filter((d) => !d.analyzed).length) recommendations.push({ code: 'analyze_documents', priority: 13, count: usableDocs.filter((d) => !d.analyzed).length });
  if (usableDocs.length && dimensions.freshness < 50) recommendations.push({ code: 'refresh_documents', priority: 14 });
  if (usableDocs.length && dimensions.depth < 50) recommendations.push({ code: 'add_depth', priority: 15 });
  if (dimensions.alignment !== null && dimensions.alignment < 40 && usableDocs.length) recommendations.push({ code: 'align_with_gig', priority: 16 });
  recommendations.sort((a, b) => a.priority - b.priority);

  return {
    score: cappedScore,
    level: { level: level.level, id: level.id },
    nextLevel: next
      ? {
          level: next.level,
          id: next.id,
          minScore: next.min,
          missingTopics: next.needs.filter((id) => topics.find((t) => t.id === id).status === 'missing'),
          pointsToGo: Math.max(0, next.min - cappedScore),
        }
      : null,
    dimensions,
    topics,
    documents: docRows,
    stats: { documents: documents.length, usable: usableDocs.length, words: totalWords },
    recommendations,
  };
}

module.exports = { scoreKnowledgeBase, documentQuality, TOPICS, LEVELS, WEIGHTS };
