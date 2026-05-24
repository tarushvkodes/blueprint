import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVertexRequestBody, extractVertexJson } from '../server/ai.js';

test('buildVertexRequestBody separates system instructions from user prompt', () => {
  const body = buildVertexRequestBody({
    systemPrompt: 'You are Blueprint. Stay citation-aware.',
    prompt: 'Return JSON: { "ok": true }.',
    temperature: 0.1,
    responseSchema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
      },
    },
  });

  assert.deepEqual(body.systemInstruction, {
    parts: [{ text: 'You are Blueprint. Stay citation-aware.' }],
  });
  assert.equal(body.contents[0].role, 'user');
  assert.match(body.contents[0].parts[0].text, /Return strict JSON only/);
  assert.match(body.contents[0].parts[0].text, /Return JSON/);
  assert.equal(body.generationConfig.temperature, 0.1);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.equal(body.generationConfig.responseSchema.properties.ok.type, 'boolean');
});

test('buildVertexRequestBody omits systemInstruction when no system prompt is supplied', () => {
  const body = buildVertexRequestBody({ prompt: 'Return JSON: { "ok": true }.' });

  assert.equal(Object.hasOwn(body, 'systemInstruction'), false);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('extractVertexJson handles fenced and prose-wrapped JSON', () => {
  assert.deepEqual(extractVertexJson('```json\n{ "ok": true }\n```'), { ok: true });
  assert.deepEqual(extractVertexJson('Here is the data:\n{ "ok": true, "items": [1, 2] }\nDone.'), {
    ok: true,
    items: [1, 2],
  });
  assert.equal(extractVertexJson('no json here'), null);
});
