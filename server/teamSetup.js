const EXPERIENCE_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const STRATEGY_MODES = ['ai', 'team-provided', 'hybrid'];

function cleanText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).replace(/\s+/g, ' ').trim();
}

export function cleanSetupList(value, fallback = []) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\n]/)
      : fallback;
  const seen = new Set();
  const cleaned = [];

  for (const item of raw) {
    const text = cleanText(item);
    if (!text) continue;
    if (/^(item|part|parts|sku|qty|quantity|inventory|tools?|priorities)$/i.test(text)) continue;
    if (/^\d+(\.\d+)?$/.test(text)) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text.slice(0, 80));
  }

  return cleaned.slice(0, 80);
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function allowedValue(value, allowed, fallback) {
  const normalized = cleanText(value);
  return allowed.find((item) => item.toLowerCase() === normalized.toLowerCase()) || fallback;
}

function cleanBomOverrides(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, override]) => {
    const safeOverride = override && typeof override === 'object' ? override : {};
    const qty = Number(safeOverride.qty);
    const price = Number(safeOverride.price);
    return [cleanText(key).slice(0, 120), {
      ...(Number.isFinite(qty) ? { qty: Math.max(0, Math.round(qty)) } : {}),
      ...(Number.isFinite(price) ? { price: Math.max(0, price) } : {}),
      ...(safeOverride.note ? { note: cleanText(safeOverride.note).slice(0, 160) } : {}),
    }];
  }).filter(([key]) => key));
}

export function sanitizeTeamDraft(team = {}) {
  return {
    ...team,
    name: cleanText(team.name),
    number: cleanText(team.number),
    location: cleanText(team.location),
    experience: allowedValue(team.experience, EXPERIENCE_LEVELS, 'Beginner'),
    students: Math.max(0, Math.round(finiteNumber(team.students, 0))),
    mentors: Math.max(0, Math.round(finiteNumber(team.mentors, 0))),
    budget: Math.max(0, Math.round(finiteNumber(team.budget, 0))),
    supplier: cleanText(team.supplier, 'REV Robotics'),
    manual: cleanText(team.manual, 'Current FTC manual'),
    tools: cleanSetupList(team.tools),
    priorities: cleanSetupList(team.priorities),
    inventory: cleanSetupList(team.inventory),
    timelineWeeks: Math.max(0, Math.round(finiteNumber(team.timelineWeeks, 0))),
    goals: cleanText(team.goals),
    constraints: cleanText(team.constraints),
    strategyMode: allowedValue(team.strategyMode, STRATEGY_MODES, ''),
    strategyNotes: cleanText(team.strategyNotes),
    cadExperience: allowedValue(team.cadExperience, EXPERIENCE_LEVELS, 'Beginner'),
    programmingExperience: allowedValue(team.programmingExperience, EXPERIENCE_LEVELS, 'Beginner'),
    buildSpace: cleanText(team.buildSpace),
    bomOverrides: cleanBomOverrides(team.bomOverrides),
  };
}

function check({ id, label, done, required = true, message }) {
  return { id, label, done: Boolean(done), required, message };
}

export function validateTeamSetup(team = {}, { season = null, requireSeason = false } = {}) {
  const normalized = sanitizeTeamDraft(team);
  const checks = [
    check({
      id: 'team-identity',
      label: 'Team identity',
      done: Boolean(normalized.name && normalized.number && normalized.location),
      message: 'Add team name, number, and location.',
    }),
    check({
      id: 'experience',
      label: 'Skill level',
      done: EXPERIENCE_LEVELS.includes(normalized.experience),
      message: 'Choose Beginner, Intermediate, or Advanced.',
    }),
    check({
      id: 'roster',
      label: 'Roster size',
      done: normalized.students >= 1 && normalized.mentors >= 0,
      message: 'Add at least one student and a non-negative mentor count.',
    }),
    check({
      id: 'budget-timeline',
      label: 'Budget and timeline',
      done: normalized.budget >= 250 && normalized.timelineWeeks >= 1 && normalized.timelineWeeks <= 52,
      message: 'Use a budget of at least $250 and a timeline from 1 to 52 weeks.',
    }),
    check({
      id: 'resources',
      label: 'Tools and build space',
      done: normalized.tools.length > 0 && Boolean(normalized.buildSpace),
      message: 'Add available tools and build space.',
    }),
    check({
      id: 'inventory',
      label: 'Inventory captured',
      done: normalized.inventory.length > 0,
      required: false,
      message: 'Add existing inventory so BOM missing/owned lists are useful.',
    }),
    check({
      id: 'strategy-mode',
      label: 'Strategy mode',
      done: STRATEGY_MODES.includes(normalized.strategyMode),
      message: 'Choose AI-generated, team-provided, or hybrid strategy mode.',
    }),
    check({
      id: 'robot-priorities',
      label: 'Robot priorities',
      done: normalized.priorities.length >= 2,
      message: 'Choose at least two robot priorities.',
    }),
    check({
      id: 'goals',
      label: 'Team goals',
      done: normalized.goals.length >= 20,
      message: 'Add a concrete goal for the robot plan.',
    }),
    check({
      id: 'season-source',
      label: 'Season source',
      done: Boolean(season && !season.isSample),
      required: requireSeason,
      message: 'Upload or ingest the current season manual before final recommendations.',
    }),
  ];
  const blockers = checks.filter((item) => item.required && !item.done).map((item) => item.message);
  const warnings = checks.filter((item) => !item.required && !item.done).map((item) => item.message);
  const completed = checks.filter((item) => item.done).length;

  return {
    ready: blockers.length === 0,
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    checks,
    blockers,
    warnings,
  };
}
