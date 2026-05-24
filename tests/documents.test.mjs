import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkText, inferSourceType, quoteRule, sourceHealthForDocument } from '../server/documents.js';
import { state } from '../server/state.js';

test('manual chunks preserve page, rule, version, and source date metadata', () => {
  const chunks = chunkText([
    '9 ROBOT Construction Rules',
    '',
    '<R101> The ROBOT must start inside the required starting configuration.',
    '',
    'Teams should inspect all mechanisms before a MATCH.',
  ].join('\n'), {
    documentId: 'manual_test',
    title: 'CENTERSTAGE Competition Manual',
    sourceUrl: 'https://firstinspires.org/manual.pdf',
    type: 'manual',
    version: 'TU12',
    sourceDate: '2026-01-15',
    page: 42,
  });

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 42);
  assert.equal(chunks[0].ruleNumber, 'R101');
  assert.equal(chunks[0].version, 'TU12');
  assert.equal(chunks[0].sourceDate, '2026-01-15');
  assert.match(chunks[0].section, /ROBOT Construction Rules/);
});

test('rule citations include page metadata from indexed manual chunks', () => {
  const previousChunks = state.chunks;
  state.chunks = chunkText('<R105> Teams must verify extension limits against the current manual.', {
    documentId: 'manual_quote_test',
    title: 'INTO THE DEEP Competition Manual',
    sourceUrl: 'official-upload.pdf',
    type: 'manual',
    version: 'V3',
    sourceDate: '2026-02-01',
    page: 17,
  });

  try {
    const citations = quoteRule('R105 extension limits');
    assert.equal(citations[0].ruleNumber, 'R105');
    assert.equal(citations[0].page, 17);
    assert.equal(citations[0].version, 'V3');
    assert.equal(citations[0].sourceDate, '2026-02-01');
  } finally {
    state.chunks = previousChunks;
  }
});

test('official resource URL ingestion infers source document type', () => {
  assert.equal(inferSourceType({ sourceUrl: 'https://firstinspires.org/competition-manual.pdf' }), 'manual');
  assert.equal(inferSourceType({ sourceUrl: 'https://firstinspires.org/team-update-08.pdf' }), 'team-update');
  assert.equal(inferSourceType({ title: 'Robot Inspection Checklist' }), 'inspection-checklist');
  assert.equal(inferSourceType({ title: 'Field Drawings and Setup' }), 'field-drawing');
});

test('source health reports chunks, rule counts, and version warnings', () => {
  const previousChunks = state.chunks;
  const doc = {
    id: 'health_manual',
    title: 'Official Competition Manual',
    type: 'manual',
    version: null,
    sourceUrl: 'https://www.firstinspires.org/manual.pdf',
    sourceDate: new Date().toISOString(),
  };
  state.chunks = chunkText('<R101> ROBOT parts must pass inspection.', {
    documentId: doc.id,
    title: doc.title,
    sourceUrl: doc.sourceUrl,
    type: doc.type,
    version: null,
    page: 10,
  });

  try {
    const health = sourceHealthForDocument(doc, [doc]);
    assert.equal(health.chunkCount, 1);
    assert.equal(health.ruleCount, 1);
    assert.equal(health.hasPageNumbers, true);
    assert.ok(health.warnings.some((warning) => /version/i.test(warning)));
  } finally {
    state.chunks = previousChunks;
  }
});
