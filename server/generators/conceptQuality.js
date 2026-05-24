import {
  attachMechanismSpecs,
  conceptHasMechanismCoverage,
  getMechanismSpecs,
  validateMechanismSpecs,
} from './mechanisms.js';

const EXPECTED_CONCEPTS = [
  {
    intent: 'conservative',
    difficultyPattern: /beginner|low|safe|conservative/i,
    maxBudgetRatio: 0.95,
    description: 'low-risk, lower-cost build path',
  },
  {
    intent: 'balanced',
    difficultyPattern: /intermediate|medium|balanced/i,
    maxBudgetRatio: 1.15,
    description: 'middle option that balances scoring potential and maintainability',
  },
  {
    intent: 'high-ceiling',
    difficultyPattern: /advanced|high|stretch|aggressive|ceiling|ambitious/i,
    maxBudgetRatio: 1.45,
    description: 'higher-upside option with clearly named integration risks',
  },
];

const PLACEHOLDER_PATTERN = /\b(tbd|todo|placeholder|generic|example|lorem|unknown|n\/a|concept\s*[123])\b/i;
const UNSUPPORTED_CERTAINTY_PATTERN = /\b(guaranteed|always legal|fully legal|inspection safe|will win|no penalties?|approved by first|officially allowed)\b/i;
const SUBSYSTEM_ONLY_NAME_PATTERN = /^(active\s+)?(intake|lift|arm|claw|gripper|vision|camera|drivetrain|drivebase|chassis|slide|outtake|launcher)$/i;

