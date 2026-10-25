const { scoreKnowledgeBase, documentQuality } = require('../services/knowledgeScoring');

const NOW = new Date('2026-10-25T12:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000);
const para = (s, n = 40) => `${s} `.repeat(n);

const doc = (id, name, content, extra = {}) => ({
  id,
  name,
  content,
  words: content.split(/\s+/).length,
  indexed: true,
  analyzed: true,
  uploadedAt: daysAgo(10),
  ...extra,
});

describe('knowledge base scoring', () => {
  test('an empty base is level 1 with the first recommendation to add a document', () => {
    const r = scoreKnowledgeBase({ documents: [], now: NOW });
    expect(r.score).toBe(0);
    expect(r.level).toEqual({ level: 1, id: 'starting' });
    expect(r.recommendations[0].code).toBe('add_first_document');
  });

  test('unreadable documents (no text) cap the score and are flagged', () => {
    const r = scoreKnowledgeBase({ documents: [doc('a', 'scan.pdf', '', { words: 0, indexed: false, analyzed: false })], now: NOW });
    expect(r.score).toBeLessThanOrEqual(10);
    expect(r.level.level).toBe(1);
    expect(r.recommendations[0].code).toBe('fix_unreadable_documents');
    expect(r.documents[0]).toMatchObject({ usable: false, quality: 0 });
  });

  test('a rich, recent, indexed base covering every topic reaches the top level', () => {
    const text = [
      para('Notre offre et nos produits : formule, gamme, garantie, couverture complète.'),
      para('Tarif et prix : cotisation mensuelle, prime, remise, abonnement en €.'),
      para('Objection "trop cher" ou "pas intéressé" : réponse au client qui veut réfléchir.'),
      para('Conformité RGPD, consentement, devoir de conseil, mentions légales, bloctel.'),
      para('Procédure de souscription en 5 étapes, parcours et process.'),
      para('FAQ : questions fréquentes et glossaire.'),
      para('Argumentaire face à la concurrence : comparatif, avantage, différence.'),
    ].join('\n');
    const r = scoreKnowledgeBase({
      documents: [doc('a', 'Guide complet', text), doc('b', 'Tarifs', text), doc('c', 'Process', text)],
      gig: { title: 'Conseiller assurance santé', description: 'Vente de mutuelle santé par téléphone' },
      now: NOW,
    });
    expect(r.topics.every((t) => t.status === 'covered')).toBe(true);
    expect(r.dimensions.coverage).toBe(100);
    expect(r.level.level).toBe(5);
    expect(r.nextLevel).toBeNull();
    expect(r.recommendations.filter((x) => x.topic)).toHaveLength(0);
  });

  test('a level needs its topics: no objections / compliance material keeps the base below level 4', () => {
    const text = [para('Offre produit garantie formule gamme.'), para('Tarif prix cotisation prime €.')].join('\n');
    const r = scoreKnowledgeBase({ documents: [doc('a', 'Offre', text), doc('b', 'Tarifs', text), doc('c', 'Autre', text)], now: NOW });
    expect(r.level.level).toBeLessThan(4);
    expect(r.nextLevel.missingTopics).toEqual(expect.arrayContaining(['objections', 'compliance']));
    expect(r.recommendations.map((x) => x.code)).toEqual(expect.arrayContaining(['add_objections', 'add_compliance']));
  });

  test('a topic mentioned only once is partial, not covered', () => {
    const r = scoreKnowledgeBase({ documents: [doc('a', 'Note', para('Voici une note sur la FAQ du produit.'))], now: NOW });
    expect(r.topics.find((t) => t.id === 'faq').status).toBe('partial');
  });

  test('old and unindexed documents lower freshness / exploitability and raise recommendations', () => {
    const old = doc('a', 'Ancien', para('Offre produit tarif prix garantie.'), { uploadedAt: daysAgo(700), indexed: false, analyzed: false });
    const r = scoreKnowledgeBase({ documents: [old], now: NOW });
    expect(r.dimensions.freshness).toBe(0);
    const codes = r.recommendations.map((x) => x.code);
    expect(codes).toEqual(expect.arrayContaining(['index_documents', 'analyze_documents', 'refresh_documents']));
  });

  test('alignment with the gig is measured on the best documents; absent without a gig', () => {
    const onTopic = doc('a', 'Mutuelle santé', para('La mutuelle santé couvre les soins dentaires, optiques et hospitalisation.'));
    const offTopic = doc('b', 'Voitures', para('Garage automobile pneus freins vidange carrosserie.'));
    const gig = { title: 'Conseiller mutuelle santé', description: 'Soins dentaires et optiques par téléphone' };
    const r = scoreKnowledgeBase({ documents: [onTopic, offTopic], gig, now: NOW });
    const rel = Object.fromEntries(r.documents.map((d) => [d.id, d.relevance]));
    expect(rel.a).toBeGreaterThan(rel.b);
    expect(r.dimensions.alignment).toBeGreaterThan(50);
    const noGig = scoreKnowledgeBase({ documents: [onTopic], now: NOW });
    expect(noGig.dimensions.alignment).toBeNull();
    expect(noGig.documents[0].relevance).toBeNull();
  });

  test('document quality grows with usable text, index, analysis and freshness', () => {
    const base = doc('a', 'x', para('texte utile', 100));
    expect(documentQuality(base, NOW.getTime())).toBeGreaterThan(documentQuality({ ...base, indexed: false, analyzed: false, uploadedAt: daysAgo(900) }, NOW.getTime()));
    expect(documentQuality({ ...base, content: '' }, NOW.getTime())).toBe(0);
  });
});
