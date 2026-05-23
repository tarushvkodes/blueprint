import assert from 'node:assert/strict';
import test from 'node:test';

import { createAiModule } from '../modules/ai.js';
import { AdapterValidationError } from '../modules/agents/adapters/errors.js';
import { LocalFallbackAdapter } from '../modules/agents/adapters/local-fallback.js';
import { validateStructuredOutput } from '../modules/agents/adapters/validation.js';
import { chatSchema, conceptsSchema } from '../modules/agents/schemas/index.js';

test('local fallback adapter returns schema-valid deterministic JSON', async () => {
  const adapter = new LocalFallbackAdapter();
  const chat = await adapter.generateJson('Return JSON: { "answer": string, "suggestedActions": string[] }.', chatSchema, {
    schemaName: 'Chat',
  });
  assert.equal(typeof chat.answer, 'string');
  assert.ok(chat.suggestedActions.length > 0);

  const concepts = await adapter.generateJson('Create exactly three robot concepts.', conceptsSchema, {
    schemaName: 'Concepts',
    context: { team: { name: 'Test Team', budget: 1200, tools: ['hex drivers'] } },
  });
  assert.equal(concepts.concepts.length, 3);
});

test('zod validation failures raise AdapterValidationError', () => {
  assert.throws(
    () => validateStructuredOutput({
      adapterName: 'test-adapter',
      schemaName: 'Chat',
      schema: chatSchema,
      data: { answer: 123 },
    }),
    AdapterValidationError,
  );
});

test('AI module falls back deterministically after adapter validation failure', async () => {
  const invalidVertex = {
    name: 'vertex-express',
    model: 'fake-model',
    async generateJson(_prompt, schema, options) {
      return validateStructuredOutput({
        adapterName: this.name,
        schemaName: options.schemaName,
        schema,
        data: { answer: 123 },
      });
    },
    async generateText() {
      return 'unused';
    },
  };
  const ai = createAiModule({
    vertexConfig: { apiKey: 'present', textModel: 'fake-model', imageModel: 'fake-image' },
    aiState: { lastError: null },
    adapter: invalidVertex,
    fallbackAdapter: new LocalFallbackAdapter(),
  });

  const result = await ai.generateJsonWithMetadata('Return JSON: { "answer": string, "suggestedActions": string[] }.', chatSchema, {
    schemaName: 'Chat',
  });

  assert.equal(result.ok, true);
  assert.equal(result.adapterName, 'local-fallback');
  assert.match(result.fallbackReason, /validation/i);
  assert.equal(typeof result.data.answer, 'string');
});