function normalizeTextList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function normalizeCost(value, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/\d+(\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return fallback;
}

function normalizeBuildWeeks(value) {
  const text = String(value || '').toLowerCase();
  const numbers = [...text.matchAll(/\d+(\.\d+)?/g)].map((match) => Number(match[0])).filter(Number.isFinite);
  if (!numbers.length) return null;
  return Math.max(...numbers);
}

function conceptText(concept = {}) {
  return [
    concept.name,
    concept.strategyFit,
    concept.difficulty,
    concept.buildTime,
    ...normalizeTextList(concept.requiredTools),
    ...normalizeTextList(concept.requiredParts),
    ...normalizeTextList(concept.mainMechanisms || concept.mechanisms),
    ...normalizeTextList(concept.pros),
    ...normalizeTextList(concept.cons),
    ...normalizeTextList(concept.risks),
    ...normalizeTextList(concept.upgradePath),
  ].filter(Boolean).join(' ');
}

function unsupportedPointClaims(text, season = {}) {
  const claims = [...String(text).matchAll(/\b\d+\s*(points?|pts)\b/gi)].map((match) => match[0].toLowerCase());
  if (!claims.length) return [];
  const seasonFacts = `${season.scoringSummary || ''} ${season.pointValues || ''} ${normalizeTextList(season.fieldFacts).join(' ')}`.toLowerCase();
  return claims.filter((claim) => !seasonFacts.includes(claim));
}

function signatureForConcept(concept) {
  return getMechanismSpecs(concept)
    .map((spec) => `${spec.type}:${spec.architecture}`)
    .join('|');
}

function listQuality(concept, field, min, issues, label) {
  const values = normalizeTextList(concept[field]);
  if (values.length < min) {
    issues.push(`${label} needs at least ${min} ${field} items.`);
  }
}

export function normalizeAiConceptPacket(concepts, team = {}, season = {}) {
  const issues = [];
  if (!Array.isArray(concepts)) {
    return { accepted: false, concepts: [], issues: ['Vertex did not return a concepts array.'] };
  }
  if (concepts.length !== 3) {
    issues.push(`Vertex returned ${concepts.length} concepts; exactly 3 are required.`);
  }

  const normalized = concepts.slice(0, 3).map((concept, index) => {
    const expected = EXPECTED_CONCEPTS[index] || EXPECTED_CONCEPTS[1];
    return attachMechanismSpecs({
      conceptIntent: concept.conceptIntent || concept.intent || expected.intent,
      id: concept.id || `${expected.intent}-concept-${index + 1}`,
      name: concept.name || `Rejected ${expected.intent} concept`,
      strategyFit: concept.strategyFit || concept.fit || '',
      difficulty: concept.difficulty || '',
      estimatedCost: normalizeCost(concept.estimatedCost ?? concept.cost, NaN),
      buildTime: concept.buildTime || '',
      requiredTools: normalizeTextList(concept.requiredTools),
      requiredParts: normalizeTextList(concept.requiredParts),
      mainMechanisms: normalizeTextList(concept.mainMechanisms || concept.mechanisms),
      pros: normalizeTextList(concept.pros),
      cons: normalizeTextList(concept.cons),
      risks: normalizeTextList(concept.risks),
      upgradePath: normalizeTextList(concept.upgradePath),
    }, team, season);
  });

  const quality = validateConceptPacket(normalized, team, season);
  return {
    accepted: issues.length === 0 && quality.ok,
    concepts: normalized,
    issues: [...issues, ...quality.issues],
  };
}

export function validateConceptPacket(concepts = [], team = {}, season = {}) {
  const issues = [];
  const budget = Number(team.budget || 0);
  const names = new Set();
  const signatures = new Set();
  const buildWeeks = [];

  if (!Array.isArray(concepts) || concepts.length !== 3) {
    issues.push('Concept packet must contain exactly 3 concepts.');
    return { ok: false, issues };
  }

  concepts.forEach((concept, index) => {
    const label = `Concept ${index + 1} (${concept.name || 'unnamed'})`;
    const expected = EXPECTED_CONCEPTS[index];
    const text = conceptText(concept);
    const lowerName = String(concept.name || '').trim().toLowerCase();
    const cost = normalizeCost(concept.estimatedCost ?? concept.cost, NaN);
    const weeks = normalizeBuildWeeks(concept.buildTime);
    const specs = getMechanismSpecs(concept, team, season);
    const mechanismValidation = validateMechanismSpecs(specs);

    if (!concept.name || concept.name.trim().length < 8) issues.push(`${label} needs a specific robot architecture name.`);
    if (SUBSYSTEM_ONLY_NAME_PATTERN.test(concept.name || '')) issues.push(`${label} is named like a subsystem, not a full robot.`);
    if (names.has(lowerName)) issues.push(`${label} duplicates another concept name.`);
    names.add(lowerName);

    if (!expected.difficultyPattern.test(`${concept.difficulty || ''} ${concept.conceptIntent || ''} ${concept.name || ''}`)) {
      issues.push(`${label} should read as the ${expected.intent} option: ${expected.description}.`);
    }

    if (!concept.strategyFit || concept.strategyFit.trim().length < 45) {
      issues.push(`${label} needs a concrete strategyFit explaining why it fits this team.`);
    }
    if (!Number.isFinite(cost) || cost <= 0) {
      issues.push(`${label} needs a positive estimatedCost.`);
    } else if (budget > 0 && cost > budget * expected.maxBudgetRatio) {
      issues.push(`${label} estimatedCost $${cost} is too high for its ${expected.intent} lane and team budget $${budget}.`);
    }
    if (budget > 0 && cost > budget && !/budget|over|expensive|cost|fund/i.test([...normalizeTextList(concept.cons), ...normalizeTextList(concept.risks)].join(' '))) {
      issues.push(`${label} exceeds budget and must explicitly call out the budget risk.`);
    }

    if (!weeks) issues.push(`${label} needs a realistic buildTime in weeks.`);
    buildWeeks.push(weeks || 0);

    listQuality(concept, 'requiredTools', 2, issues, label);
    listQuality(concept, 'requiredParts', 3, issues, label);
    listQuality(concept, 'mainMechanisms', 4, issues, label);
    listQuality(concept, 'pros', 2, issues, label);
    listQuality(concept, 'cons', 1, issues, label);
    listQuality(concept, 'risks', 1, issues, label);
    listQuality(concept, 'upgradePath', 1, issues, label);

    if (!conceptHasMechanismCoverage(concept)) {
      issues.push(`${label} must cover drivetrain, intake/scoring, manipulator, and autonomous/control.`);
    }
    for (const issue of mechanismValidation.issues) {
      issues.push(`${label}: ${issue}`);
    }

    if (PLACEHOLDER_PATTERN.test(text)) issues.push(`${label} contains placeholder or generic language.`);
    if (UNSUPPORTED_CERTAINTY_PATTERN.test(text)) issues.push(`${label} makes an unsupported certainty or legality claim.`);
    const pointClaims = unsupportedPointClaims(text, season);
    if (pointClaims.length) {
      issues.push(`${label} invents unsupported scoring values: ${pointClaims.join(', ')}.`);
    }

    signatures.add(signatureForConcept(concept));
  });

  if (signatures.size < 3) {
    issues.push('The three concepts must have distinct mechanism architectures, not repeated variations of the same robot.');
  }
  if (buildWeeks[2] && buildWeeks[0] && buildWeeks[2] < buildWeeks[0]) {
    issues.push('The high-ceiling option should not have a shorter build time than the conservative option.');
  }

  return { ok: issues.length === 0, issues };
}

export function summarizeConceptIssues(issues = []) {
  return issues.slice(0, 10).map((issue, index) => `${index + 1}. ${issue}`).join('\n');
}
