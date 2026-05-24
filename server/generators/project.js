import { aiStatus, callVertexJson } from '../ai.js';
import { findCatalogPart } from '../catalog.js';
import { quoteRule, sourceHealthForDocument } from '../documents.js';
import { generateCadConcept } from './cad.js';
import { generateCode } from './code.js';
import {
  normalizeAiConceptPacket,
  summarizeConceptIssues,
} from './conceptQuality.js';
import {
  attachMechanismSpecs,
  getMechanismSpecs,
  mechanismHardwareLines,
  validateMechanismSpecs,
} from './mechanisms.js';
import { validateGeneratedJava } from '../javaValidation.js';
import { queueProjectSnapshotSave } from '../persistence.js';
import { state } from '../state.js';
import { cleanSetupList, sanitizeTeamDraft, validateTeamSetup } from '../teamSetup.js';
import { nowIso, slugId } from '../utils.js';

const LEGAL_CONCERN_QUERIES = {
  drivetrain: 'robot construction drivetrain wheels frame perimeter starting configuration',
  intake: 'robot construction game piece control intake extension entanglement',
  manipulator: 'robot construction extension size lift arm safety inspection',
  control: 'control system legal electronics autonomous teleop vision',
  sensor: 'vision sensor camera control system legal autonomous',
};

function citationConfidenceScore(citation = {}) {
  if (!citation || citation.ruleNumber === 'Citation required') return 0;
  if (citation.confidence === 'High') return 3;
  if (citation.confidence === 'Medium') return 2;
  return 1;
}

function bestCitation(query) {
  const citations = quoteRule(query);
  return citations.sort((a, b) => citationConfidenceScore(b) - citationConfidenceScore(a))[0] || null;
}

export function buildLegalChecklist(project) {
  const selected = project.selectedDesign || project.concepts?.[1] || project.concepts?.[0];
  const specs = getMechanismSpecs(selected, project.team, project.season || currentSeasonSource(project));
  const checklist = specs.map((spec) => {
    const query = [
      LEGAL_CONCERN_QUERIES[spec.type] || 'robot inspection legality',
      spec.name,
      spec.architecture,
      ...(spec.risks || []),
    ].join(' ');
    const citation = bestCitation(query);
    const confidenceScore = citationConfidenceScore(citation);
    return {
      id: `${spec.id}-legal`,
      mechanismId: spec.id,
      mechanismName: spec.name,
      concern: `${spec.subsystem || spec.type} rules check`,
      status: confidenceScore >= 2 ? 'citation-available' : 'unresolved',
      severity: confidenceScore >= 2 ? 'info' : 'blocker',
      query,
      citation: citation ? {
        ruleNumber: citation.ruleNumber,
        manualSection: citation.manualSection,
        page: citation.page,
        sourceDocument: citation.sourceDocument,
        version: citation.version,
        sourceDate: citation.sourceDate,
        explanation: citation.explanation,
        confidence: citation.confidence,
      } : null,
      message: confidenceScore >= 2
        ? `Review ${citation.ruleNumber} (${citation.manualSection}${citation.page ? `, p. ${citation.page}` : ''}) before build.`
        : 'No strong indexed citation found. Do not treat this mechanism as rule-cleared until the current official manual is indexed and reviewed.',
    };
  });

  const season = project.season || currentSeasonSource(project);
  if (!season || season.isSample) {
    checklist.unshift({
      id: 'current-manual-required',
      mechanismId: null,
      mechanismName: 'Season manual',
      concern: 'Current official season source',
      status: 'unresolved',
      severity: 'blocker',
      query: 'current official FTC season manual version',
      citation: null,
      message: 'Upload or ingest the current official manual before relying on rule-sensitive recommendations.',
    });
  }

  return checklist;
}

