import { reviewVerdictSchema, schemaPrompt } from './schemas/index.js';

export function buildReviewPrompt({ plan, projectContext }) {
  return [
    'You are Blueprint Review Agent.',
    'Review the full generated FTC robot plan before the response is marked as hosted-model generated.',
    'Block only contradictions, unsafe advice, missing required artifacts, uncited rule-sensitive claims, impossible parts, budget mismatches, missing physics, or code/CAD hardware mismatches.',
    schemaPrompt('ReviewVerdict'),
    `Project context: ${JSON.stringify(projectContext)}`,
    `Generated plan: ${JSON.stringify(plan)}`,
  ].join('\n\n');
}

export async function runReviewAgent({ ai, plan, projectContext, projectId }) {
  const prompt = buildReviewPrompt({ plan, projectContext });
  const result = await ai.generateJsonWithMetadata(prompt, reviewVerdictSchema, {
    schemaName: 'ReviewVerdict',
    projectId,
    context: { plan, projectContext },
  });
  return {
    verdict: result.data,
    adapterName: result.adapterName,
    model: result.model,
    schemaName: result.schemaName,
    generatedBy: result.generatedBy,
    fallbackReason: result.fallbackReason,
    ok: result.ok,
    prompt,
  };
}

