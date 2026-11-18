const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { fineTuningGone, blockTrainingFiles, purgeTrainingFiles } = require('../routes/fineTuningDisabled');

const quietLog = { info: jest.fn(), error: jest.fn() };

describe('fine-tuning feature retired', () => {
  let server;
  let base;
  let uploadsDir;

  beforeAll(async () => {
    uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-uploads-'));
    const app = express();
    app.use(express.json());
    // same wiring as src/index.js and src/app.js
    app.use('/uploads', blockTrainingFiles, express.static(uploadsDir));
    app.use('/api/fine-tuning', fineTuningGone);
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(uploadsDir, { recursive: true, force: true });
  });

  test.each([
    ['POST', '/api/fine-tuning/jobs', { documentIds: ['64b000000000000000000001'], companyId: 'other' }],
    ['GET', '/api/fine-tuning/jobs', null],
    ['GET', '/api/fine-tuning/jobs/64b000000000000000000001', null],
    ['PUT', '/api/fine-tuning/jobs/64b000000000000000000001/status', null],
    ['POST', '/api/fine-tuning/jobs/64b000000000000000000001/cancel', null],
    ['POST', '/api/fine-tuning/test', { model: 'ft:x', prompt: 'hi' }],
  ])('refuses an unauthenticated %s %s with 410', async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: 'The fine-tuning API has been removed' });
  });

  test('never serves a training file from uploads/, even if one exists', async () => {
    fs.writeFileSync(path.join(uploadsDir, 'training-1741705062316.jsonl'), '{"secret":"chunk"}\n');
    fs.writeFileSync(path.join(uploadsDir, 'doc.txt'), 'public');
    for (const url of ['/uploads/training-1741705062316.jsonl', '/uploads/%74raining-1741705062316.jsonl']) {
      const res = await fetch(base + url);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('secret');
    }
    expect((await fetch(`${base}/uploads/doc.txt`)).status).toBe(200);
  });

  test('purgeTrainingFiles deletes only training-*.jsonl files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-purge-'));
    for (const name of ['training-1.jsonl', 'training-2.JSONL', 'file-1.pdf', 'samples.jsonl']) {
      fs.writeFileSync(path.join(dir, name), 'x');
    }
    expect(purgeTrainingFiles(dir, quietLog).sort()).toEqual(['training-1.jsonl', 'training-2.JSONL']);
    expect(fs.readdirSync(dir).sort()).toEqual(['file-1.pdf', 'samples.jsonl']);
    expect(purgeTrainingFiles(path.join(dir, 'missing'), quietLog)).toEqual([]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