function collectCodeHardwareNames(code = {}) {
  const text = Object.values(code || {}).join('\n');
  return Array.from(text.matchAll(/hardwareMap\.get\([^,]+,\s*"([^"]+)"/g)).map((match) => match[1]);
}

export function reviewProject(project) {
  const selected = project.selectedDesign || project.concepts?.[1] || project.concepts?.[0] || {};
  const specs = getMechanismSpecs(selected, project.team, project.season || currentSeasonSource(project));
  const mechanismValidation = validateMechanismSpecs(specs);
  const legalChecklist = buildLegalChecklist(project);
  const blockers = [];
  const warnings = [];
  const fixes = [];

  if (!mechanismValidation.ok) {
    blockers.push(...mechanismValidation.issues);
    fixes.push('Repair the selected concept mechanismSpecs before regenerating artifacts.');
  }

  const missingLegal = legalChecklist.filter((item) => item.severity === 'blocker');
  if (missingLegal.length) {
    blockers.push(`${missingLegal.length} legal checklist item(s) need stronger current-manual citations.`);
    fixes.push('Upload the current official manual or team update source, then regenerate the checklist.');
  }

  const bomMechanismIds = new Set([...(project.bom?.required || []), ...(project.bom?.optional || [])].flatMap((item) => item.mechanismIds || [item.mechanismId]).filter(Boolean));
  const physicsMechanismIds = new Set((project.physics || []).map((item) => item.mechanismId).filter(Boolean));
  const cadMechanismIds = new Set(project.cad?.mechanismIds || []);
  const buildMechanismIds = new Set((project.buildGuide || []).map((item) => item.mechanismId).filter(Boolean));
  const requiredSpecIds = specs.filter((spec) => spec.priority === 'required').map((spec) => spec.id);

  for (const id of requiredSpecIds) {
    if (!bomMechanismIds.has(id)) warnings.push(`${id} has no BOM line tied to its mechanism ID.`);
    if (!cadMechanismIds.has(id)) warnings.push(`${id} is missing from CAD mechanism IDs.`);
    if (!buildMechanismIds.has(id)) warnings.push(`${id} is missing from build guide steps.`);
    const spec = specs.find((item) => item.id === id);
    if (spec?.validation?.requiresPhysics && !physicsMechanismIds.has(id)) {
      blockers.push(`${id} requires a physics calculation but none was generated.`);
      fixes.push('Regenerate physics from the selected mechanism specs.');
    }
  }

  const expectedHardwareNames = Array.from(new Set(specs.flatMap((spec) => spec.code?.hardwareNames || [])));
  const codeHardwareNames = collectCodeHardwareNames(project.code);
  const missingCodeNames = expectedHardwareNames.filter((name) => !codeHardwareNames.includes(name));
  if (missingCodeNames.length) {
    blockers.push(`Generated Java is missing hardware names: ${missingCodeNames.join(', ')}.`);
    fixes.push('Regenerate code from the selected mechanism specs.');
  }

  if (project.codeValidation && !project.codeValidation.ok) {
    blockers.push(...(project.codeValidation.issues || []).map((issue) => `Java validation: ${issue}`));
    fixes.push('Fix Java validation issues before downloading code for robot use.');
  }

  if ((project.bom?.budgetRemaining ?? 0) < 0) {
    warnings.push(`Selected plan is $${Math.abs(project.bom.budgetRemaining).toFixed(0)} over budget before shipping.`);
    fixes.push('Choose substitutions, mark owned inventory, or select a lower-cost concept.');
  }

  if (!project.cad?.disclaimer?.toLowerCase().includes('conceptual')) {
    blockers.push('CAD output is missing conceptual/non-manufacturing disclaimer.');
    fixes.push('Regenerate CAD with the conceptual starter disclaimer.');
  }

  return {
    pass: blockers.length === 0,
    checkedAt: nowIso(),
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    fixes: Array.from(new Set(fixes)),
    legalChecklist,
    finalCaveats: [
      'Rule-sensitive claims remain unresolved unless tied to current official manual citations.',
      'CAD artifacts are conceptual starter layouts, not manufacturing-ready exports.',
      'FTC SDK code must still be compiled and tested inside the team robot project.',
    ],
  };
}

export function persistProjects() {
  return queueProjectSnapshotSave(state.projects);
}

export function defaultTeam(body = {}) {
  const team = {
    name: body.name ?? body.teamName ?? 'Metal Magic FTC',
    number: body.number ?? body.teamNumber ?? 'Prototype',
    location: body.location ?? 'Virginia',
    experience: body.experience ?? body.experienceLevel ?? 'Intermediate',
    students: body.students ?? body.numberOfStudents ?? 9,
    mentors: body.mentors ?? body.availableMentors ?? 2,
    budget: body.budget ?? 1500,
    supplier: body.supplier ?? 'REV Robotics',
    manual: body.manual ?? 'Current FTC manual',
    tools: cleanSetupList(body.tools, ['basic hand tools', '3D printer']),
    priorities: cleanSetupList(body.priorities, ['reliable autonomous', 'easy maintenance', 'simple driver control']),
    inventory: cleanSetupList(body.inventory, ['REV Starter Kit V3.1']),
    timelineWeeks: body.timelineWeeks ?? 6,
    goals: body.goals ?? 'Build a reliable, legal FTC robot that students can understand, assemble, and iterate.',
    constraints: body.constraints ?? '',
    strategyMode: body.strategyMode ?? 'hybrid',
    strategyNotes: body.strategyNotes ?? '',
    cadExperience: body.cadExperience ?? 'Beginner',
    programmingExperience: body.programmingExperience ?? 'Beginner',
    buildSpace: body.buildSpace ?? 'Classroom or garage build space',
    bomOverrides: body.bomOverrides ?? {},
  };

  return sanitizeTeamDraft(team);
}

export function validateProjectSetup(team, season = currentSeasonSource(), options = {}) {
  return validateTeamSetup(defaultTeam(team), { season, ...options });
}

export function currentSeasonSource(project = null) {
  const docs = (project?.documents || [])
    .map((id) => state.documents.get(id))
    .filter(Boolean);
  const projectSeason = docs.find((doc) => doc.seasonSource)?.seasonSource;
  if (projectSeason) return projectSeason;
  return Array.from(state.documents.values()).find((doc) => doc.seasonSource)?.seasonSource || {
    seasonName: 'Uploaded season',
    manualVersion: null,
    scoringSummary: 'No official season manual has been uploaded yet.',
    pointValues: '',
    robotConstraints: [],
    fieldFacts: [],
    citations: [],
    isSample: true,
  };
}

export function buildConcepts(team, season = currentSeasonSource()) {
  const rookie = /rookie|beginner/i.test(team.experience);
  const budget = team.budget;
  const seasonLabel = season.seasonName || 'Season';
  const scoringWords = `${season.scoringSummary || ''} ${season.pointValues || ''}`.toLowerCase();
  const scoreObject = /artifact/.test(scoringWords) ? 'artifact' : /sample|pixel|element/.test(scoringWords) ? 'game piece' : 'scoring element';
  const scoringMechanism = /goal|ramp|classifier|launch/.test(scoringWords) ? 'controlled scorer' : 'simple scoring mechanism';
  const concepts = [
    {
      id: 'simple-reliable-scorer',
      conceptIntent: 'conservative',
      name: `Simple ${seasonLabel} Scorer`,
      strategyFit: 'Scores repeatable low-risk tasks, parks reliably in autonomous, and stays easy to inspect.',
      difficulty: rookie ? 'Beginner' : 'Beginner-safe',
      estimatedCost: Math.min(940, Math.round(budget * 0.72)),
      buildTime: '3-4 weeks',
      requiredTools: ['hex drivers', 'wrenches', 'wire strippers', 'laptop'],
      requiredParts: ['Control Hub', 'HD Hex Motors', 'FTC Starter Kit V3.1', 'servo wrist'],
      mainMechanisms: ['tank drivetrain', `passive ${scoreObject} guide`, 'single-stage arm/lift', 'basic autonomous movement'],
      pros: ['lowest mechanical risk', 'fastest to assemble', 'best for limited mentor support'],
      cons: ['lower scoring ceiling', 'less maneuverable than mecanum'],
      risks: ['driver practice matters more than mechanism count'],
      ruleConcerns: quoteRule('robot construction size control system parts'),
      upgradePath: ['add mecanum wheels', 'add preset lift positions', 'add active intake'],
    },
    {
      id: 'balanced-cycle-machine',
      conceptIntent: 'balanced',
      name: `Balanced ${seasonLabel} Cycle Machine`,
      strategyFit: 'Balances scoring potential with maintainability using mecanum drive, lift presets, and a REV-first BOM.',
      difficulty: 'Intermediate',
      estimatedCost: Math.min(1280, Math.round(budget * 0.9)),
      buildTime: '5-6 weeks',
      requiredTools: ['hex drivers', 'wrenches', '3D printer optional', 'CAD viewer'],
      requiredParts: ['Mecanum wheel set', 'Control Hub', 'UltraPlanetary gearbox', 'linear motion kit'],
      mainMechanisms: ['mecanum drivetrain', 'linear slide', 'active intake', scoringMechanism],
      pros: ['higher cycle speed', 'good autonomous base', 'clean driver-control upgrade path'],
      cons: ['more tuning', 'requires square chassis and cable management'],
      risks: ['slide binding can cause current draw spikes'],
      ruleConcerns: quoteRule('autonomous teleop penalties robot construction'),
      upgradePath: ['add vision', 'add scoring macro', 'add spare slide carriage'],
    },
    {
      id: 'high-ceiling-vision-rig',
      conceptIntent: 'high-ceiling',
      name: `High Ceiling ${seasonLabel} Vision Rig`,
      strategyFit: 'Targets aggressive autonomous and fast teleop cycles for teams with enough programming and CAD bandwidth.',
      difficulty: 'Advanced',
      estimatedCost: Math.max(1600, Math.round(budget * 1.14)),
      buildTime: '7+ weeks',
      requiredTools: ['CAD', '3D printer', 'precision assembly', 'driver practice field'],
      requiredParts: ['mecanum drivetrain', 'multi-stage lift', 'camera/vision module', 'spares'],
      mainMechanisms: ['mecanum drivetrain', 'multi-stage lift', 'vision alignment', 'macro controls'],
      pros: ['highest scoring ceiling', 'strong autonomous potential'],
      cons: ['over budget for many teams', 'harder to debug'],
      risks: ['code and mechanism integration can consume the season'],
      ruleConcerns: quoteRule('vision control system autonomous rule penalties'),
      upgradePath: ['requires review before build; not recommended as first robot for rookies'],
    },
  ];

  return concepts.map((concept) => attachMechanismSpecs(concept, team, season));
}

export function buildStrategy(team, season = currentSeasonSource()) {
  const beginner = /rookie|beginner/i.test(team.experience);
  const hasAutoScoring = /auto|autonomous/i.test(season.scoringSummary || season.pointValues || '');
  const hasEndgame = /base|endgame|return|park|climb|hang/i.test(season.scoringSummary || season.pointValues || '');
  return {
    recommendation: beginner
      ? `Build drivetrain and one repeatable ${season.seasonName || 'game'} scoring path first; ignore high-complexity tasks until the robot can drive, score, and pass inspection consistently.`
      : `Prioritize a maintainable ${season.seasonName || 'season'} scoring robot with reliable teleop cycles${hasAutoScoring ? ', autonomous scoring support' : ''}, then add driver macros after logs show repeated sequences.`,
    scoringPriorities: ['repeatable teleop scoring', hasAutoScoring ? 'reliable autonomous action' : 'reliable autonomous movement', 'low penalty exposure', 'fast reset between cycles'],
    whatToIgnore: beginner ? ['multi-stage lift until the first mechanism works', 'fragile endgame gambits'] : ['unproven mechanisms that do not increase cycle reliability'],
    autonomous: ['encoder-based drive/park', hasAutoScoring ? 'score preload if mechanism is stable' : 'complete a reliable movement objective', 'time-based fallback'],
    teleOp: ['driver 1 owns drivetrain', 'driver 2 owns manipulator', 'slow mode for alignment', 'preset scoring positions'],
    endgame: [hasEndgame ? 'practice return/endgame task only after scoring is stable' : 'attempt only if build time remains after drivetrain and scoring validation'],
    driverPracticeGoals: ['five clean cycles in a row', 'zero cable snags', 'consistent button sequence under time pressure'],
    allianceCompatibility: 'Prefer a robot that can park, avoid traffic, and score one task reliably instead of blocking partners.',
    citations: quoteRule('scoring autonomous teleop endgame penalties'),
    generatedBy: 'local-fallback',
  };
}

function resolveConcept(team, conceptOrId = 'balanced-cycle-machine') {
  if (conceptOrId && typeof conceptOrId === 'object') return conceptOrId;
  const concepts = buildConcepts(team);
  return concepts.find((item) => item.id === conceptOrId) || concepts[1];
}

function inventoryIndex(team = {}) {
  const map = new Map();
  for (const raw of normalizeTextList(team.inventory)) {
    const text = raw.trim();
    if (!text) continue;
    const qtyMatch = text.match(/\b(?:x|qty[:\s]*)(\d+)\b/i) || text.match(/\((\d+)\)$/);
    const qty = qtyMatch ? Math.max(1, Number(qtyMatch[1])) : 1;
    const sku = text.match(/REV-\d{2}-\d{4}/i)?.[0]?.toUpperCase();
    const keys = [
      sku,
      text.toLowerCase(),
      text.replace(/\b(?:x|qty[:\s]*)\d+\b/gi, '').replace(/\(\d+\)$/g, '').trim().toLowerCase(),
    ].filter(Boolean);
    for (const key of keys) {
      map.set(key, Math.max(map.get(key) || 0, qty));
    }
  }
  return map;
}

function ownedQuantityForLine(line, product, inventory) {
  const sku = (product.sku || line.query.match(/REV-\d{2}-\d{4}/)?.[0] || '').toUpperCase();
  const lineText = `${product.name || ''} ${line.query || ''} ${line.part || ''}`.toLowerCase();
  const keys = [
    sku,
    product.name?.toLowerCase(),
    line.query?.toLowerCase(),
    line.part?.toLowerCase(),
  ].filter(Boolean);
  let ownedQty = Math.max(...keys.map((key) => inventory.get(key) || 0), 0);
  for (const [key, qty] of inventory.entries()) {
    if (key.length >= 6 && (lineText.includes(key) || key.includes(String(product.name || line.query).toLowerCase()))) {
      ownedQty = Math.max(ownedQty, qty);
    }
  }
  return Math.min(line.qty, ownedQty);
}

function fallbackPriceForLine(line) {
  if (line.subsystem === 'Control') return 285;
  if (line.subsystem === 'Drivetrain') return /wheel|mecanum/i.test(line.query) ? 95 : 45;
  if (line.subsystem === 'Scoring') return /linear/i.test(line.query) ? 85 : 45;
  if (line.subsystem === 'Sensors') return 40;
  if (line.subsystem === 'Electrical') return 12;
  return 30;
}

function substitutionSuggestions(line, item, team) {
  const suggestions = [];
  if (item.missingQty <= 0) return suggestions;
  if (/mecanum/i.test(line.query)) {
    suggestions.push({ label: 'Use tank drivetrain starter wheels', impact: 'Lowers cost and complexity but loses strafing.', query: 'FTC Starter Kit V3.1 REV-45-3529' });
  }
  if (/linear|slide/i.test(line.query)) {
    suggestions.push({ label: 'Use single-stage arm or shorter slide', impact: 'Reduces cost and build risk with lower reach.', query: 'Smart Robot Servo REV-41-1097' });
  }
  if (/camera|vision|webcam/i.test(line.query)) {
    suggestions.push({ label: 'Delay vision until drivetrain and scoring are stable', impact: 'Saves money early and keeps autonomous encoder-first.', query: 'encoder autonomous fallback' });
  }
  if (team.budget < 1000 && item.required !== true) {
    suggestions.push({ label: 'Defer optional item', impact: 'Keeps the first robot inside an ultra-low budget.', query: null });
  }
  return suggestions.slice(0, 2);
}

function summarizeBom(items, team) {
  const subsystemTotals = Object.values(items.reduce((acc, item) => {
    const current = acc[item.subsystem] || { subsystem: item.subsystem, total: 0, requiredTotal: 0, optionalTotal: 0, missingTotal: 0 };
    current.total += item.total;
    current.requiredTotal += item.required ? item.total : 0;
    current.optionalTotal += item.required ? 0 : item.total;
    current.missingTotal += item.missingTotal;
    acc[item.subsystem] = current;
    return acc;
  }, {})).map((row) => ({
    ...row,
    total: Number(row.total.toFixed(2)),
    requiredTotal: Number(row.requiredTotal.toFixed(2)),
    optionalTotal: Number(row.optionalTotal.toFixed(2)),
    missingTotal: Number(row.missingTotal.toFixed(2)),
  }));
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const missingSubtotal = items.reduce((sum, item) => sum + item.missingTotal, 0);
  const ownedValue = items.reduce((sum, item) => sum + item.ownedTotal, 0);
  const shippingEstimatePlaceholder = Math.max(35, Math.round(missingSubtotal * 0.06));
  const estimatedCheckoutTotal = missingSubtotal + shippingEstimatePlaceholder;
  const budgetRemaining = Number((team.budget - estimatedCheckoutTotal).toFixed(2));

  return {
    subtotal: Number(subtotal.toFixed(2)),
    missingSubtotal: Number(missingSubtotal.toFixed(2)),
    ownedValue: Number(ownedValue.toFixed(2)),
    shippingEstimatePlaceholder,
    estimatedCheckoutTotal: Number(estimatedCheckoutTotal.toFixed(2)),
    budgetRemaining,
    budgetMode: team.budget < 1000 ? 'Ultra-Low Budget' : team.budget < 1800 ? 'Balanced Budget' : 'Competitive Budget',
    subsystemTotals,
  };
}

export function buildBom(team, conceptOrId = 'balanced-cycle-machine') {
  const concept = resolveConcept(team, conceptOrId);
  const specs = getMechanismSpecs(concept, team, currentSeasonSource());
  const inventory = inventoryIndex(team);
  const mergedParts = new Map();
  for (const line of mechanismHardwareLines(specs)) {
    if (line.qty <= 0) continue;
    const key = `${line.subsystem}:${line.query}`;
    const existing = mergedParts.get(key);
    if (existing) {
      existing.qty += line.qty;
      existing.required = existing.required || line.required;
      existing.buyFirst = Math.min(existing.buyFirst, line.buyFirst);
      existing.mechanismIds = Array.from(new Set([...(existing.mechanismIds || []), line.mechanismId]));
      continue;
    }
    mergedParts.set(key, {
      ...line,
      mechanismIds: [line.mechanismId],
    });
  }
  const parts = Array.from(mergedParts.values());
  const items = parts.map((line) => {
    const product = findCatalogPart(line.query) || {};
    const sku = product.sku || line.query.match(/REV-\d{2}-\d{4}/)?.[0] || 'SKU pending';
    const override = team.bomOverrides?.[sku] || team.bomOverrides?.[line.query] || team.bomOverrides?.[line.mechanismId] || {};
    const overrideQty = Number(override.qty);
    const overridePrice = Number(override.price);
    const qty = Number.isFinite(overrideQty) ? overrideQty : line.qty;
    const price = Number.isFinite(overridePrice) ? overridePrice : Number(product.price || fallbackPriceForLine(line));
    const ownedQty = ownedQuantityForLine({ ...line, qty }, product, inventory);
    const missingQty = Math.max(0, qty - ownedQty);
    const item = {
      ...line,
      supplier: 'REV Robotics',
      sku,
      part: product.name || line.query,
      qty,
      price,
      total: price * qty,
      ownedQty,
      missingQty,
      ownedTotal: price * ownedQty,
      missingTotal: price * missingQty,
      productUrl: product.productUrl || null,
      cadUrl: product.cadUrl || null,
      stock: product.stockStatus || 'Availability not checked',
      lastChecked: product.lastChecked || null,
      inInventory: ownedQty >= line.qty,
      needsPurchase: missingQty > 0,
      budgetCategory: line.required ? 'required' : 'optional',
      overrideNote: override.note || null,
      overridden: Boolean(Number.isFinite(overrideQty) || Number.isFinite(overridePrice) || override.note),
    };
    return {
      ...item,
      substitutionSuggestions: substitutionSuggestions(line, item, team),
    };
  });
  const budget = summarizeBom(items, team);
  const sortedItems = [...items].sort((a, b) => a.buyFirst - b.buyFirst || Number(b.required) - Number(a.required));
  return {
    conceptId: concept.id || String(conceptOrId),
    conceptName: concept.name,
    required: items.filter((item) => item.required),
    optional: items.filter((item) => !item.required),
    spareParts: items.filter((item) => /motor|cable|wheel/i.test(item.part)).map((item) => ({ ...item, qty: 1, total: item.price })),
    alreadyOwned: items.filter((item) => item.inInventory),
    missing: items.filter((item) => item.needsPurchase),
    substitutions: items.flatMap((item) => item.substitutionSuggestions.map((suggestion) => ({
      ...suggestion,
      sku: item.sku,
      part: item.part,
      mechanismIds: item.mechanismIds,
    }))),
    buyFirst: sortedItems.filter((item) => item.needsPurchase).slice(0, 4),
    ...budget,
  };
}

export function calculateMechanisms({ design = {}, robot = {} } = {}) {
  const specs = getMechanismSpecs(design);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const intake = specs.find((spec) => spec.type === 'intake');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const drivetrainInputs = drivetrain?.physicsInputs || {};
  const intakeInputs = intake?.physicsInputs || {};
  const manipulatorInputs = manipulator?.physicsInputs || {};
  const wheelDiameter = Number(robot.wheelDiameterMeters || drivetrainInputs.wheelDiameterMeters || 0.096);
  const motorRpm = Number(robot.motorRpm || drivetrainInputs.motorRpm || 312);
  const gearRatio = Number(robot.gearRatio || drivetrainInputs.gearRatio || 1);
  const motorTorque = Number(robot.motorTorqueNm || drivetrainInputs.motorTorqueNm || 0.8);
  const efficiency = Number(robot.efficiency || drivetrainInputs.efficiency || 0.82);
  const loadMass = Number(design.loadMassKg || manipulatorInputs.loadMassKg || 4.2);
  const pulleyRadius = Number(design.pulleyRadiusMeters || manipulatorInputs.pulleyRadiusMeters || 0.018);
  const armLength = Number(design.armLengthMeters || manipulatorInputs.armLengthMeters || 0.16);
  const safetyFactor = Number(design.safetyFactor || manipulatorInputs.safetyFactor || 2);
  const wheelRpm = motorRpm / gearRatio;
  const wheelCircumference = Math.PI * wheelDiameter;
  const linearSpeed = (wheelRpm * wheelCircumference) / 60 * efficiency;
  const wheelTorque = motorTorque * gearRatio * efficiency;
  const forceAtWheel = wheelTorque / (wheelDiameter / 2);
  const liftForce = loadMass * 9.81;
  const pulleyTorque = liftForce * pulleyRadius;
  const recommendedLiftTorque = pulleyTorque * safetyFactor;
  const availableLiftTorque = motorTorque * 20 * efficiency;
  const liftSafetyMargin = availableLiftTorque / recommendedLiftTorque;
  const armTorque = loadMass * 9.81 * armLength;
  const intakeLoadMass = Number(intakeInputs.loadMassKg || 0.8);
  const intakeSafetyFactor = Number(intakeInputs.safetyFactor || 1.7);
  const intakeRollerRadius = Number(intakeInputs.rollerRadiusMeters || 0.025);
  const intakeSurfaceSpeed = ((motorRpm / 60) * 2 * Math.PI * intakeRollerRadius * efficiency);
  const servoTorqueNm = 1.8;
  const intakeRequiredTorque = intakeLoadMass * 9.81 * intakeRollerRadius * intakeSafetyFactor;
  const intakeMargin = servoTorqueNm / intakeRequiredTorque;
  const motorCount = specs.reduce((sum, spec) => sum + (spec.hardware || [])
    .filter((item) => item.kind === 'motor')
    .reduce((lineSum, item) => lineSum + Number(item.quantity || 1), 0), 0);
  const driveMotorCount = (drivetrain?.hardware || [])
    .filter((item) => item.kind === 'motor')
    .reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 2;
  const manipulatorMotorCount = (manipulator?.hardware || [])
    .filter((item) => item.kind === 'motor')
    .reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const intakeMotorCount = (intake?.hardware || [])
    .filter((item) => item.kind === 'motor')
    .reduce((sum, item) => sum + Number(item.quantity || 1), 0);
  const estimatedDriveCurrent = driveMotorCount * Math.min(18, Math.max(6, forceAtWheel / 8));
  const estimatedMechanismCurrent = manipulatorMotorCount * 12 + intakeMotorCount * 6;
  const estimatedPeakCurrent = estimatedDriveCurrent + estimatedMechanismCurrent + 3;
  const batteryLoad = estimatedPeakCurrent / 20;
  const robotMassKg = Number(robot.massKg || 15);
  const frameWidthMeters = Number(robot.frameWidthMeters || drivetrain?.cad?.envelopeMm?.x / 1000 || 0.455);
  const baseCgHeightMeters = Number(robot.baseCgHeightMeters || 0.12);
  const manipulatorHeightMeters = Number(robot.manipulatorHeightMeters || manipulator?.cad?.envelopeMm?.z / 1000 || 0.36);
  const raisedCgHeight = (robotMassKg * baseCgHeightMeters + loadMass * manipulatorHeightMeters) / (robotMassKg + loadMass);
  const halfTrack = frameWidthMeters / 2;
  const staticTipAngle = Math.atan2(halfTrack, raisedCgHeight) * (180 / Math.PI);
  return [
    {
      mechanismId: drivetrain?.id || 'drivetrain',
      mechanism: `${drivetrain?.name || 'Drivetrain'} wheel speed`,
      assumptions: { motorRpm, gearRatio, wheelDiameter, efficiency },
      formula: 'linear_speed = (motor_rpm / gear_ratio) * (pi * wheel_diameter) / 60 * efficiency',
      calculation: `${wheelRpm.toFixed(1)} rpm * ${wheelCircumference.toFixed(3)} m / 60 * ${efficiency}`,
      result: `${linearSpeed.toFixed(2)} m/s`,
      safetyFactor: 'Use driver cap if team is beginner',
      recommendation: linearSpeed > 1.6 ? 'Add slow mode and current limits.' : 'Conservative enough for early driver practice.',
      warning: linearSpeed > 2 ? 'High top speed may be difficult for new drivers.' : null,
    },
    {
      mechanismId: drivetrain?.id || 'drivetrain',
      mechanism: `${drivetrain?.name || 'Drivetrain'} wheel torque`,
      assumptions: { motorTorque, gearRatio, efficiency, wheelDiameter },
      formula: 'force = (motor_torque * gear_ratio * efficiency) / wheel_radius',
      calculation: `${wheelTorque.toFixed(2)} Nm / ${(wheelDiameter / 2).toFixed(3)} m`,
      result: `${forceAtWheel.toFixed(1)} N per motor`,
      safetyFactor: 'Traction and carpet conditions dominate final result',
      recommendation: 'Use current limiting if wheels brown out during pushing.',
      warning: null,
    },
    {
      mechanismId: drivetrain?.id || 'drivetrain',
      mechanism: 'Battery and current load',
      assumptions: {
        motorCount,
        driveMotorCount,
        manipulatorMotorCount,
        intakeMotorCount,
        estimatedDriveCurrent: Number(estimatedDriveCurrent.toFixed(1)),
      },
      formula: 'peak_current = drive_current + manipulator_current + intake_current + control_overhead',
      calculation: `${estimatedDriveCurrent.toFixed(1)} A drive + ${estimatedMechanismCurrent.toFixed(1)} A mechanisms + 3.0 A controls`,
      result: `${estimatedPeakCurrent.toFixed(1)} A estimated peak, ${(batteryLoad * 100).toFixed(0)}% of a 20 A conservative budget`,
      safetyFactor: batteryLoad < 1 ? 'OK' : 'High',
      recommendation: batteryLoad < 1 ? 'Run with a fresh battery and watch telemetry during pushing.' : 'Reduce drive cap, stagger mechanisms, or add current limits before match use.',
      warning: batteryLoad > 1 ? 'Estimated peak current may brown out the robot under pushing or lift load.' : null,
    },
    {
      mechanismId: manipulator?.id || 'manipulator',
      mechanism: `${manipulator?.name || 'Linear lift'} torque`,
      assumptions: { loadMass, pulleyRadius, safetyFactor, availableLiftTorque: Number(availableLiftTorque.toFixed(2)) },
      formula: 'recommended_torque = mass * gravity * pulley_radius * safety_factor',
      calculation: `${loadMass} kg * 9.81 * ${pulleyRadius} m * ${safetyFactor}`,
      result: `${recommendedLiftTorque.toFixed(2)} Nm required, ${liftSafetyMargin.toFixed(2)}x margin estimated`,
      safetyFactor: safetyFactor.toFixed(1),
      recommendation: liftSafetyMargin > 1.5 ? 'Acceptable starter margin; verify slide friction.' : 'Increase gear ratio or reduce load.',
      warning: liftSafetyMargin < 1.5 ? 'Margin is too low for a binding FTC slide.' : null,
    },
    {
      mechanismId: manipulator?.id || 'manipulator',
      mechanism: `${manipulator?.name || 'Arm'} arm torque`,
      assumptions: { loadMass, armLength, safetyFactor },
      formula: 'required_torque = load_weight * arm_length',
      calculation: `${loadMass} kg * 9.81 * ${armLength} m`,
      result: `${(armTorque * safetyFactor).toFixed(2)} Nm recommended after safety factor`,
      safetyFactor: safetyFactor.toFixed(1),
      recommendation: 'Limit servo travel and avoid hard stops.',
      warning: null,
    },
    {
      mechanismId: manipulator?.id || 'manipulator',
      mechanism: 'Center of gravity and tipping risk',
      assumptions: {
        robotMassKg,
        loadMass,
        frameWidthMeters,
        baseCgHeightMeters,
        manipulatorHeightMeters,
      },
      formula: 'tip_angle = atan((track_width / 2) / raised_center_of_gravity)',
      calculation: `atan(${halfTrack.toFixed(3)} m / ${raisedCgHeight.toFixed(3)} m)`,
      result: `${staticTipAngle.toFixed(1)} degree static tip angle estimate with mechanism raised`,
      safetyFactor: staticTipAngle > 45 ? 'Conservative' : 'Review',
      recommendation: staticTipAngle > 45 ? 'Keep heavy electronics low and test hard braking with the mechanism raised.' : 'Lower the mechanism mass, widen stance if legal, or reduce raised driving speed.',
      warning: staticTipAngle < 45 ? 'Raised mechanism may tip during fast turns or defense.' : null,
    },
    {
      mechanismId: intake?.id || 'intake',
      mechanism: `${intake?.name || 'Intake'} capture margin`,
      assumptions: {
        loadMassKg: intakeLoadMass,
        rollerRadiusMeters: intakeRollerRadius,
        motorRpm,
        efficiency,
        safetyFactor: intakeSafetyFactor,
      },
      formula: 'roller_surface_speed = motor_rpm / 60 * 2 * pi * roller_radius * efficiency; torque_margin = servo_torque / (mass * gravity * radius * safety_factor)',
      calculation: `${motorRpm} rpm, ${intakeRollerRadius} m roller, ${intakeLoadMass} kg game-piece load`,
      result: `${intakeSurfaceSpeed.toFixed(2)} m/s roller surface speed, ${intakeMargin.toFixed(2)}x servo/roller margin`,
      safetyFactor: intakeSafetyFactor.toFixed(1),
      recommendation: intakeMargin > 1.4 ? 'Start with low power and tune compression after jam testing.' : 'Reduce compression or add gearing before match use.',
      warning: intakeMargin < 1.4 ? 'Low intake margin may stall or overheat during jams.' : null,
    },
  ];
}

export function buildGuide(project) {
  const selected = project.selectedDesign || project.concepts?.[1];
  const specs = getMechanismSpecs(selected, project.team, project.season);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const intake = specs.find((spec) => spec.type === 'intake');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const sensors = specs.find((spec) => spec.type === 'sensor');
  const control = specs.find((spec) => spec.type === 'control');
  const hardwareNames = specs.flatMap((spec) => spec.code?.hardwareNames || []);
  const steps = [
    { mechanismId: null, phase: 'Prepare parts', title: 'Confirm manual, BOM, and inventory', parts: [], tools: ['laptop'], time: '30 min', diagram: 'BOM -> bins -> legal checklist', instructions: 'Open the current manual, confirm team inventory, mark already-owned REV parts, and print the legal/rules checklist.', safetyWarning: 'Do not cut, drill, or order final parts until the current official manual and inspection checklist are indexed.', checkpoint: 'Budget remaining is non-negative or substitutions are chosen.', commonMistake: 'Ordering mechanisms before confirming control system parts.', test: 'A student can point to the manual version and every buy-first part.' },
    { mechanismId: drivetrain?.id, phase: 'Build drivetrain', title: `Square the ${drivetrain?.name || selected?.name || 'selected drivetrain'} base`, parts: drivetrain?.hardware?.map((item) => item.name) || ['motors', 'wheels', 'channel', 'fasteners'], tools: ['hex drivers', 'wrenches', 'square'], time: '2-4 hr', diagram: `Top view: ${drivetrain?.cad?.placement || 'base'}, four wheels, motors inside frame`, instructions: `Build the chassis square on a flat surface, tighten gradually, and verify ${drivetrain?.name || 'drivetrain'} wheels spin freely before adding mechanisms.`, safetyWarning: 'Keep fingers clear of wheels and gears during powered tests.', checkpoint: 'Robot rolls straight with no binding.', commonMistake: drivetrain?.risks?.[0] || 'Mirroring mecanum wheels incorrectly.', test: 'Push the robot by hand; each wheel spins freely and the frame does not rack.' },
    { mechanismId: control?.id, phase: 'Wire drivetrain', title: 'Mount Control Hub, battery, switch, and drive wiring', parts: control?.hardware?.map((item) => item.name) || ['Control Hub', 'battery', 'switch', 'XT30 cables'], tools: ['wire clips', 'zip ties', 'label maker'], time: '1 hr', diagram: control?.cad?.placement || 'Rear electronics bay with strain-relieved cables', instructions: 'Route wires away from moving parts, strain-relieve connectors, label each motor cable, and leave service loops for inspection access.', safetyWarning: 'Battery must be strapped down and reachable for quick disconnect.', checkpoint: 'Robot can be disabled quickly and no wires drag.', commonMistake: 'Leaving battery unsecured or routing wires through wheel paths.', test: 'Lift and gently shake the robot; battery, switch, and hub remain fixed.' },
    { mechanismId: drivetrain?.id, phase: 'Test drivetrain', title: 'Run the drive base on blocks first', parts: drivetrain?.hardware?.map((item) => item.name) || ['drive motors', 'wheels'], tools: ['Driver Station', 'robot blocks'], time: '30 min', diagram: 'Robot on blocks -> forward, reverse, turn, strafe if mecanum', instructions: 'Run TeleOp with wheels off the floor, check each motor direction, then test slow mode and a short straight drive on tiles.', safetyWarning: 'Never stand in front of the robot during first powered motion.', checkpoint: 'Forward stick drives forward and stop disables all motors.', commonMistake: 'Fixing reversed motion in code before checking motor wiring and wheel orientation.', test: 'Drive 8 ft forward and back; robot stays controllable and wires remain clear.' },
    { mechanismId: intake?.id, phase: 'Build intake', title: `Bench-build ${intake?.name || 'intake'} as a removable module`, parts: intake?.hardware?.map((item) => item.name) || ['servo', 'roller', 'brackets'], tools: ['hex drivers', 'calipers'], time: '1-3 hr', diagram: `Front view: ${intake?.cad?.placement || 'front intake'} with serviceable fasteners`, instructions: 'Assemble the intake off-robot, verify roller direction or servo travel, then mount with two accessible fastener groups so students can remove it between matches.', safetyWarning: 'Start with low motor power and avoid pinch points near rollers.', checkpoint: 'Game piece enters smoothly without dragging the drivetrain.', commonMistake: intake?.risks?.[0] || 'Over-compressing the game piece and stalling the roller.', test: 'Run 10 intake/outtake cycles and check for heat, jams, and loose fasteners.' },
    { mechanismId: manipulator?.id, phase: 'Build scoring mechanism', title: `Assemble and brace ${manipulator?.name || 'lift or arm'}`, parts: manipulator?.hardware?.map((item) => item.name) || ['slide or arm parts', 'motor', 'gears'], tools: ['hex drivers', 'threadlocker where allowed'], time: '3-6 hr', diagram: `Side view: ${manipulator?.cad?.placement || 'scoring tower'} braced to base`, instructions: 'Assemble the mechanism outside the robot, check travel by hand, then mount with bracing back into the drivetrain rails.', safetyWarning: 'Support lifts and arms while powered off; do not rely on motor holding torque as a safety support.', checkpoint: 'Mechanism moves through full range without binding.', commonMistake: manipulator?.risks?.[0] || 'Ignoring cable path through the lift travel.', test: 'Run the mechanism at low power for 10 cycles and check for heat, belt slip, or binding.' },
    { mechanismId: sensors?.id || control?.id, phase: 'Add sensors', title: `Install ${sensors?.name || 'driver and autonomous sensors'}`, parts: sensors?.hardware?.map((item) => item.name) || ['distance sensor', 'camera or odometry as available'], tools: ['small hex drivers', 'USB cable clips'], time: '45 min', diagram: sensors?.cad?.placement || 'Protected sensor mounts with clear sight lines', instructions: 'Mount sensors where wires are strain-relieved, sight lines are clear, and bumpers or mechanisms will not block readings.', safetyWarning: 'Secure USB and sensor cables before driving; loose cables can wrap into wheels.', checkpoint: 'Telemetry reports stable sensor values while the robot is still.', commonMistake: 'Mounting cameras or distance sensors where the intake blocks the target.', test: 'Move a field object in front of the sensor and confirm telemetry changes predictably.' },
    { mechanismId: control?.id, phase: 'Upload code', title: `Configure hardware map for ${control?.name || 'TeleOp'}`, parts: [], tools: ['Android Studio', 'Driver Station'], time: '45 min', diagram: 'Laptop -> Robot Controller -> Driver Station', instructions: `Use generated case-sensitive config names for ${hardwareNames.join(', ')}, run TeleOp on blocks, and reverse motors only after checking wiring.`, safetyWarning: 'Keep the robot on blocks for the first upload and have a student ready to disable.', checkpoint: 'Forward stick drives forward, slow mode works, and intake/lift buttons match the checklist.', commonMistake: 'Changing Driver Station names without updating RobotHardware.java.', test: 'Forward stick drives forward, turn stick turns, and stop disables all motors.' },
    { mechanismId: manipulator?.id, phase: 'Tune scoring', title: 'Set presets, current limits, and driver handoff', parts: [...(manipulator?.hardware?.map((item) => item.name) || []), ...(intake?.hardware?.map((item) => item.name) || [])], tools: ['Driver Station', 'spare battery', 'field element'], time: '1-2 hr', diagram: 'Driver 2 controls -> intake -> preset -> score -> reset', instructions: 'Tune low and high presets with a charged battery, then assign driver 1 and driver 2 responsibilities for every scoring action.', safetyWarning: 'Stop immediately if a motor stalls, belt skips, or a servo hits a hard stop.', checkpoint: 'Drivers can score and reset without asking the pit crew which button to press.', commonMistake: 'Tuning presets on a weak battery and missing positions at competition.', test: 'Complete 5 full score-and-reset cycles with the same button sequence.' },
    { mechanismId: control?.id, phase: 'Tune autonomous', title: `Tune ${control?.architecture || 'autonomous'} constants and repeatability`, parts: [], tools: ['field tiles', 'tape measure', 'fresh battery'], time: '2 hr', diagram: 'Field tile path with start, score, park markers', instructions: 'Measure wheel diameter, tune encoder constants, and run 10 consecutive autonomous trials before adding extra actions.', safetyWarning: 'Leave space around the field path and disable the robot between changes.', checkpoint: 'Robot succeeds at least 8 of 10 times before adding complexity.', commonMistake: 'Testing only on a full battery or only from one starting tile.', test: 'Record 10 runs and keep the simplest path that succeeds reliably.' },
    { mechanismId: null, phase: 'Inspection and driver practice', title: 'Run final inspection, maintenance, and practice loop', parts: ['inspection checklist', 'spare fasteners', 'charged batteries'], tools: ['laptop', 'battery checker', 'pit checklist'], time: '2-4 hr', diagram: 'Inspect -> drive practice -> repair notes -> retest', instructions: 'Walk through the inspection checklist, tighten fasteners, check spare parts, and schedule driver practice with logged failure notes.', safetyWarning: 'Mentor or coach review is required before competition use.', checkpoint: 'Students can explain every mechanism, rule citation, and emergency stop path.', commonMistake: 'Skipping driver practice after the robot finally works.', test: 'Run a mock match and write down the top three fixes before the next build session.' },
  ];
  return steps.map((step) => ({ ...step, generatedBy: project.generatedBy || 'local-fallback' }));
}

export function buildAutonomousPlan(project, inputs = {}) {
  const selected = project.selectedDesign || project.concepts?.[1];
  const specs = getMechanismSpecs(selected, project.team, project.season);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const intake = specs.find((spec) => spec.type === 'intake');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const control = specs.find((spec) => spec.type === 'control');
  const driveMode = drivetrain?.code?.driveMode || 'mecanum';
  const sensors = [
    ...(control?.architecture === 'vision-auto' ? ['webcam', 'encoder fallback'] : ['drive encoders']),
    ...(inputs.sensors || []),
  ];
  const desiredAction = inputs.desiredAction || (project.team?.experience === 'Beginner' ? 'park reliably' : 'score preload then park');
  const reliability = inputs.reliability || (project.team?.experience === 'Advanced' ? 'balanced' : 'high reliability');
  const path = [
    { order: 1, action: 'Reset encoders and close intake gate', durationMs: 250, fallback: 'time-based wait if encoders fail' },
    { order: 2, action: 'Drive off start line', distanceMm: driveMode === 'mecanum' ? 610 : 560, headingDeg: 0, fallback: '0.35 power for 750 ms' },
    ...(desiredAction.includes('score')
      ? [{ order: 3, action: `Raise ${manipulator?.name || 'scoring mechanism'} to low preset`, durationMs: 900, fallback: 'skip scoring if lift stalls' }]
      : []),
    ...(desiredAction.includes('score')
      ? [{ order: 4, action: `Release with ${intake?.name || 'intake'}`, durationMs: 300, fallback: 'open servo gate only' }]
      : []),
    { order: desiredAction.includes('score') ? 5 : 3, action: driveMode === 'mecanum' ? 'Strafe or arc into parking zone' : 'Turn then drive into parking zone', distanceMm: 420, headingDeg: driveMode === 'mecanum' ? 0 : 18, fallback: 'simple forward park' },
    { order: desiredAction.includes('score') ? 6 : 4, action: 'Stop all motors and hold safe state', durationMs: 100, fallback: 'disable if motion is unexpected' },
  ];

  return {
    drivetrain: drivetrain?.architecture || driveMode,
    reliability,
    startPosition: inputs.startPosition || 'audience-side tile',
    alliance: inputs.alliance || 'configurable red or blue',
    desiredAction,
    sensors: Array.from(new Set(sensors)),
    path,
    pseudocode: [
      'initialize hardware and telemetry',
      'reset drivetrain encoders',
      'confirm battery voltage before start',
      ...path.map((step) => step.action.toLowerCase()),
      'record success/failure after each run',
    ],
    tuningConstants: {
      wheelDiameterMm: Number((drivetrain?.physicsInputs?.wheelDiameterMeters || 0.096) * 1000),
      gearRatio: drivetrain?.physicsInputs?.gearRatio || 1,
      drivePower: 0.35,
      turnPower: 0.28,
      encoderToleranceTicks: 35,
      trackWidthMm: drivetrain?.cad?.envelopeMm?.x || 455,
    },
    testingPlan: [
      'Run each path step alone with wheels on blocks.',
      'Measure actual distance after a 610 mm command and update wheel diameter or ticks-per-mm.',
      'Run 10 full autonomous trials on a charged battery.',
      'Keep the simplest version that succeeds at least 8 of 10 times.',
    ],
    warnings: [
      'Retune if wheel diameter, gear ratio, track width, robot weight, battery voltage, or floor traction changes.',
      'Do not add scoring actions until the park path is repeatable.',
      control?.architecture === 'vision-auto'
        ? 'Vision should assist alignment but encoder/time fallback must still work.'
        : 'Encoder-only paths drift; recheck on the real field surface.',
    ],
  };
}

export function buildGuideHtml(project) {
  const steps = project.buildGuide || [];
  const rows = steps.map((step, index) => `
    <section class="step">
      <div class="diagram">${step.diagram || `Step ${index + 1}`}</div>
      <div>
        <p class="kicker">Step ${index + 1} · ${step.phase}</p>
        <h2>${step.title || step.phase}</h2>
        <p>${step.instructions}</p>
        <p><strong>Estimated time:</strong> ${step.time || 'Team estimate'}</p>
        <p><strong>Parts:</strong> ${(step.parts || []).join(', ') || 'Project BOM items'}</p>
        <p><strong>Tools:</strong> ${(step.tools || []).join(', ') || 'Basic FTC tools'}</p>
        <p><strong>Safety:</strong> ${step.safetyWarning || 'Stop and ask for mentor review if anything binds, overheats, or looks unsafe.'}</p>
        <p><strong>Checkpoint:</strong> ${step.checkpoint || 'Mentor/student review before continuing.'}</p>
        <p><strong>Common mistake:</strong> ${step.commonMistake || 'Skipping fit checks before tightening hardware.'}</p>
        <p><strong>Test before continuing:</strong> ${step.test || 'Confirm the subsystem moves freely and remains inside legal limits.'}</p>
      </div>
    </section>`).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${project.team.name} Blueprint Build Guide</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #17211c; }
    h1 { font-size: 42px; margin-bottom: 4px; }
    .meta { color: #5b6b61; margin-bottom: 28px; }
    .step { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 22px 0; border-top: 1px solid #d8e2dc; page-break-inside: avoid; }
    .diagram { display: grid; min-height: 160px; place-items: center; border: 2px solid #9bb8aa; border-radius: 8px; background: #f3f8f5; font-weight: 800; text-align: center; }
    .kicker { color: #1f755f; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  </style>
</head>
<body>
  <h1>${project.team.name} Build Guide</h1>
  <p class="meta">${project.season?.seasonName || 'FTC season'} · Conceptual instructions generated by Blueprint. Verify rules, dimensions, and safety before manufacturing.</p>
  ${rows}
</body>
</html>`;
}

function parseCsvRows(text) {
  const rows = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!rows.length) return [];
  const split = (line) => line.split(/,|\t/).map((cell) => cell.trim());
  const first = split(rows[0]);
  const hasHeader = first.some((cell) => /time|timestamp|button|control|input|driver|gamepad|phase|value|action/i.test(cell));
  const headers = hasHeader ? first.map((cell) => cell.toLowerCase()) : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  return dataRows.map((line) => {
    const cells = split(line);
    if (!hasHeader) return { raw: line };
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || '']));
  });
}

function parseDriverEvents(logs = []) {
  if (Array.isArray(logs)) return logs;
  const text = String(logs || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.events)) return parsed.events;
  } catch {
    // Fall through to CSV/plain text parsing.
  }
  return parseCsvRows(text);
}

function eventTime(event, index) {
  const raw = event.timestamp ?? event.time ?? event.t ?? event.seconds ?? index;
  const numeric = Number(raw);
  if (Number.isFinite(numeric)) return numeric > 10_000 ? numeric / 1000 : numeric;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? date / 1000 : index;
}

function eventText(event) {
  return Array.isArray(event) ? event.join(' ') : JSON.stringify(event);
}

function normalizeControlName(value = '') {
  return String(value)
    .replace(/^gamepad([12])\./i, 'd$1_')
    .replace(/\s+/g, '_')
    .toLowerCase();
}

function controlsFromEvent(event) {
  const explicit = event.button ?? event.control ?? event.input ?? event.controlName ?? event.action;
  if (explicit) return [normalizeControlName(explicit)];
  const text = eventText(event);
  return Array.from(new Set((text.match(/\b(gamepad[12]\.)?(?:a|b|x|y|left_bumper|right_bumper|left_trigger|right_trigger|left_stick|right_stick|dpad_[a-z]+)\b/gi) || [])
    .map(normalizeControlName)));
}

function eventDriver(event, control = '') {
  const explicit = String(event.driver ?? event.gamepad ?? '').toLowerCase();
  if (/2|driver2|gamepad2/.test(explicit) || control.startsWith('d2_')) return 'driver2';
  return 'driver1';
}

function eventPhase(event, timeSeconds) {
  const phase = String(event.phase ?? event.matchPhase ?? '').trim().toLowerCase();
  if (phase) return phase;
  if (timeSeconds <= 30) return 'autonomous';
  if (timeSeconds >= 120) return 'endgame';
  return 'teleop';
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio))];
}

export function analyzeDriverLogs(logs = []) {
  const parsedEvents = parseDriverEvents(logs)
    .map((event, index) => ({
      source: event,
      time: eventTime(event, index),
      controls: controlsFromEvent(event),
    }))
    .filter((event) => event.controls.length)
    .sort((a, b) => a.time - b.time);
  const counts = new Map();
  const phaseCounts = new Map();
  const driverCounts = { driver1: 0, driver2: 0 };
  const transitions = new Map();
  const gaps = [];

  for (let index = 0; index < parsedEvents.length; index += 1) {
    const event = parsedEvents[index];
    const next = parsedEvents[index + 1];
    for (const control of event.controls) {
      const driver = eventDriver(event.source, control);
      const phase = eventPhase(event.source, event.time);
      counts.set(control, (counts.get(control) || 0) + 1);
      phaseCounts.set(phase, (phaseCounts.get(phase) || 0) + 1);
      driverCounts[driver] += 1;
      if (next) {
        const gap = Math.max(0, next.time - event.time);
        gaps.push(gap);
        if (gap <= 1.2) {
          for (const nextControl of next.controls) {
            if (nextControl !== control) {
              const key = `${control} -> ${nextControl}`;
              transitions.set(key, (transitions.get(key) || 0) + 1);
            }
          }
        }
      }
    }
  }

  const hot = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const repeatedSequences = Array.from(transitions.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sequence, count]) => ({
      sequence: sequence.split(' -> '),
      count,
      recommendation: `Consider binding ${sequence.replace(' -> ', ' then ')} as a single macro or preset if it is intentional.`,
    }));
  const averageGap = gaps.length ? gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length : 0;
  const suggestions = [
    repeatedSequences[0]?.recommendation || (hot.some(([button]) => /a|right_trigger/.test(button)) ? 'Repeated scoring inputs detected; consider a single right bumper score macro.' : 'No obvious repeated score macro found yet.'),
    averageGap > 1.8 ? 'Long gaps between inputs suggest the control map may be hard to find under match pressure.' : 'Input timing looks compact enough for early driver practice.',
    driverCounts.driver2 > driverCounts.driver1 * 1.4 ? 'Driver 2 owns most mechanism actions; move simple intake toggles to driver 1 only if driver 2 is overloaded.' : 'Keep drivetrain and scoring ownership split between driver 1 and driver 2.',
    'Keep slow mode on left bumper for alignment tasks.',
    'Use lift preset buttons instead of manual stick-only control once the lift is reliable.',
  ];

  return {
    eventCount: parsedEvents.length,
    buttonUsage: hot.map(([button, count]) => ({ button, count })),
    repeatedSequences,
    timingGaps: {
      averageSeconds: Number(averageGap.toFixed(2)),
      p90Seconds: Number(percentile(gaps, 0.9).toFixed(2)),
      maxSeconds: Number(Math.max(0, ...gaps).toFixed(2)),
    },
    phaseBreakdown: Array.from(phaseCounts.entries()).map(([phase, count]) => ({ phase, count })),
    heatmap: hot.map(([control, count]) => ({
      control,
      intensity: Number((count / Math.max(1, hot[0]?.[1] || count)).toFixed(2)),
      driver: eventDriver({}, control),
    })),
    suggestions,
    recommendedMap: {
      driver1: { leftStick: 'drive/strafe', rightStickX: 'turn', leftBumper: 'slow mode', rightBumper: repeatedSequences[0] ? 'top detected macro' : 'align/score assist' },
      driver2: { a: 'intake close', b: 'intake open', y: 'high preset', x: 'low preset' },
    },
  };
}

export function sponsorEmail({ team, contactName = 'Community Partner', companyName = 'your organization', amount = 500 } = {}) {
  const teamLabel = /\bFTC\b/i.test(team.name) ? team.name : `${team.name} FTC`;
  return {
    subject: `Supporting ${teamLabel} robotics students`,
    body: `Hi ${contactName},\n\nI am writing on behalf of ${team.name}, an FTC robotics team in ${team.location}. We are building a competition robot for the current FIRST Tech Challenge season and are raising funds for parts, registration, tools, and student outreach.\n\nA sponsorship of $${amount} from ${companyName} would directly support a legal, safe, student-built robot plan with documented budget, engineering calculations, and build checkpoints. We would be glad to recognize your support on team materials and share progress updates throughout the season.\n\nThank you for considering our team,\n${team.name}`,
    tiers: [
      { amount: 250, benefit: 'Team website and social recognition' },
      { amount: 500, benefit: 'Logo on pit display and outreach materials' },
      { amount: 1000, benefit: 'Robot/cart recognition where event rules allow' },
    ],
  };
}

function projectContextForPrompts(project) {
  const seasonSource = project.season || currentSeasonSource(project);
  return {
    team: project.team,
    season: {
      name: seasonSource.seasonName,
      manualVersion: seasonSource.manualVersion,
      scoringSummary: seasonSource.scoringSummary,
      robotConstraints: seasonSource.robotConstraints,
      indexedDocuments: Array.from(state.documents.values()).map((doc) => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        version: doc.version,
      })),
    },
    strategy: project.strategy,
    selectedDesign: project.selectedDesign,
    budget: project.bom ? {
      subtotal: project.bom.subtotal,
      shippingEstimatePlaceholder: project.bom.shippingEstimatePlaceholder,
      budgetRemaining: project.bom.budgetRemaining,
      budgetMode: project.bom.budgetMode,
    } : null,
    catalog: {
      supplier: 'REV Robotics',
      itemCount: state.catalog.size,
      accessMethod: 'Public REV Robotics BigCommerce product pages parsed server-side for SKU, title, price, stock-ish purchasability, docs, CAD URLs, and lastChecked.',
    },
  };
}

export function buildAgentPrompts(project) {
  const context = projectContextForPrompts(project);
  const system = blueprintSystemPrompt();
  const citationRule = 'Return rule-sensitive statements with ruleNumber, manualSection, sourceDocument, version, explanation, and confidence.';
  return {
    system,
    context,
    agents: [
      {
        name: 'Intake Agent',
        purpose: 'Normalize team profile, constraints, inventory, timeline, skill level, and priorities.',
        prompt: 'Use the project context to identify missing onboarding fields. Ask only questions that materially affect strategy, legality, BOM, physics, CAD, or code outputs.\n\nReturn JSON: { missingFields, inferredConstraints, riskFlags, nextQuestions }.',
      },
      {
        name: 'Rules Agent',
        purpose: 'Ground legal/rules checks in the indexed manual and updates.',
        prompt: `Search the indexed manual chunks for the proposed design and strategy. ${citationRule} Refuse uncited legality claims.\n\nReturn JSON: { likelyAllowed, blockers, inspectionChecklist, citations, unresolvedQuestions }.`,
      },
      {
        name: 'Strategy Agent',
        purpose: 'Turn game scoring, skill level, budget, and timeline into priorities.',
        prompt: 'Recommend what to score, what to ignore, autonomous plan, teleop plan, endgame stance, alliance fit, and driver practice goals. Cite game-sensitive claims.\n\nReturn JSON: { recommendation, scoringPriorities, ignoreList, autonomous, teleop, endgame, allianceCompatibility, citations }.',
      },
      {
        name: 'Mechanical Design Agent',
        purpose: 'Generate three feasible robot concepts and merge options.',
        prompt: 'Create exactly three robot concepts: conservative, balanced, and high-ceiling. Include difficulty, cost, build time, tools, mechanisms, pros, cons, risks, rule concerns, and upgrade path.\n\nReturn JSON: { concepts: [...] }.',
      },
      {
        name: 'Parts Agent',
        purpose: 'Build REV-first BOMs from the parsed catalog.',
        prompt: 'Use only catalog parts with SKU/productUrl when possible. Mark unknown availability as lastChecked. Split required, optional, spares, alreadyOwned, missing, substitutions, and buyFirst priorities.\n\nReturn JSON: { required, optional, spareParts, alreadyOwned, missing, subtotal, budgetRemaining, substitutions }.',
      },
      {
        name: 'Physics Agent',
        purpose: 'Verify mechanisms with math before recommendation.',
        prompt: 'For each mechanism calculate torque, RPM, speed, force, safety margin, current/battery risk if possible, and warning thresholds. Use conservative defaults when inputs are missing and label assumptions.\n\nReturn JSON: { calculations: [{ mechanism, assumptions, formula, calculation, result, safetyFactor, recommendation, warning }] }.',
      },
      {
        name: 'CAD Agent',
        purpose: 'Create conceptual CAD starter specs, not manufacturing promises.',
        prompt: 'Generate a parametric CAD plan for browser preview and future CadQuery export. Include robot envelope, subsystem placement, mounting points, views, wiring view, and verification notes. Label it conceptual.\n\nReturn JSON: { disclaimer, robotDimensionsMm, subsystemLayout, mountingPoints, views, exportPlan }.',
      },
      {
        name: 'Code Agent',
        purpose: 'Generate FTC SDK Java starter code aligned to selected hardware.',
        prompt: 'Generate Java files for RobotHardware, DriveSubsystem, LiftSubsystem, TeleOpMain, AutoMain, Constants, and README. Use FTC SDK imports, safe power clipping, telemetry, hardware init errors, and case-sensitive names.\n\nReturn JSON: { files: [{ fileName, language, content }], hardwareConfigurationChecklist }.',
      },
      {
        name: 'Build Guide Agent',
        purpose: 'Create LEGO-style assembly steps with tests.',
        prompt: 'Create build phases with step number, title, parts, tools, estimated time, instruction, safety warning, checkpoint, common mistake, and test before continuing.\n\nReturn JSON: { buildSteps }.',
      },
      {
        name: 'Driver Optimization Agent',
        purpose: 'Analyze gamepad logs and propose better control layout.',
        prompt: 'Analyze button/stick usage, repeated sequences, timing gaps, failed actions, and phase context. Recommend remaps, macros, toggles vs holds, deadzones, slow mode, presets, and driver1/driver2 ownership.\n\nReturn JSON: { buttonUsage, repeatedSequences, suggestions, recommendedMap }.',
      },
      {
        name: 'Grant Agent',
        purpose: 'Draft sponsor/grant materials from team and budget context.',
        prompt: 'Draft sponsor email, grant narrative, budget justification, donation tiers, follow-up email, thank-you email, and outreach tracker fields. Keep claims truthful and editable.\n\nReturn JSON: { sponsorEmail, grantDraft, budgetJustification, tiers, followUp, thankYou }.',
      },
      {
        name: 'Review Agent',
        purpose: 'Catch contradictions and unsafe overclaims before output.',
        prompt: 'Review the whole plan for uncited rules, impossible parts, budget mismatch, missing physics, code/CAD mismatch, unsafe build advice, and overpromised CAD. Return required fixes before final output.\n\nReturn JSON: { pass, blockers, warnings, fixes, finalCaveats }.',
      },
    ],
  };
}

function blueprintSystemPrompt() {
  return [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Prioritize student learning, FTC legality, conservative engineering assumptions, budget limits, and editable outputs.',
    'Never make a definitive rule-sensitive claim without citations from indexed official documents.',
    'When evidence is missing, say what must be checked and produce a safe next step instead of guessing.',
    'Show formulas, assumptions, inputs, calculations, result, safety factor, and warning thresholds for mechanism advice.',
    'Generate FTC SDK Java using only selected libraries and case-sensitive hardware names from the project.',
  ].join('\n');
}

function projectAiPrompt(project) {
  const season = currentSeasonSource(project);
  return [
    'Make a year-agnostic FTC robot packet from only the season/manual facts and team requirements below.',
    'Never invent point values, rule numbers, exact legal guarantees, SKU prices, or official approvals. If a fact is not in the source context, describe it as something to verify.',
    'Never make definitive legality claims. Leave rule-sensitive wording unresolved unless a cited source is provided by the context.',
    'JSON shape: { strategy, concepts, bom, physics, cad, code, autonomousPlan, buildGuide, sponsorDesk, chatSeed }.',
    'strategy: { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility }.',
    'concepts: exactly 3 complete robot architectures, not individual subsystems.',
    'The concepts must be ordered as conservative, balanced, and high-ceiling. Use conceptIntent values "conservative", "balanced", and "high-ceiling".',
    'Each concept must include a drivetrain, at least one scoring/intake mechanism, a lift/arm/manipulator, an autonomous/control plan, and a realistic build path.',
    'Concept items: { conceptIntent, id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath }.',
    'mainMechanisms must include 3-6 strings covering drivetrain, intake/scoring, lift/arm or manipulator, and autonomous/control.',
    'strategyFit must explain why the concept fits the team budget, skill level, timeline, priorities, tools, and constraints.',
    'If a concept exceeds the team budget, cons or risks must explicitly call out the budget risk.',
    'Do not use placeholder names like Concept 1, Generic Robot, Intake, Lift, Drivetrain, or Vision Rig as a standalone subsystem.',
    'bom: { required, optional, substitutions, buyFirst }, each part item { subsystem, part, sku, qty, price, stock, note }. Use "SKU pending" if unknown, and mark prices as estimates.',
    'physics: array of calculations { mechanism, assumptions, formula, calculation, result, safetyFactor, recommendation, warning }. Include drivetrain, lift/arm, intake, battery/current, and tipping checks.',
    'cad: conceptual CAD object { disclaimer, robotDimensionsMm, subsystemLayout, views, wiringView, explodedAssembly, verificationNotes }. The disclaimer must say conceptual and not manufacturing-ready.',
    'code: { files: [{ fileName, content }] }. Include FTC Java starter files for Constants.java, RobotHardware.java, DriveSubsystem.java, TeleOpMain.java, AutoMain.java, and README.md. Keep hardware names aligned to mechanisms.',
    'autonomousPlan: { drivetrain, reliability, startPosition, alliance, desiredAction, sensors, path, pseudocode, tuningConstants, testingPlan, warnings }.',
    'sponsorDesk: { subject, body, tiers } where tiers are { amount, benefit }.',
    'buildGuide: 6-10 Lego-like steps with phase, title, parts, tools, time, diagram, instructions, checkpoint, commonMistake, test.',
    `Team: ${JSON.stringify(project.team)}`,
    `Season source: ${JSON.stringify({
      seasonName: season.seasonName,
      manualVersion: season.manualVersion,
      scoringSummary: season.scoringSummary,
      pointValues: season.pointValues,
      robotConstraints: season.robotConstraints,
      fieldFacts: season.fieldFacts,
    })}`,
  ].join('\n\n');
}

function projectAiConceptRepairPrompt(project, rejectedConcepts, qualityIssues = []) {
  const season = currentSeasonSource(project);
  return [
    'Repair the rejected FTC robot concepts into exactly three complete robot architectures.',
    'Do not make each concept a single subsystem. Each concept must be a full robot plan.',
    'Required concept shape: { conceptIntent, id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath }.',
    'Use conceptIntent values in order: conservative, balanced, high-ceiling.',
    'Every mainMechanisms array must include drivetrain, intake/scoring, lift/arm or manipulator, and autonomous/control.',
    'The three concepts must be distinct conservative, balanced, and high-ceiling robot architectures.',
    'Do not invent point values, official approvals, exact rule numbers, legal guarantees, SKU prices, or unsupported scoring facts.',
    'If a concept exceeds budget, risks or cons must explicitly say it is over budget.',
    `Quality gate failures to fix:\n${summarizeConceptIssues(qualityIssues) || 'No details available.'}`,
    `Team: ${JSON.stringify(project.team)}`,
    `Season: ${JSON.stringify({
      seasonName: season.seasonName,
      manualVersion: season.manualVersion,
      scoringSummary: season.scoringSummary,
      pointValues: season.pointValues,
    })}`,
    `Rejected concepts: ${JSON.stringify(rejectedConcepts || [])}`,
  ].join('\n\n');
}

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

function normalizeAiConcepts(concepts, team, season) {
  const packet = normalizeAiConceptPacket(concepts, team, season);
  if (!packet.accepted) {
    return {
      ...packet,
      concepts: buildConcepts(team, season),
      usedFallback: true,
    };
  }
  return {
    ...packet,
    concepts: packet.concepts.map((concept) => ({
      ...concept,
      ruleConcerns: quoteRule(`${concept.name || ''} robot construction scoring`),
    })),
    usedFallback: false,
  };
}

function normalizeAiBuildGuide(steps, project) {
  if (!Array.isArray(steps) || steps.length === 0) return buildGuide(project);
  return steps.map((step, index) => ({
    mechanismId: step.mechanismId || null,
    phase: step.phase || `Step ${index + 1}`,
    title: step.title || step.phase || `Build step ${index + 1}`,
    parts: Array.isArray(step.parts) ? step.parts : [],
    tools: Array.isArray(step.tools) ? step.tools : project.team.tools || [],
    time: step.time || step.estimatedTime || '30-60 min',
    diagram: step.diagram || `Diagram ${index + 1}`,
    instructions: step.instructions || step.instruction || '',
    checkpoint: step.checkpoint || 'Review before continuing.',
    commonMistake: step.commonMistake || 'Skipping fit checks.',
    test: step.test || step.testBeforeContinuing || 'Verify the subsystem is safe and repeatable.',
    generatedBy: project.generatedBy || 'vertex-ai',
  }));
}

function normalizeAiBomLine(item = {}, index = 0, required = true, project) {
  const qty = Math.max(0, Number(item.qty ?? item.quantity ?? 1) || 0);
  const price = Math.max(0, normalizeCost(item.price ?? item.unitPrice ?? item.estimatedPrice, 0));
  const sku = String(item.sku || item.partNumber || 'SKU pending');
  const subsystem = String(item.subsystem || item.category || 'Generated');
  const part = String(item.part || item.name || item.description || `AI BOM item ${index + 1}`);
  const mechanismId = item.mechanismId || null;
  const mechanismIds = Array.isArray(item.mechanismIds)
    ? item.mechanismIds.filter(Boolean)
    : mechanismId ? [mechanismId] : [];
  const override = project.team.bomOverrides?.[sku] || {};
  const overrideQty = Number(override.qty);
  const overridePrice = Number(override.price);
  const finalQty = Number.isFinite(overrideQty) ? overrideQty : qty;
  const finalPrice = Number.isFinite(overridePrice) ? overridePrice : price;
  return {
    mechanismId,
    mechanismIds,
    subsystem,
    sku,
    part,
    qty: finalQty,
    price: finalPrice,
    total: finalQty * finalPrice,
    ownedQty: 0,
    missingQty: finalQty,
    ownedTotal: 0,
    missingTotal: finalQty * finalPrice,
    supplier: item.supplier || project.team.supplier || 'Team supplier',
    stock: item.stock || item.availability || 'AI estimate; verify before ordering',
    productUrl: item.productUrl || null,
    lastChecked: item.lastChecked || nowIso(),
    required,
    budgetCategory: required ? 'required' : 'optional',
    substitutionSuggestions: Array.isArray(item.substitutionSuggestions) ? item.substitutionSuggestions : [],
    overrideNote: override.note || item.note || null,
    overridden: Boolean(Number.isFinite(overrideQty) || Number.isFinite(overridePrice) || override.note),
  };
}

function normalizeAiBom(bom, project) {
  if (!bom || typeof bom !== 'object') return null;
  const required = (Array.isArray(bom.required) ? bom.required : [])
    .map((item, index) => normalizeAiBomLine(item, index, true, project));
  const optional = (Array.isArray(bom.optional) ? bom.optional : [])
    .map((item, index) => normalizeAiBomLine(item, index, false, project));
  const all = [...required, ...optional];
  if (all.length === 0) return null;
  const summary = summarizeBom(all.map((item) => ({
    ...item,
    ownedTotal: item.ownedTotal || 0,
    missingTotal: item.missingTotal ?? item.total,
    required: item.required,
  })), project.team);
  return {
    conceptId: project.selectedDesign?.id || null,
    conceptName: project.selectedDesign?.name || 'AI selected concept',
    required,
    optional,
    spareParts: Array.isArray(bom.spareParts) ? bom.spareParts : [],
    alreadyOwned: [],
    missing: all.filter((item) => item.missingQty > 0),
    substitutions: Array.isArray(bom.substitutions) ? bom.substitutions : [],
    buyFirst: Array.isArray(bom.buyFirst) && bom.buyFirst.length
      ? bom.buyFirst
      : all.filter((item) => item.missingQty > 0).slice(0, 4),
    ...summary,
  };
}

function normalizeAiPhysics(physics, project) {
  if (!Array.isArray(physics) || physics.length === 0) return null;
  return physics.map((item, index) => ({
    mechanismId: item.mechanismId || null,
    mechanism: String(item.mechanism || `AI calculation ${index + 1}`),
    assumptions: item.assumptions && typeof item.assumptions === 'object' ? item.assumptions : {},
    formula: String(item.formula || 'AI-provided calculation'),
    calculation: String(item.calculation || item.inputs || ''),
    result: String(item.result || 'Review required'),
    safetyFactor: String(item.safetyFactor || item.margin || 'Review'),
    recommendation: String(item.recommendation || 'Verify with team measurements.'),
    warning: item.warning || null,
    generatedBy: project.generatedBy || 'vertex-ai',
  }));
}

function normalizeAiCad(cad, project) {
  if (!cad || typeof cad !== 'object') return null;
  const fallback = generateCadConcept(project);
  const disclaimer = String(cad.disclaimer || fallback.disclaimer);
  return {
    ...fallback,
    ...cad,
    disclaimer: /conceptual/i.test(disclaimer)
      ? disclaimer
      : `${disclaimer} Conceptual CAD starter; verify dimensions before manufacturing.`,
    generatedBy: project.generatedBy || 'vertex-ai',
    sourceReference: 'AI-generated from team constraints, selected architecture, and indexed season context.',
    parametricLayout: cad.parametricLayout || fallback.parametricLayout,
    blueprintViews: cad.blueprintViews || fallback.blueprintViews,
    wiringView: cad.wiringView || fallback.wiringView,
    explodedAssembly: cad.explodedAssembly || fallback.explodedAssembly,
    robotDimensionsMm: cad.robotDimensionsMm || fallback.robotDimensionsMm,
    mechanismIds: fallback.mechanismIds,
  };
}

function normalizeAiCode(code) {
  const files = Array.isArray(code?.files) ? code.files : [];
  const entries = files
    .map((file) => [file.fileName || file.name, file.content || file.code])
    .filter(([name, content]) => name && content);
  if (entries.length === 0) return null;
  return Object.fromEntries(entries.map(([name, content]) => [String(name), String(content)]));
}

function normalizeAiAutonomousPlan(plan, project) {
  if (!plan || typeof plan !== 'object') return null;
  const fallback = buildAutonomousPlan(project);
  return {
    drivetrain: plan.drivetrain || fallback.drivetrain,
    reliability: plan.reliability || fallback.reliability,
    startPosition: plan.startPosition || fallback.startPosition,
    alliance: plan.alliance || fallback.alliance,
    desiredAction: plan.desiredAction || fallback.desiredAction,
    sensors: normalizeTextList(plan.sensors, fallback.sensors),
    path: Array.isArray(plan.path) && plan.path.length ? plan.path : fallback.path,
    pseudocode: normalizeTextList(plan.pseudocode, fallback.pseudocode),
    tuningConstants: plan.tuningConstants && typeof plan.tuningConstants === 'object' ? plan.tuningConstants : fallback.tuningConstants,
    testingPlan: normalizeTextList(plan.testingPlan, fallback.testingPlan),
    warnings: normalizeTextList(plan.warnings, fallback.warnings),
    generatedBy: project.generatedBy || 'vertex-ai',
  };
}

function normalizeAiSponsorDesk(sponsorDesk, project) {
  if (!sponsorDesk || typeof sponsorDesk !== 'object') return null;
  return {
    subject: String(sponsorDesk.subject || `Supporting ${project.team.name} FTC Robotics`),
    body: String(sponsorDesk.body || ''),
    tiers: Array.isArray(sponsorDesk.tiers) ? sponsorDesk.tiers.map((tier) => ({
      amount: normalizeCost(tier.amount, 0),
      benefit: String(tier.benefit || 'Team recognition'),
    })) : [],
    generatedBy: project.generatedBy || 'vertex-ai',
  };
}

export function rebuildDerivedArtifacts(project, { preserveAi = true } = {}) {
  project.selectedDesign = project.selectedDesign || project.concepts[1] || project.concepts[0];
  if (!preserveAi || !project.bom) project.bom = buildBom(project.team, project.selectedDesign);
  if (!preserveAi || !project.physics) project.physics = calculateMechanisms({ design: project.selectedDesign });
  if (!preserveAi || !project.cad) project.cad = generateCadConcept(project);
  if (!preserveAi || !project.code) project.code = generateCode(project);
  project.codeValidation = validateGeneratedJava(project.code);
  if (!preserveAi || !project.autonomousPlan) project.autonomousPlan = buildAutonomousPlan(project);
  if (!preserveAi || !project.buildGuide) project.buildGuide = buildGuide(project);
  if (!preserveAi || !project.sponsorDraft) project.sponsorDraft = sponsorEmail({ team: project.team });
  project.driverInsight = project.driverInsight || analyzeDriverLogs([]);
  project.legalChecklist = buildLegalChecklist(project);
  project.review = reviewProject(project);
}

export async function applyAiPacket(project) {
  const ai = await callVertexJson({
    systemPrompt: blueprintSystemPrompt(),
    prompt: projectAiPrompt(project),
  });
  if (!ai.ok) {
    project.generatedBy = 'local-fallback';
    project.aiFallbackReason = ai.error;
    return project;
  }

  const season = currentSeasonSource(project);
  project.generatedBy = ai.generatedBy;
  project.strategy = ai.data.strategy || project.strategy;
  let conceptPacket = normalizeAiConcepts(ai.data.concepts, project.team, season);
  let conceptsRepaired = false;
  if (!conceptPacket.accepted && Array.isArray(ai.data.concepts)) {
    const repair = await callVertexJson({
      systemPrompt: blueprintSystemPrompt(),
      prompt: projectAiConceptRepairPrompt(project, ai.data.concepts, conceptPacket.issues),
    });
    if (repair.ok) {
      conceptPacket = normalizeAiConcepts(repair.data.concepts, project.team, season);
      if (conceptPacket.accepted) {
        project.generatedBy = repair.generatedBy;
        conceptsRepaired = true;
      }
    }
  }
  project.concepts = conceptPacket.concepts;
  project.conceptQuality = {
    accepted: conceptPacket.accepted,
    repaired: conceptsRepaired,
    usedFallback: conceptPacket.usedFallback,
    issues: conceptPacket.issues || [],
  };
  project.aiFallbackReason = conceptPacket.accepted
    ? null
    : `Vertex concept packet was rejected by the quality gate: ${(conceptPacket.issues || []).slice(0, 3).join(' ')}`;
  project.selectedDesign = project.concepts[1] || project.concepts[0];
  project.buildGuide = conceptsRepaired || conceptPacket.usedFallback
    ? buildGuide(project)
    : normalizeAiBuildGuide(ai.data.buildGuide, project);
  const aiBom = normalizeAiBom(ai.data.bom, project);
  const aiPhysics = normalizeAiPhysics(ai.data.physics, project);
  const aiCad = normalizeAiCad(ai.data.cad, project);
  const aiCode = normalizeAiCode(ai.data.code);
  const aiAutonomous = normalizeAiAutonomousPlan(ai.data.autonomousPlan, project);
  const aiSponsorDesk = normalizeAiSponsorDesk(ai.data.sponsorDesk, project);
  if (aiBom) project.bom = aiBom;
  if (aiPhysics) project.physics = aiPhysics;
  if (aiCad) project.cad = aiCad;
  if (aiCode) project.code = aiCode;
  if (aiAutonomous) project.autonomousPlan = aiAutonomous;
  if (aiSponsorDesk) project.sponsorDraft = aiSponsorDesk;
  project.artifactGeneration = {
    generatedBy: project.generatedBy,
    ai: {
      strategy: Boolean(ai.data.strategy),
      concepts: conceptPacket.accepted,
      bom: Boolean(aiBom),
      physics: Boolean(aiPhysics),
      cad: Boolean(aiCad),
      code: Boolean(aiCode),
      autonomousPlan: Boolean(aiAutonomous),
      buildGuide: !conceptsRepaired && !conceptPacket.usedFallback && Array.isArray(ai.data.buildGuide),
      sponsorDesk: Boolean(aiSponsorDesk),
    },
  };
  return project;
}

export async function createProject(body = {}, { transient = false, skipAi = false } = {}) {
  const team = defaultTeam(body.team || body);
  const id = slugId('project');
  const project = {
    id,
    transient,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    team,
    documents: Array.from(state.documents.values()).map((doc) => doc.id),
    season: currentSeasonSource(),
    generatedBy: 'local-fallback',
    aiFallbackReason: null,
    setupValidation: validateProjectSetup(team, currentSeasonSource(), { requireSeason: false }),
    conceptQuality: { accepted: true, repaired: false, usedFallback: true, issues: [] },
    strategy: buildStrategy(team, currentSeasonSource()),
    concepts: buildConcepts(team, currentSeasonSource()),
    selectedDesign: null,
    bom: null,
    physics: calculateMechanisms(),
    cad: null,
    code: null,
    buildGuide: null,
    warnings: [
      'Rule-sensitive claims require citations from the indexed manual.',
      'CAD is conceptual until dimensions and clearances are verified.',
      'Generated FTC SDK code must be compiled in a real FTC project before robot use.',
    ],
  };
  if (!skipAi) {
    await applyAiPacket(project);
  }
  project.season = currentSeasonSource(project);
  project.setupValidation = validateProjectSetup(project.team, project.season, { requireSeason: false });
  project.selectedDesign = project.selectedDesign || project.concepts[1] || project.concepts[0];
  rebuildDerivedArtifacts(project, { preserveAi: !skipAi });
  state.projects.set(id, project);
  if (!transient) await persistProjects();
  return project;
}

export function projectForResponse(project) {
  if (!project) return null;
  const bomItems = [...(project.bom?.required || []), ...(project.bom?.optional || [])];
  const id = project.id || 'demo';
  const season = project.season || currentSeasonSource(project);
  const review = project.review || reviewProject(project);
  const legalChecklist = project.legalChecklist || review.legalChecklist || buildLegalChecklist(project);
  return {
    ...project,
    team: { ...project.team, manual: project.team.manual },
    season,
    setupValidation: project.setupValidation || validateProjectSetup(project.team, season, { requireSeason: false }),
    generatedBy: project.generatedBy || 'local-fallback',
    aiFallbackReason: project.aiFallbackReason || null,
    aiStatus: aiStatus(),
    sourceDocuments: (project.documents || []).map((docId) => state.documents.get(docId)).filter(Boolean).map((doc) => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      version: doc.version,
      sourceDate: doc.sourceDate,
      sourceUrl: doc.sourceUrl,
      pages: doc.pages,
      ingestedAt: doc.ingestedAt,
      seasonSource: doc.seasonSource,
      health: sourceHealthForDocument(doc, (project.documents || []).map((docId) => state.documents.get(docId)).filter(Boolean)),
    })),
    artifactUrls: {
      projectJson: `/api/projects/${id}/export.json`,
      codeZip: `/api/projects/${id}/code/export.zip`,
      cadConceptJson: `/api/projects/${id}/cad/export.concept.json`,
      cadConceptStep: `/api/projects/${id}/cad/export.concept.step`,
      cadGltf: `/api/projects/${id}/cad/export.concept.json`,
      cadStep: `/api/projects/${id}/cad/export.concept.step`,
      buildGuideHtml: `/api/projects/${id}/build-guide/export.html`,
    },
    strategy: project.strategy || buildStrategy(project.team, season),
    concepts: project.concepts.map((concept) => ({
      ...concept,
      estimatedCost: normalizeCost(concept.estimatedCost ?? concept.cost, 0),
      cost: normalizeCost(concept.estimatedCost ?? concept.cost, 0),
      fit: concept.strategyFit ?? concept.fit ?? '',
      buildTime: concept.buildTime,
      mechanisms: concept.mainMechanisms ?? concept.mechanisms ?? [],
      mechanismSpecs: getMechanismSpecs(concept, project.team, project.season || currentSeasonSource(project)),
      risks: concept.risks,
    })),
    legalChecklist,
    review,
    rules: legalChecklist.map((item) => ({
      rule: item.citation?.ruleNumber || 'Citation required',
      section: item.citation?.manualSection || item.concern,
      status: item.status === 'citation-available' ? 'Indexed citation available' : 'Needs citation verification',
      confidence: item.citation?.confidence || 'Low',
      note: item.message,
      sourceDocument: item.citation?.sourceDocument || 'Indexed documents',
      mechanismId: item.mechanismId,
      page: item.citation?.page,
      version: item.citation?.version,
    })),
    bom: bomItems.map((item) => ({
      mechanismId: item.mechanismId,
      mechanismIds: item.mechanismIds,
      mechanismName: item.mechanismName,
      subsystem: item.subsystem,
      sku: item.sku,
      part: item.part,
      qty: item.qty,
      ownedQty: item.ownedQty,
      missingQty: item.missingQty,
      price: item.price,
      total: item.total,
      missingTotal: item.missingTotal,
      budgetCategory: item.budgetCategory,
      stock: item.stock,
      productUrl: item.productUrl,
      lastChecked: item.lastChecked,
      substitutionSuggestions: item.substitutionSuggestions,
      overrideNote: item.overrideNote,
      overridden: item.overridden,
    })),
    bomOverrides: project.team.bomOverrides || {},
    bomSummary: project.bom ? {
      conceptId: project.bom.conceptId,
      conceptName: project.bom.conceptName,
      subtotal: project.bom.subtotal,
      missingSubtotal: project.bom.missingSubtotal,
      ownedValue: project.bom.ownedValue,
      shippingEstimatePlaceholder: project.bom.shippingEstimatePlaceholder,
      estimatedCheckoutTotal: project.bom.estimatedCheckoutTotal,
      budgetRemaining: project.bom.budgetRemaining,
      budgetMode: project.bom.budgetMode,
      subsystemTotals: project.bom.subsystemTotals || [],
      buyFirst: project.bom.buyFirst || [],
      substitutions: project.bom.substitutions || [],
    } : null,
    physics: project.physics.map((item) => ({
      mechanismId: item.mechanismId,
      mechanism: item.mechanism,
      formula: item.formula,
      inputs: Object.entries(item.assumptions || {}).map(([key, value]) => `${key}: ${value}`).join(', '),
      result: item.result,
      recommendation: item.recommendation,
      margin: item.safetyFactor,
      warning: item.warning,
    })),
    buildSteps: project.buildGuide?.map((step) => `${step.phase}: ${step.instructions}`) || [],
    buildGuide: project.buildGuide || [],
    codeFiles: Object.keys(project.code || {}),
    codeValidation: project.codeValidation || validateGeneratedJava(project.code || {}),
    autonomousPlan: project.autonomousPlan || buildAutonomousPlan(project),
    driverInsight: project.driverInsight?.suggestions?.join(' ') || '',
    driverAnalysis: project.driverInsight || null,
    sponsorDraft: project.sponsorDraft?.subject || '',
    sponsorDesk: project.sponsorDraft || null,
  };
}
