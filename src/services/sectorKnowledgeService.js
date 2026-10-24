const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { vertexAIService } = require('../config/vertexAIConfig');
const { logger } = require('../utils/logger');

const LANGUAGE_NAMES = { fr: 'French', en: 'English', es: 'Spanish', de: 'German', pt: 'Portuguese', it: 'Italian', ar: 'Arabic' };

/**
 * Prompt for a sector knowledge base. The sector outline comes from the platform's sector catalogue; the
 * model must stay strictly inside that sector and the gig's country, and flag everything it cannot be sure of.
 */
function buildSectorKnowledgePrompt({ sectorName, outline, gigTitle, gigDescription, country, language }) {
  const languageName = LANGUAGE_NAMES[language] || 'French';
  const outlineText = (outline || [])
    .map((block) => `- ${block.title}${block.topics && block.topics.length ? ` : ${block.topics.join(' ; ')}` : ''}`)
    .join('\n');
  return [
    `You write the sales-knowledge base that a call-centre rep needs for ONE sector case: "${sectorName}".`,
    `Write everything in ${languageName}.`,
    country ? `Target country: ${country}. Apply that country's rules only.` : 'Target country: not specified; keep the rules general and say so.',
    gigTitle ? `Gig this base is attached to: ${gigTitle}. ${gigDescription ? `Gig description: ${String(gigDescription).slice(0, 800)}` : ''}` : '',
    '',
    'Sector outline to cover (use it as the skeleton):',
    outlineText || '- (none)',
    '',
    'Produce a Markdown document with these sections, in this order:',
    '1. # Title of the knowledge base',
    '2. ## Glossary (the 15-25 terms a rep must use correctly, one line each)',
    '3. ## Products and offers (types, typical guarantees/features, who they suit; use a Markdown table where comparing)',
    '4. ## Legal and regulatory framework (duties of information, advice, consent, cooling-off/withdrawal, record keeping, solicitation rules; name the texts and regulators only when you are certain)',
    '5. ## Qualification questions (what to ask, in what order, and why)',
    '6. ## Recommended call flow (opening, discovery, proposal, closing) with example phrasing',
    '7. ## Objections and answers (at least 8)',
    '8. ## What the rep must never say or promise',
    '9. ## FAQ (at least 10 questions with short answers)',
    '',
    'Hard rules:',
    '- Stay strictly inside this sector case. Do not mention or borrow content from any other sector.',
    '- Never invent figures, prices, rates, legal article numbers or company-specific conditions. When a value depends on the company or on current law, write "[À vérifier]" (or "[To verify]" in English) instead of guessing.',
    '- Do not present the content as legal advice.',
    '- Begin the document, right under the title, with this note: "Contenu généré par IA à partir du catalogue sectoriel — à faire valider par votre responsable conformité avant utilisation." (translated into the document language).',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

async function generateSectorKnowledge(input) {
  if (!vertexAIService.vertexAI) await vertexAIService.initialize();
  const prompt = buildSectorKnowledgePrompt(input);
  const result = await vertexAIService.generativeModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 16384 },
  });
  const parts = result.response?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p.text || '').join('').trim();
  if (text.length < 500) throw new Error('The model returned no usable knowledge base');
  return text;
}

async function writeTempMarkdown(name, content) {
  const safe = name.replace(/[^a-z0-9-_]+/gi, '-').slice(0, 60) || 'sector';
  const filePath = path.join(os.tmpdir(), `${safe}-${Date.now()}.md`);
  await fs.writeFile(filePath, content, 'utf8');
  logger.info(`Sector knowledge written to ${filePath}`);
  return filePath;
}

module.exports = { buildSectorKnowledgePrompt, generateSectorKnowledge, writeTempMarkdown };
