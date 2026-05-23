export function buildFallbackChatAnswer({ project, message }) {
  return `For ${project.team.name}: ${message ? `I would handle "${message}" by checking indexed rules first, then updating the relevant BOM, calculation, code, CAD, or build-guide artifact.` : 'Ask about strategy, legality, parts, torque, code, CAD, grants, or driver logs.'} I will not make a definitive legality claim without the cited manual section and version.`;
}
