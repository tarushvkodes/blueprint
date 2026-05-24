import { aiStatus, callVertexJson } from '../ai.js';
import { findCatalogPart } from '../catalog.js';
import { quoteRule } from '../documents.js';
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
} from './mechanisms.js';
import { validateGeneratedJava } from '../javaValidation.js';
import { queueProjectSnapshotSave } from '../persistence.js';
import { state } from '../state.js';
import { cleanSetupList, sanitizeTeamDraft, validateTeamSetup } from '../teamSetup.js';
import { nowIso, slugId } from '../utils.js';

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

export function buildBom(team, conceptOrId = 'balanced-cycle-machine') {
  const concept = resolveConcept(team, conceptOrId);
  const specs = getMechanismSpecs(concept, team, currentSeasonSource());
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
    const price = Number(product.price || (line.subsystem === 'Control' ? 285 : line.subsystem === 'Drivetrain' ? 45 : 30));
    const sku = product.sku || line.query.match(/REV-\d{2}-\d{4}/)?.[0] || 'SKU pending';
    const inventoryText = normalizeTextList(team.inventory).join(' ').toLowerCase();
    const owned = inventoryText.includes(sku.toLowerCase()) || inventoryText.includes(String(product.name || line.query).toLowerCase());
    return {
      ...line,
      supplier: 'REV Robotics',
      sku,
      part: product.name || line.query,
      price,
      total: price * line.qty,
      productUrl: product.productUrl || null,
      cadUrl: product.cadUrl || null,
      stock: product.stockStatus || 'Availability not checked',
      lastChecked: product.lastChecked || null,
      inInventory: owned,
      substitutionSuggestions: [],
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  return {
    conceptId: concept.id || String(conceptOrId),
    conceptName: concept.name,
    required: items.filter((item) => item.required),
    optional: items.filter((item) => !item.required),
    spareParts: items.filter((item) => /motor|cable|wheel/i.test(item.part)).map((item) => ({ ...item, qty: 1, total: item.price })),
    alreadyOwned: items.filter((item) => item.inInventory),
    missing: items.filter((item) => !item.inInventory),
    subtotal,
    shippingEstimatePlaceholder: Math.max(35, Math.round(subtotal * 0.06)),
    budgetRemaining: team.budget - subtotal,
    buyFirst: items.sort((a, b) => a.buyFirst - b.buyFirst).slice(0, 4),
    budgetMode: team.budget < 1000 ? 'Ultra-Low Budget' : team.budget < 1800 ? 'Balanced Budget' : 'Competitive Budget',
  };
}

export function calculateMechanisms({ design = {}, robot = {} } = {}) {
  const specs = getMechanismSpecs(design);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const drivetrainInputs = drivetrain?.physicsInputs || {};
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
  ];
}

