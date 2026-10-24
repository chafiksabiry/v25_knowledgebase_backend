const { buildSectorKnowledgePrompt } = require('../services/sectorKnowledgeService');

describe('sector knowledge prompt', () => {
  const prompt = buildSectorKnowledgePrompt({
    sectorName: 'Assurance auto',
    outline: [{ title: 'Garanties', topics: ['Responsabilité civile', 'Tous risques'] }],
    gigTitle: 'Conseiller assurance auto',
    gigDescription: 'Vente par téléphone',
    country: 'France',
    language: 'fr',
  });

  test('names the sector, the country and the language', () => {
    expect(prompt).toContain('"Assurance auto"');
    expect(prompt).toContain('Target country: France');
    expect(prompt).toContain('in French');
    expect(prompt).toContain('Garanties : Responsabilité civile ; Tous risques');
  });

  test('forbids other sectors and invented values', () => {
    expect(prompt).toMatch(/Stay strictly inside this sector case/);
    expect(prompt).toMatch(/Never invent figures/);
    expect(prompt).toContain('[À vérifier]');
  });
});
