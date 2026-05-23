import { validateStructuredOutput } from './validation.js';

function parseLabeledJson(prompt, label) {
  const match = prompt.match(new RegExp(`${label}:\\s*(\\{[\\s\\S]*?\\})(?:\\n\\n|$)`));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function teamFromPrompt(prompt) {
  return parseLabeledJson(prompt, 'Team') || { name: 'FTC team', budget: 1500, tools: ['hex drivers'], inventory: [] };
}

function baseConcepts(team) {
  const budget = Number(team.budget || 1500);
  const tools = Array.isArray(team.tools) && team.tools.length ? team.tools : ['hex drivers', 'wrenches', 'laptop'];
  return [
    {
      id: 'fallback-simple-scorer',
      name: 'Fallback Simple Scorer',
      strategyFit: 'Prioritizes reliable driving, conservative scoring, and quick inspection readiness.',
      difficulty: 'Beginner-safe',
      estimatedCost: Math.min(900, Math.round(budget * 0.65)),
      buildTime: '3-4 weeks',
      requiredTools: tools,
      requiredParts: ['Control Hub', 'HD Hex Motors', 'FTC Starter Kit', 'servo wrist'],
      mainMechanisms: ['tank drivetrain', 'single scoring arm', 'basic autonomous park'],
      pros: ['lowest integration risk', 'easy for students to maintain'],
      cons: ['lower scoring ceiling'],
      risks: ['driver practice determines match value'],
      ruleConcerns: [],
      upgradePath: ['add mecanum drive after drivetrain is reliable', 'add preset arm positions'],
    },
    {
      id: 'fallback-balanced-cycle',
      name: 'Fallback Balanced Cycle Machine',
      strategyFit: 'Balances cycle speed with maintainable REV-first mechanisms.',
      difficulty: 'Intermediate',
      estimatedCost: Math.min(1300, Math.round(budget * 0.9)),
      buildTime: '5-6 weeks',
      requiredTools: tools,
      requiredParts: ['Mecanum wheel set', 'Control Hub', 'UltraPlanetary gearbox', 'linear slide kit'],
      mainMechanisms: ['mecanum drivetrain', 'linear lift', 'active intake'],
      pros: ['good driver-control ceiling', 'clear autonomous upgrade path'],
      cons: ['requires careful wiring and tuning'],
      risks: ['slide friction can cause current spikes'],
      ruleConcerns: [],
      upgradePath: ['add vision alignment', 'add driver macros only after logs prove repeatability'],
    },
    {
      id: 'fallback-high-ceiling',
      name: 'Fallback High Ceiling Vision Rig',
      strategyFit: 'Targets advanced autonomous only if the team has enough programming and CAD bandwidth.',
      difficulty: 'Advanced',
      estimatedCost: Math.max(1600, Math.round(budget * 1.12)),
      buildTime: '7+ weeks',
      requiredTools: [...new Set([...tools, 'CAD', 'driver practice field'])],
      requiredParts: ['mecanum drivetrain', 'multi-stage lift', 'camera mount', 'spares'],
      mainMechanisms: ['mecanum drivetrain', 'multi-stage lift', 'vision alignment', 'macro controls'],
      pros: ['highest scoring ceiling'],
      cons: ['largest integration risk', 'hardest to debug'],
      risks: ['can consume the season before a reliable base exists'],
      ruleConcerns: [],
      upgradePath: ['review after simple robot passes repeatability tests'],
    },
  ];
}

function fallbackStrategy(team) {
  return {
    recommendation: `For ${team.name || 'the team'}, build the drivetrain and one repeatable scoring path before adding high-risk mechanisms.`,
    scoringPriorities: ['repeatable teleop scoring', 'safe autonomous movement', 'low penalty exposure', 'fast reset between cycles'],
    whatToIgnore: ['fragile endgame gambits', 'uncited rule-sensitive shortcuts', 'mechanisms without driver practice time'],
    autonomous: ['encoder-based drive or park', 'score only after mechanism repeatability is proven', 'time-based fallback'],
    teleOp: ['driver 1 owns drivetrain', 'driver 2 owns manipulator', 'slow mode for alignment'],
    endgame: ['attempt only after scoring path is stable'],
    driverPracticeGoals: ['five clean cycles in a row', 'zero cable snags', 'consistent button sequence under pressure'],
    allianceCompatibility: 'Favor a dependable partner robot that can avoid traffic and complete one job reliably.',
    citations: [],
  };
}

function fallbackBuildSteps() {
  return [
    {
      phase: 'Prepare parts',
      title: 'Confirm manual, BOM, and inventory',
      parts: [],
      tools: ['laptop'],
      time: '30 min',
      diagram: 'BOM -> bins -> legal checklist',
      instructions: 'Confirm the current manual version, inventory, buy-first parts, and rule-sensitive assumptions before fabrication.',
      checkpoint: 'A student can identify every buy-first part and the manual version.',
      commonMistake: 'Ordering mechanisms before confirming control system parts.',
      test: 'Review the checklist with a mentor before ordering.',
    },
    {
      phase: 'Build drivetrain',
      title: 'Assemble a square drivetrain',
      parts: ['motors', 'wheels', 'channel', 'fasteners'],
      tools: ['hex drivers', 'wrenches'],
      time: '2-4 hr',
      diagram: 'Top view of square base',
      instructions: 'Build on a flat surface, tighten gradually, and verify each wheel spins freely.',
      checkpoint: 'Robot rolls straight by hand without binding.',
      commonMistake: 'Tightening one corner before the frame is square.',
      test: 'Push the robot by hand and listen for rubbing or gear noise.',
    },
    {
      phase: 'Integrate scoring',
      title: 'Bench-test lift or arm before mounting',
      parts: ['gearbox', 'slide', 'servo'],
      tools: ['hex drivers'],
      time: '3-6 hr',
      diagram: 'Mechanism on bench power-limited',
      instructions: 'Test the scoring mechanism outside the robot at low power, then mount with service access.',
      checkpoint: 'Mechanism moves through full range without binding.',
      commonMistake: 'Ignoring cable path through the lift travel.',
      test: 'Run 10 low-power cycles and check for heat or loose fasteners.',
    },
  ];
}

function fallbackBom() {
  const required = [
    {
      subsystem: 'Control',
      query: 'REV-31-1595 Control Hub',
      qty: 1,
      required: true,
      buyFirst: 1,
      supplier: 'REV Robotics',
      sku: 'REV-31-1595',
      part: 'Control Hub',
      price: 285,
      total: 285,
      productUrl: null,
      cadUrl: null,
      stock: 'Availability not checked',
      lastChecked: null,
      inInventory: false,
      substitutionSuggestions: [],
    },
    {
      subsystem: 'Drivetrain',
      query: 'HD Hex Motor REV-41-1301',
      qty: 4,
      required: true,
      buyFirst: 2,
      supplier: 'REV Robotics',
      sku: 'REV-41-1301',
      part: 'HD Hex Motor',
      price: 45,
      total: 180,
      productUrl: null,
      cadUrl: null,
      stock: 'Availability not checked',
      lastChecked: null,
      inInventory: false,
      substitutionSuggestions: [],
    },
  ];
  const subtotal = required.reduce((sum, item) => sum + item.total, 0);
  return {
    conceptId: 'fallback-balanced-cycle',
    required,
    optional: [],
    spareParts: required.map((item) => ({ ...item, qty: 1, total: item.price })),
    alreadyOwned: [],
    missing: required,
    subtotal,
    shippingEstimatePlaceholder: 35,
    budgetRemaining: 1500 - subtotal,
    buyFirst: required,
    budgetMode: 'Balanced Budget',
    substitutions: [],
  };
}

function fallbackPhysics() {
  return {
    calculations: [
      {
        mechanism: 'Wheel speed',
        assumptions: { motorRpm: 312, gearRatio: 1, wheelDiameter: 0.096, efficiency: 0.82 },
        formula: 'linear_speed = motor_rpm * pi * wheel_diameter / 60 * efficiency',
        calculation: '312 rpm * 0.302 m / 60 * 0.82',
        result: '1.29 m/s',
        safetyFactor: 'Use driver cap if team is beginner',
        recommendation: 'Conservative enough for early driver practice.',
        warning: null,
      },
    ],
  };
}

function fallbackCode() {
  return {
    files: [
      {
        fileName: 'RobotHardware.java',
        language: 'java',
        content: 'public class RobotHardware { /* configure left_front, right_front, left_back, right_back, lift_motor, intake_servo */ }',
      },
      {
        fileName: 'TeleOpMain.java',
        language: 'java',
        content: 'public class TeleOpMain { /* drive with slow mode and telemetry */ }',
      },
    ],
    hardwareConfigurationChecklist: ['left_front', 'right_front', 'left_back', 'right_back', 'lift_motor', 'intake_servo'],
  };
}

function fallbackReview(context = {}) {
  const plan = context.plan || {};
  const issues = [];
  if (!Array.isArray(plan.concepts) || plan.concepts.length === 0) {
    issues.push({ severity: 'blocker', artifact: 'concepts', message: 'No robot concepts were generated.', recommendation: 'Regenerate concepts before publishing.' });
  }
  if (!plan.bom?.required?.length) {
    issues.push({ severity: 'warning', artifact: 'bom', message: 'Required BOM is empty.', recommendation: 'Confirm buy-first control and drivetrain parts.' });
  }
  if (!Array.isArray(plan.physics) || plan.physics.length === 0) {
    issues.push({ severity: 'warning', artifact: 'physics', message: 'Physics calculations are missing.', recommendation: 'Run mechanism calculations before build.' });
  }
  return {
    issues,
    passed: !issues.some((issue) => issue.severity === 'blocker'),
    score: Math.max(0, 100 - (issues.length * 15)),
  };
}

function fallbackForSchema(schemaName, prompt, options = {}) {
  const team = options.context?.team || teamFromPrompt(prompt);
  const concepts = baseConcepts(team);
  const buildSteps = fallbackBuildSteps();
  switch (schemaName) {
    case 'BlueprintPacket':
      return {
        strategy: fallbackStrategy(team),
        concepts,
        buildGuide: buildSteps,
        chatSeed: 'Fallback packet generated without a hosted model.',
      };
    case 'Concepts':
      return { concepts };
    case 'Bom':
      return fallbackBom();
    case 'Physics':
      return fallbackPhysics();
    case 'BuildGuide':
      return { buildSteps };
    case 'Code':
      return fallbackCode();
    case 'Chat':
      return {
        answer: 'Check indexed rules first, then update the relevant BOM, physics, code, CAD, or build-guide artifact. I will not make definitive legality claims without citations.',
        suggestedActions: ['search rules', 'recalculate mechanism', 'regenerate BOM', 'update code artifact'],
      };
    case 'ReviewVerdict':
      return fallbackReview(options.context);
    default:
      return {};
  }
}

export class LocalFallbackAdapter {
  constructor({ model = 'local-deterministic-v1' } = {}) {
    this.name = 'local-fallback';
    this.model = model;
  }

  async generateJson(prompt, schema, options = {}) {
    const data = fallbackForSchema(options.schemaName, prompt, options);
    return validateStructuredOutput({
      adapterName: this.name,
      schemaName: options.schemaName,
      schema,
      data,
    });
  }

  async generateText(prompt) {
    return `Local fallback response for prompt: ${prompt.slice(0, 160)}`;
  }
}

