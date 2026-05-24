import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGoogleAiStudioRequestBody, extractGoogleAiJson } from '../server/ai.js';

test('buildGoogleAiStudioRequestBody separates system instructions from user prompt', () => {
  const body = buildGoogleAiStudioRequestBody({
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

test('buildGoogleAiStudioRequestBody omits systemInstruction when no system prompt is supplied', () => {
  const body = buildGoogleAiStudioRequestBody({ prompt: 'Return JSON: { "ok": true }.' });

  assert.equal(Object.hasOwn(body, 'systemInstruction'), false);
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
});

test('extractGoogleAiJson handles fenced and prose-wrapped JSON', () => {
  assert.deepEqual(extractGoogleAiJson('```json\n{ "ok": true }\n```'), { ok: true });
  assert.deepEqual(extractGoogleAiJson('Here is the data:\n{ "ok": true, "items": [1, 2] }\nDone.'), {
    ok: true,
    items: [1, 2],
  });
  assert.equal(extractGoogleAiJson('no json here'), null);
});
