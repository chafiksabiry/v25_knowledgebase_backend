const Document = require('../models/Document');

const projectionOf = (query) => {
  query._applyPaths();
  return query._fields;
};

describe('Document list projections', () => {
  test('excluding content and chunks does not add a conflicting chunks.embedding exclusion', () => {
    // Regression: `select: false` on chunks.embedding made Mongo reject the list query ("Path collision").
    expect(projectionOf(Document.find({}).select('-content -chunks'))).toEqual({ content: 0, chunks: 0 });
  });

  test('embeddings never leave through JSON output', () => {
    const doc = new Document({
      name: 'n',
      fileUrl: 'u',
      cloudinaryPublicId: 'c',
      fileType: 't',
      uploadedBy: 'x',
      companyId: '507f1f77bcf86cd799439011',
      chunks: [{ content: 'a', index: 0, embedding: [0.1, 0.2] }],
    });
    expect(doc.chunks[0].embedding).toHaveLength(2);
    expect(doc.toJSON().chunks[0].embedding).toBeUndefined();
  });
});
