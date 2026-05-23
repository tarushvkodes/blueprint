import { RULES_REFUSAL_MESSAGE } from './rules.js';

export function buildFallbackChatAnswer({ project, message }) {
  return `For ${project.team.name}: ${message ? `I would handle "${message}" by checking indexed rules first, then updating the relevant BOM, calculation, code, CAD, or build-guide artifact.` : 'Ask about strategy, legality, parts, torque, code, CAD, grants, or driver logs.'} I will not make a definitive legality claim without the cited manual section and version.`;
}

export function assertCitable(prompt, projectId, { rules, documentIds = null } = {}) {
  if (!rules?.assertCitable) {
    throw new Error('assertCitable requires the rules module');
  }
  const result = rules.assertCitable(prompt, projectId, { documentIds });
  return result.refused
    ? { ...result, message: RULES_REFUSAL_MESSAGE }
    : result;
}