export function buildGuide(project) {
  const selected = project.selectedDesign || project.concepts?.[1];
  const specs = getMechanismSpecs(selected, project.team, project.season);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const intake = specs.find((spec) => spec.type === 'intake');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const control = specs.find((spec) => spec.type === 'control');
  return [
    { mechanismId: null, phase: 'Prepare parts', title: 'Confirm manual, BOM, and inventory', parts: [], tools: ['laptop'], time: '30 min', diagram: 'BOM -> bins -> legal checklist', instructions: 'Open the current manual, confirm team inventory, mark already-owned REV parts, and print the legal/rules checklist.', checkpoint: 'Budget remaining is non-negative or substitutions are chosen.', commonMistake: 'Ordering mechanisms before confirming control system parts.', test: 'A student can point to the manual version and every buy-first part.' },
    { mechanismId: drivetrain?.id, phase: 'Build drivetrain', title: `Assemble ${drivetrain?.name || selected?.name || 'selected drivetrain'}`, parts: drivetrain?.hardware?.map((item) => item.name) || ['motors', 'wheels', 'channel', 'fasteners'], tools: ['hex drivers', 'wrenches'], time: '2-4 hr', diagram: `Top view: ${drivetrain?.cad?.placement || 'base'}, four wheels, motors inside frame`, instructions: `Build the chassis square on a flat surface, tighten gradually, and verify ${drivetrain?.name || 'drivetrain'} wheels spin freely.`, checkpoint: 'Robot rolls straight with no binding.', commonMistake: drivetrain?.risks?.[0] || 'Mirroring mecanum wheels incorrectly.', test: 'Push the robot by hand; each wheel spins freely and the frame does not rack.' },
    { mechanismId: control?.id, phase: 'Wire drivetrain', title: 'Mount Control Hub and battery safely', parts: control?.hardware?.map((item) => item.name) || ['Control Hub', 'battery', 'switch', 'XT30 cables'], tools: ['wire clips', 'zip ties'], time: '1 hr', diagram: control?.cad?.placement || 'Rear electronics bay with strain-relieved cables', instructions: 'Route wires away from moving parts, strain-relieve connectors, and label each motor cable.', checkpoint: 'Robot can be disabled quickly and no wires drag.', commonMistake: 'Leaving battery unsecured.', test: 'Lift and gently shake the robot; battery and hub remain fixed.' },
    { mechanismId: manipulator?.id, phase: 'Build scoring mechanism', title: `Bench-test ${manipulator?.name || 'lift'} and ${intake?.name || 'intake'} before mounting`, parts: [...(manipulator?.hardware?.map((item) => item.name) || []), ...(intake?.hardware?.map((item) => item.name) || [])], tools: ['hex drivers'], time: '3-6 hr', diagram: `Side view: ${manipulator?.cad?.placement || 'scoring tower'} braced to base`, instructions: 'Assemble the mechanism outside the robot, check current draw, then mount with accessible fasteners.', checkpoint: 'Mechanism moves through full range without binding.', commonMistake: manipulator?.risks?.[0] || 'Ignoring cable path through the lift travel.', test: 'Run the mechanism at low power for 10 cycles and check for heat or binding.' },
    { mechanismId: control?.id, phase: 'Upload code', title: `Configure hardware map for ${control?.name || 'TeleOp'}`, parts: [], tools: ['Android Studio', 'Driver Station'], time: '45 min', diagram: 'Laptop -> Robot Controller -> Driver Station', instructions: `Use generated case-sensitive config names for ${specs.flatMap((spec) => spec.code?.hardwareNames || []).join(', ')}, run TeleOp on blocks, and reverse motors only after checking wiring.`, checkpoint: 'Forward stick drives forward and slow mode works.', commonMistake: 'Changing config names without updating code.', test: 'Forward stick drives forward, turn stick turns, and stop disables all motors.' },
    { mechanismId: control?.id, phase: 'Tune autonomous', title: `Tune ${control?.architecture || 'autonomous'} constants and repeatability`, parts: [], tools: ['field tiles', 'tape measure'], time: '2 hr', diagram: 'Field tile path with start, score, park markers', instructions: 'Measure wheel diameter, tune encoder constants, and run 10 consecutive autonomous trials.', checkpoint: 'Robot succeeds at least 8 of 10 times before adding complexity.', commonMistake: 'Testing only on a full battery.', test: 'Record 10 runs and keep the simplest path that succeeds reliably.' },
  ].map((step) => ({ ...step, generatedBy: project.generatedBy || 'local-fallback' }));
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
        <p><strong>Parts:</strong> ${(step.parts || []).join(', ') || 'Project BOM items'}</p>
        <p><strong>Tools:</strong> ${(step.tools || []).join(', ') || 'Basic FTC tools'}</p>
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

export function analyzeDriverLogs(logs = []) {
  const events = Array.isArray(logs) ? logs : String(logs).split(/\n/).map((line) => line.split(','));
  const counts = new Map();
  for (const event of events) {
    const text = Array.isArray(event) ? event.join(' ') : JSON.stringify(event);
    for (const token of text.match(/\b(gamepad[12]\.)?[abxy]|left_bumper|right_bumper|left_trigger|right_trigger|dpad_[a-z]+\b/gi) || []) {
      counts.set(token.toLowerCase(), (counts.get(token.toLowerCase()) || 0) + 1);
    }
  }
  const hot = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    eventCount: events.length,
    buttonUsage: hot.map(([button, count]) => ({ button, count })),
    suggestions: [
      hot.some(([button]) => /a|right_trigger/.test(button)) ? 'Repeated scoring inputs detected; consider a single right bumper score macro.' : 'No obvious repeated score macro found yet.',
      'Keep slow mode on left bumper for alignment tasks.',
      'Use lift preset buttons instead of manual stick-only control once the lift is reliable.',
    ],
    recommendedMap: {
      driver1: { leftStick: 'drive/strafe', rightStickX: 'turn', leftBumper: 'slow mode', rightBumper: 'align/score assist' },
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
  const system = [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Prioritize student learning, FTC legality, conservative engineering assumptions, budget limits, and editable outputs.',
    'Never make a definitive rule-sensitive claim without citations from indexed official documents.',
    'When evidence is missing, say what must be checked and produce a safe next step instead of guessing.',
    'Show formulas, assumptions, inputs, calculations, result, safety factor, and warning thresholds for mechanism advice.',
    'Generate FTC SDK Java using only selected libraries and case-sensitive hardware names from the project.',
  ].join('\n');
  const citationRule = 'Return rule-sensitive statements with ruleNumber, manualSection, sourceDocument, version, explanation, and confidence.';
  return {
    system,
    context,
    agents: [
      {
        name: 'Intake Agent',
        purpose: 'Normalize team profile, constraints, inventory, timeline, skill level, and priorities.',
        prompt: `${system}\n\nUse the project context to identify missing onboarding fields. Ask only questions that materially affect strategy, legality, BOM, physics, CAD, or code outputs.\n\nReturn JSON: { missingFields, inferredConstraints, riskFlags, nextQuestions }.`,
      },
      {
        name: 'Rules Agent',
        purpose: 'Ground legal/rules checks in the indexed manual and updates.',
        prompt: `${system}\n\nSearch the indexed manual chunks for the proposed design and strategy. ${citationRule} Refuse uncited legality claims.\n\nReturn JSON: { likelyAllowed, blockers, inspectionChecklist, citations, unresolvedQuestions }.`,
      },
      {
        name: 'Strategy Agent',
        purpose: 'Turn game scoring, skill level, budget, and timeline into priorities.',
        prompt: `${system}\n\nRecommend what to score, what to ignore, autonomous plan, teleop plan, endgame stance, alliance fit, and driver practice goals. Cite game-sensitive claims.\n\nReturn JSON: { recommendation, scoringPriorities, ignoreList, autonomous, teleop, endgame, allianceCompatibility, citations }.`,
      },
      {
        name: 'Mechanical Design Agent',
        purpose: 'Generate three feasible robot concepts and merge options.',
        prompt: `${system}\n\nCreate exactly three robot concepts: conservative, balanced, and high-ceiling. Include difficulty, cost, build time, tools, mechanisms, pros, cons, risks, rule concerns, and upgrade path.\n\nReturn JSON: { concepts: [...] }.`,
      },
      {
        name: 'Parts Agent',
        purpose: 'Build REV-first BOMs from the parsed catalog.',
        prompt: `${system}\n\nUse only catalog parts with SKU/productUrl when possible. Mark unknown availability as lastChecked. Split required, optional, spares, alreadyOwned, missing, substitutions, and buyFirst priorities.\n\nReturn JSON: { required, optional, spareParts, alreadyOwned, missing, subtotal, budgetRemaining, substitutions }.`,
      },
      {
        name: 'Physics Agent',
        purpose: 'Verify mechanisms with math before recommendation.',
        prompt: `${system}\n\nFor each mechanism calculate torque, RPM, speed, force, safety margin, current/battery risk if possible, and warning thresholds. Use conservative defaults when inputs are missing and label assumptions.\n\nReturn JSON: { calculations: [{ mechanism, assumptions, formula, calculation, result, safetyFactor, recommendation, warning }] }.`,
      },
      {
        name: 'CAD Agent',
        purpose: 'Create conceptual CAD starter specs, not manufacturing promises.',
        prompt: `${system}\n\nGenerate a parametric CAD plan for browser preview and future CadQuery export. Include robot envelope, subsystem placement, mounting points, views, wiring view, and verification notes. Label it conceptual.\n\nReturn JSON: { disclaimer, robotDimensionsMm, subsystemLayout, mountingPoints, views, exportPlan }.`,
      },
      {
        name: 'Code Agent',
        purpose: 'Generate FTC SDK Java starter code aligned to selected hardware.',
        prompt: `${system}\n\nGenerate Java files for RobotHardware, DriveSubsystem, LiftSubsystem, TeleOpMain, AutoMain, Constants, and README. Use FTC SDK imports, safe power clipping, telemetry, hardware init errors, and case-sensitive names.\n\nReturn JSON: { files: [{ fileName, language, content }], hardwareConfigurationChecklist }.`,
      },
      {
        name: 'Build Guide Agent',
        purpose: 'Create LEGO-style assembly steps with tests.',
        prompt: `${system}\n\nCreate build phases with step number, title, parts, tools, estimated time, instruction, safety warning, checkpoint, common mistake, and test before continuing.\n\nReturn JSON: { buildSteps }.`,
      },
      {
        name: 'Driver Optimization Agent',
        purpose: 'Analyze gamepad logs and propose better control layout.',
        prompt: `${system}\n\nAnalyze button/stick usage, repeated sequences, timing gaps, failed actions, and phase context. Recommend remaps, macros, toggles vs holds, deadzones, slow mode, presets, and driver1/driver2 ownership.\n\nReturn JSON: { buttonUsage, repeatedSequences, suggestions, recommendedMap }.`,
      },
      {
        name: 'Grant Agent',
        purpose: 'Draft sponsor/grant materials from team and budget context.',
        prompt: `${system}\n\nDraft sponsor email, grant narrative, budget justification, donation tiers, follow-up email, thank-you email, and outreach tracker fields. Keep claims truthful and editable.\n\nReturn JSON: { sponsorEmail, grantDraft, budgetJustification, tiers, followUp, thankYou }.`,
      },
      {
        name: 'Review Agent',
        purpose: 'Catch contradictions and unsafe overclaims before output.',
        prompt: `${system}\n\nReview the whole plan for uncited rules, impossible parts, budget mismatch, missing physics, code/CAD mismatch, unsafe build advice, and overpromised CAD. Return required fixes before final output.\n\nReturn JSON: { pass, blockers, warnings, fixes, finalCaveats }.`,
      },
    ],
  };
}

function projectAiPrompt(project) {
  const season = currentSeasonSource(project);
  return [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Return only valid JSON. Make a year-agnostic FTC robot packet from only the season/manual facts and team requirements below.',
    'Never invent point values, rule numbers, exact legal guarantees, SKU prices, or official approvals. If a fact is not in the source context, describe it as something to verify.',
    'Never make definitive legality claims. Leave rule-sensitive wording unresolved unless a cited source is provided by the context.',
    'JSON shape: { strategy, concepts, buildGuide, chatSeed }.',
    'strategy: { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility }.',
    'concepts: exactly 3 complete robot architectures, not individual subsystems.',
    'The concepts must be ordered as conservative, balanced, and high-ceiling. Use conceptIntent values "conservative", "balanced", and "high-ceiling".',
    'Each concept must include a drivetrain, at least one scoring/intake mechanism, a lift/arm/manipulator, an autonomous/control plan, and a realistic build path.',
    'Concept items: { conceptIntent, id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath }.',
    'mainMechanisms must include 3-6 strings covering drivetrain, intake/scoring, lift/arm or manipulator, and autonomous/control.',
    'strategyFit must explain why the concept fits the team budget, skill level, timeline, priorities, tools, and constraints.',
    'If a concept exceeds the team budget, cons or risks must explicitly call out the budget risk.',
    'Do not use placeholder names like Concept 1, Generic Robot, Intake, Lift, Drivetrain, or Vision Rig as a standalone subsystem.',
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
    'Return only valid JSON: { "concepts": [...] }.',
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

export async function applyAiPacket(project) {
  const ai = await callVertexJson({ prompt: projectAiPrompt(project) });
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
    const repair = await callVertexJson({ prompt: projectAiConceptRepairPrompt(project, ai.data.concepts, conceptPacket.issues) });
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
  project.selectedDesign = project.concepts[1];
  project.bom = buildBom(team, project.selectedDesign);
  project.physics = calculateMechanisms({ design: project.selectedDesign });
  project.cad = generateCadConcept(project);
  project.code = generateCode(project);
  project.codeValidation = validateGeneratedJava(project.code);
  project.buildGuide = buildGuide(project);
  project.driverInsight = analyzeDriverLogs([]);
  project.sponsorDraft = sponsorEmail({ team });
  state.projects.set(id, project);
  if (!transient) await persistProjects();
  return project;
}

export function projectForResponse(project) {
  if (!project) return null;
  const bomItems = [...(project.bom?.required || []), ...(project.bom?.optional || [])];
  const id = project.id || 'demo';
  const season = project.season || currentSeasonSource(project);
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
      pages: doc.pages,
      ingestedAt: doc.ingestedAt,
      seasonSource: doc.seasonSource,
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
    rules: quoteRule('robot construction control system autonomous teleop penalties').map((citation) => ({
      rule: citation.ruleNumber,
      section: citation.manualSection,
      status: citation.confidence === 'Low' ? 'Needs citation verification' : 'Indexed citation available',
      confidence: citation.confidence,
      note: citation.explanation,
      sourceDocument: citation.sourceDocument,
    })),
    bom: bomItems.map((item) => ({
      mechanismId: item.mechanismId,
      mechanismIds: item.mechanismIds,
      mechanismName: item.mechanismName,
      subsystem: item.subsystem,
      sku: item.sku,
      part: item.part,
      qty: item.qty,
      price: item.price,
      stock: item.stock,
      productUrl: item.productUrl,
      lastChecked: item.lastChecked,
    })),
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
    driverInsight: project.driverInsight?.suggestions?.join(' ') || '',
    sponsorDraft: project.sponsorDraft?.subject || '',
  };
}
