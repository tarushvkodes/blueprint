import { z } from 'zod';
import { AdapterValidationError } from './agents/adapters/errors.js';
import { LocalFallbackAdapter } from './agents/adapters/local-fallback.js';
import { VertexAdapter } from './agents/adapters/vertex.js';
import { getSchemaEntry, schemaPrompt } from './agents/schemas/index.js';

function inferSchemaName(prompt = '') {
  if (/answer.+suggestedActions/is.test(prompt)) return 'Chat';
  if (/strategy.+concepts.+buildGuide/is.test(prompt)) return 'BlueprintPacket';
  if (/concepts:\s*\[|three robot concepts|exactly three robot concepts/is.test(prompt)) return 'Concepts';
  if (/required.+optional.+spareParts|BOM|buyFirst/is.test(prompt)) return 'Bom';
  if (/calculations.+mechanism|safetyFactor|safety factor/is.test(prompt)) return 'Physics';
  if (/buildSteps|build phases|common mistake/is.test(prompt)) return 'BuildGuide';
  if (/files.+fileName|hardwareConfigurationChecklist|FTC SDK Java/is.test(prompt)) return 'Code';
  if (/Review Agent|issues.+passed.+score|block final output/is.test(prompt)) return 'ReviewVerdict';
  return null;
}

function buildStructuredPrompt(prompt, schemaName) {
  if (!schemaName) return prompt;
  return [
    prompt,
    'Return only valid JSON. Do not wrap the JSON in Markdown.',
    schemaPrompt(schemaName),
  ].join('\n\n');
}

function schemaFor(schemaName, explicitSchema) {
  if (explicitSchema) return explicitSchema;
  return getSchemaEntry(schemaName)?.schema || z.unknown();
}

export function createAiModule({ vertexConfig, aiState, adapter, fallbackAdapter } = {}) {
  const fallback = fallbackAdapter || new LocalFallbackAdapter();
  const selectedAdapter = adapter || (vertexConfig?.apiKey
    ? new VertexAdapter({ apiKey: vertexConfig.apiKey, textModel: vertexConfig.textModel })
    : fallback);

  function adapterInfo() {
    return {
      name: selectedAdapter.name,
      model: selectedAdapter.model,
      fallbackName: fallback.name,
      fallbackModel: fallback.model,
    };
  }

  function aiStatus() {
    return {
      ready: Boolean(vertexConfig?.apiKey),
      provider: selectedAdapter.name,
      textModel: vertexConfig?.textModel || selectedAdapter.model,
      imageModel: vertexConfig?.imageModel,
      adapter: adapterInfo(),
      message: vertexConfig?.apiKey ? 'AI ready' : 'Local fallback active',
      lastError: aiState.lastError,
    };
  }

  async function generateJsonWithMetadata(prompt, schema, options = {}) {
    const schemaName = options.schemaName || inferSchemaName(prompt);
    const effectiveSchema = schemaFor(schemaName, schema);
    const promptToSend = options.schemaAware === false ? prompt : buildStructuredPrompt(prompt, schemaName);
    const model = options.model || selectedAdapter.model;
    let lastError = null;

    if (selectedAdapter.name === 'vertex-express') {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const data = await selectedAdapter.generateJson(promptToSend, effectiveSchema, { ...options, model, schemaName });
          aiState.lastError = null;
          return {
            ok: true,
            data,
            generatedBy: selectedAdapter.name,
            adapterName: selectedAdapter.name,
            model,
            schemaName,
            prompt: promptToSend,
          };
        } catch (error) {
          lastError = error;
          aiState.lastError = error.message;
          if (error instanceof AdapterValidationError) break;
        }
      }
    } else {
      try {
        const data = await selectedAdapter.generateJson(promptToSend, effectiveSchema, { ...options, schemaName });
        aiState.lastError = null;
        return {
          ok: true,
          data,
          generatedBy: selectedAdapter.name,
          adapterName: selectedAdapter.name,
          model: selectedAdapter.model,
          schemaName,
          prompt: promptToSend,
        };
      } catch (error) {
        lastError = error;
        aiState.lastError = error.message;
      }
    }

    try {
      const data = await fallback.generateJson(promptToSend, effectiveSchema, { ...options, schemaName });
      return {
        ok: true,
        data,
        generatedBy: fallback.name,
        adapterName: fallback.name,
        model: fallback.model,
        schemaName,
        prompt: promptToSend,
        fallbackReason: lastError?.message || null,
      };
    } catch (fallbackError) {
      aiState.lastError = fallbackError.message;
      return {
        ok: false,
        data: null,
        generatedBy: fallback.name,
        adapterName: fallback.name,
        model: fallback.model,
        schemaName,
        prompt: promptToSend,
        error: fallbackError.message,
        validationIssues: fallbackError instanceof AdapterValidationError ? fallbackError.issues : undefined,
      };
    }
  }

  async function generateJson(prompt, schema, options = {}) {
    const result = await generateJsonWithMetadata(prompt, schema, options);
    if (!result.ok) {
      throw new Error(result.error || 'Model adapter failed to generate JSON.');
    }
    return result.data;
  }

  async function generateText(prompt, options = {}) {
    try {
      return await selectedAdapter.generateText(prompt, options);
    } catch (error) {
      aiState.lastError = error.message;
      return fallback.generateText(prompt, options);
    }
  }

  async function callVertexJson({ prompt, model, schema, schemaName, context, projectId }) {
    const result = await generateJsonWithMetadata(prompt, schema, {
      model,
      schemaName,
      context,
      projectId,
    });
    if (result.adapterName === 'local-fallback') {
      return {
        ...result,
        ok: false,
        error: result.fallbackReason || 'VERTEX_AI_API_KEY is not configured.',
      };
    }
    return result.ok
      ? result
      : { ok: false, generatedBy: 'local-fallback', error: result.error, data: null };
  }

  function schemaNameForAgent(agentName = '') {
    const normalized = agentName.toLowerCase();
    if (normalized.includes('mechanical')) return 'Concepts';
    if (normalized.includes('parts')) return 'Bom';
    if (normalized.includes('physics')) return 'Physics';
    if (normalized.includes('code')) return 'Code';
    if (normalized.includes('build guide')) return 'BuildGuide';
    if (normalized.includes('review')) return 'ReviewVerdict';
    return null;
  }

  function buildSchemaAwarePrompts(prompts) {
    return {
      ...prompts,
      adapter: adapterInfo(),
      agents: prompts.agents.map((agent) => {
        const schemaName = schemaNameForAgent(agent.name);
        return {
          ...agent,
          schemaName,
          prompt: buildStructuredPrompt(agent.prompt, schemaName),
          outputSchema: schemaName ? schemaPrompt(schemaName) : null,
        };
      }),
    };
  }

  return {
    aiStatus,
    adapterInfo,
    buildStructuredPrompt,
    buildSchemaAwarePrompts,
    generateJson,
    generateJsonWithMetadata,
    generateText,
    callVertexJson,
  };
}
