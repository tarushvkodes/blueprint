import assert from 'node:assert/strict';
import test from 'node:test';

import { assertCitable as chatAssertCitable } from '../modules/chat.js';
import {
  RULES_REFUSAL_MESSAGE,
  chunkDocumentPages,
  createRulesModule,
  isOfficialFirstPdfUrl,
} from '../modules/rules.js';
import { normalizeWhitespace, scoreText } from '../modules/utils.js';

const nowIso = () => '2026-05-23T19:03:00.000Z';

test('chunkDocumentPages preserves citable FTC rule metadata', () => {
  const chunks = chunkDocumentPages([
    {
      num: 2,
      text: [
        '9.1 Robot Construction Rules',
        '',
        'R401 ROBOT size limit. A ROBOT must fit within the starting configuration limits.',
      ].join('\n'),
    },
  ], {
    documentId: 'manual_abc',
    title: 'FTC Competition Manual',
    sourceUrl: 'https://firstinspires.org/manual.pdf',
    type: 'manual',
    version: 'TU7',
    normalizeWhitespace,
  });

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].page, 2);
  assert.equal(chunks[0].section, '9.1 Robot Construction Rules');
  assert.equal(chunks[0].ruleNumber, 'R401');
  assert.equal(chunks[0].version, 'TU7');
  assert.equal(chunks[0].sourceUrl, 'https://firstinspires.org/manual.pdf');
});

test('manual ingestion stores sha256 checksums and marks replaced season manuals outdated', async () => {
  const documents = new Map();
  const chunksRef = { value: [] };
  const rules = createRulesModule({ chunksRef, normalizeWhitespace, scoreText });
  const baseText = [
    '2025-2026 FIRST Tech Challenge Competition Manual DECODE Presented by RTX',
    '',
    '9.1 Robot Construction Rules',
    '',
    'R401 ROBOT size limit. A ROBOT must fit within the starting configuration limits.',
  ].join('\n');

  const first = await rules.ingestDocument({
    data: Buffer.from(baseText),
    title: 'DECODE_Competition_Manual_TU1.txt',
    type: 'manual',
    sourceUrl: 'upload:DECODE_Competition_Manual_TU1.pdf',
    documents,
    nowIso,
  });
  const second = await rules.ingestDocument({
    data: Buffer.from(`${baseText}\n\nR402 Bumpers are not required in this example.`),
    title: 'DECODE_Competition_Manual_TU2.txt',
    type: 'manual',
    sourceUrl: 'upload:DECODE_Competition_Manual_TU2.pdf',
    documents,
    nowIso,
  });

  assert.match(first.document.checksum, /^[a-f0-9]{64}$/);
  assert.match(second.document.checksum, /^[a-f0-9]{64}$/);
  assert.equal(first.document.version, 'TU1');
  assert.equal(second.document.version, 'TU2');
  assert.equal(second.replacedDocumentId, first.document.id);
  assert.equal(documents.get(first.document.id).outdated, true);
  assert.equal(chunksRef.value.some((chunk) => chunk.documentId === first.document.id && chunk.outdated), true);
});

test('official URL validation rejects non-FIRST domains before fetching', async () => {
  const rules = createRulesModule({ chunksRef: { value: [] }, normalizeWhitespace, scoreText });
  assert.equal(isOfficialFirstPdfUrl('https://firstinspires.org/manual.pdf'), true);
  assert.equal(isOfficialFirstPdfUrl('https://ftc-resources.firstinspires.org/manual.pdf'), true);
  assert.equal(isOfficialFirstPdfUrl('https://cdn.firstinspires.org/manual.pdf'), true);
  assert.equal(isOfficialFirstPdfUrl('http://firstinspires.org/manual.pdf'), false);
  assert.equal(isOfficialFirstPdfUrl('https://example.com/manual.pdf'), false);
  await assert.rejects(
    rules.ingestOfficialUrl({
      url: 'https://example.com/manual.pdf',
      documents: new Map(),
      nowIso,
    }),
    /Official URL ingest only accepts HTTPS PDFs/,
  );
});

test('chat assertCitable refuses rules questions without indexed citations', async () => {
  const emptyRules = createRulesModule({ chunksRef: { value: [] }, normalizeWhitespace, scoreText });
  const refusal = chatAssertCitable('Is a 9-inch wheel legal under R401?', 'demo', { rules: emptyRules });
  assert.equal(refusal.refused, true);
  assert.equal(refusal.message, RULES_REFUSAL_MESSAGE);

  const documents = new Map();
  const chunksRef = { value: [] };
  const indexedRules = createRulesModule({ chunksRef, normalizeWhitespace, scoreText });
  await indexedRules.ingestDocument({
    data: Buffer.from([
      '2025-2026 FIRST Tech Challenge Competition Manual DECODE Presented by RTX',
      '',
      '9.1 Robot Construction Rules',
      '',
      'R401 Wheels in this fixture are legal when all other size constraints are met.',
    ].join('\n')),
    title: 'DECODE_Competition_Manual_TU3.txt',
    type: 'manual',
    sourceUrl: 'upload:DECODE_Competition_Manual_TU3.pdf',
    documents,
    nowIso,
  });

  const allowed = chatAssertCitable('Is a 9-inch wheel legal under R401?', 'demo', { rules: indexedRules });
  assert.equal(allowed.refused, false);
  assert.deepEqual(Object.keys(allowed.citations[0]), [
    'ruleNumber',
    'section',
    'sourceDocument',
    'version',
    'page',
    'confidence',
    'note',
  ]);
  assert.equal(allowed.citations[0].ruleNumber, 'R401');
  assert.equal(allowed.citations[0].page, 1);
});
