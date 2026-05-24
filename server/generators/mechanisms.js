const MECHANISM_TYPE_LABELS = {
  drivetrain: 'Drivetrain',
  intake: 'Intake',
  manipulator: 'Scoring',
  sensor: 'Sensors',
  control: 'Control',
};

function normalizeTextList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function stableSlug(value) {
  return String(value || 'mechanism')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'mechanism';
}

function specId(concept, suffix) {
  return `${stableSlug(concept?.id || concept?.name || 'concept')}-${suffix}`;
}

function conceptText(concept = {}) {
  return [
    concept.name,
    concept.strategyFit,
    concept.fit,
    ...normalizeTextList(concept.mainMechanisms || concept.mechanisms),
  ].filter(Boolean).join(' ').toLowerCase();
}

function hardware({
  kind,
  name,
  quantity = 1,
  skuHint = null,
  query = null,
  required = true,
  buyFirst = 5,
}) {
  return {
    kind,
    name,
    quantity,
    skuHint,
    query: query || [name, skuHint].filter(Boolean).join(' '),
    required,
    buyFirst,
  };
}

function buildDrivetrainSpec(concept) {
  const text = conceptText(concept);
  const architecture = /x-drive|x drive/.test(text)
    ? 'x-drive'
    : /mecanum|strafe|omni|balanced|vision|high ceiling/.test(text)
      ? 'mecanum'
      : 'tank';
  const isMecanum = architecture === 'mecanum';
  const wheelName = isMecanum ? 'Mecanum Wheel Set' : 'FTC Starter Kit V3.1';

  return {
    id: specId(concept, 'drivetrain'),
    type: 'drivetrain',
    name: isMecanum ? 'Mecanum drivetrain' : architecture === 'x-drive' ? 'X-drive drivetrain' : 'Tank drivetrain',
    role: 'movement',
    summary: isMecanum
      ? 'Four-motor holonomic base for strafing, fast alignment, and driver slow mode.'
      : 'Conservative four-wheel starter base focused on straight-line reliability.',
    architecture,
    priority: 'required',
    hardware: [
      hardware({ kind: 'motor', name: 'HD Hex Motor', skuHint: 'REV-41-1301', quantity: isMecanum ? 4 : 2, buyFirst: 2 }),
      hardware({ kind: 'wheel', name: wheelName, skuHint: isMecanum ? 'REV-45-1655' : 'REV-45-3529', quantity: 1, buyFirst: 3 }),
    ],
    physicsInputs: {
      wheelDiameterMeters: 0.096,
      motorRpm: 312,
      gearRatio: isMecanum ? 1 : 1.5,
      motorTorqueNm: 0.8,
      efficiency: isMecanum ? 0.78 : 0.82,
    },
    cad: {
      placement: 'base',
      envelopeMm: { x: 455, y: 455, z: 90 },
      notes: ['Keep motors inside frame perimeter.', isMecanum ? 'Verify wheel handedness before wiring.' : 'Keep left/right wheelbase square.'],
    },
    code: {
      subsystem: 'DriveSubsystem',
      driveMode: isMecanum ? 'mecanum' : 'arcade',
      hardwareNames: ['left_front', 'right_front', 'left_back', 'right_back'],
    },
    risks: isMecanum ? ['Wheel orientation errors make strafing fail.'] : ['Less lateral mobility than mecanum.'],
    validation: { requiresPhysics: true, requiresCode: true, requiresCad: true },
  };
}

function buildIntakeSpec(concept, season = {}) {
  const text = conceptText(concept);
  const passive = /passive|guide/.test(text);
  const architecture = passive ? 'passive-guide' : /claw|gripper/.test(text) ? 'servo-gripper' : 'roller-intake';
  const gamePiece = /artifact/.test(`${season.scoringSummary || ''} ${season.pointValues || ''}`.toLowerCase())
    ? 'artifact'
    : 'game piece';

  return {
    id: specId(concept, 'intake'),
    type: 'intake',
    name: passive ? 'Passive scoring guide' : architecture === 'servo-gripper' ? 'Servo gripper intake' : 'Active roller intake',
    role: 'collect and hand off scoring objects',
    summary: passive
      ? `Guides the ${gamePiece} into a repeatable scoring pose without adding another motor.`
      : `Actively captures the ${gamePiece} and hands it to the scoring mechanism.`,
    architecture,
    priority: passive ? 'recommended' : 'required',
    hardware: passive
      ? [
          hardware({ kind: 'servo', name: 'Smart Robot Servo', skuHint: 'REV-41-1097', quantity: 1, required: false, buyFirst: 6 }),
        ]
      : [
          hardware({ kind: 'motor', name: 'UltraPlanetary Gearbox Kit', skuHint: 'REV-41-1600', quantity: 1, buyFirst: 5 }),
          hardware({ kind: 'servo', name: 'Smart Robot Servo', skuHint: 'REV-41-1097', quantity: 1, buyFirst: 6 }),
        ],
    physicsInputs: {
      loadMassKg: passive ? 0.4 : 0.8,
      safetyFactor: passive ? 1.5 : 2,
    },
    cad: {
      placement: 'front',
      envelopeMm: { x: passive ? 180 : 220, y: 90, z: 85 },
      notes: ['Mount inside starting envelope.', 'Leave room for driver-visible jams and quick removal.'],
    },
    code: {
      subsystem: 'IntakeSubsystem',
      hardwareNames: passive ? ['intake_servo'] : ['intake_motor', 'intake_servo'],
    },
    risks: passive ? ['Driver alignment matters more than mechanism speed.'] : ['Roller direction and current limits need tuning.'],
    validation: { requiresPhysics: true, requiresCode: true, requiresCad: true },
  };
}

function buildManipulatorSpec(concept) {
  const text = conceptText(concept);
  const multiStage = /multi-stage|high|tower/.test(text);
  const linear = /slide|lift/.test(text);
  const architecture = linear ? (multiStage ? 'multi-stage-linear-slide' : 'single-stage-linear-slide') : 'single-stage-arm';

  return {
    id: specId(concept, 'manipulator'),
    type: 'manipulator',
    name: linear ? (multiStage ? 'Multi-stage scoring lift' : 'Single-stage scoring lift') : 'Single-stage scoring arm',
    role: 'score game pieces',
    summary: linear
      ? 'Raises the scoring end effector with preset positions and a braced centerline tower.'
      : 'Simple arm/wrist scorer with lower build risk and easier inspection access.',
    architecture,
    priority: 'required',
    hardware: [
      hardware({ kind: 'motor', name: 'UltraPlanetary Gearbox Kit', skuHint: 'REV-41-1600', quantity: multiStage ? 2 : 1, buyFirst: 4 }),
      ...(linear
        ? [hardware({ kind: 'structural', name: 'Linear Motion Kit', skuHint: 'REV-41-1432', quantity: multiStage ? 2 : 1, buyFirst: 5 })]
        : [hardware({ kind: 'servo', name: 'Smart Robot Servo', skuHint: 'REV-41-1097', quantity: 1, buyFirst: 5 })]),
    ],
    physicsInputs: {
      loadMassKg: multiStage ? 4.8 : 4.2,
      pulleyRadiusMeters: 0.018,
      armLengthMeters: linear ? 0.14 : 0.22,
      safetyFactor: multiStage ? 2.3 : 2,
    },
    cad: {
      placement: 'centerline',
      envelopeMm: { x: 100, y: 140, z: multiStage ? 455 : 360 },
      notes: ['Brace to drivetrain before powered testing.', 'Keep cable path clear through full travel.'],
    },
    code: {
      subsystem: 'LiftSubsystem',
      hardwareNames: ['lift_motor'],
      presets: { lowTicks: 450, highTicks: multiStage ? 1300 : 1050 },
    },
    risks: multiStage ? ['Slide binding and cable routing can consume build time.'] : ['Lower reach ceiling than an advanced lift.'],
    validation: { requiresPhysics: true, requiresCode: true, requiresCad: true },
  };
}

function buildControlSpec(concept) {
  const text = conceptText(concept);
  const vision = /vision|camera|apriltag/.test(text);

  return {
    id: specId(concept, 'control'),
    type: 'control',
    name: vision ? 'Vision-assisted autonomous controls' : 'Encoder autonomous controls',
    role: 'driver control and autonomous sequencing',
    summary: vision
      ? 'Uses FTC SDK hardware names, driver slow mode, lift presets, and a camera-ready autonomous path.'
      : 'Uses FTC SDK hardware names, driver slow mode, lift presets, and a conservative encoder/time fallback.',
    architecture: vision ? 'vision-auto' : 'encoder-auto',
    priority: 'required',
    hardware: [
      hardware({ kind: 'controller', name: 'Control Hub', skuHint: 'REV-31-1595', quantity: 1, buyFirst: 1 }),
      hardware({ kind: 'electrical', name: 'XT30 Cable', skuHint: 'REV-31-1302', quantity: 4, buyFirst: 6 }),
      ...(vision ? [hardware({ kind: 'sensor', name: 'Webcam vision camera', quantity: 1, required: false, buyFirst: 7 })] : []),
    ],
    physicsInputs: {
      controlLoop: 'FTC SDK LinearOpMode',
      autonomousFallback: vision ? 'vision alignment with encoder fallback' : 'encoder/time fallback',
    },
    cad: {
      placement: 'rear electronics bay',
      envelopeMm: { x: 180, y: 150, z: 80 },
      notes: ['Mount hub and battery with service access.', 'Strain-relieve motor and sensor cables.'],
    },
    code: {
      subsystem: 'RobotHardware',
      hardwareNames: ['left_front', 'right_front', 'left_back', 'right_back', 'lift_motor', 'intake_servo'],
    },
    risks: vision ? ['Camera pipeline should not block basic autonomous fallback.'] : ['Encoder-only paths drift without repeated field testing.'],
    validation: { requiresPhysics: false, requiresCode: true, requiresCad: true },
  };
}

export function buildMechanismSpecsForConcept(concept = {}, team = {}, season = {}) {
  const specs = [
    buildDrivetrainSpec(concept, team, season),
    buildIntakeSpec(concept, season),
    buildManipulatorSpec(concept, team, season),
    buildControlSpec(concept, team, season),
  ];

  return specs.map((spec, index) => ({
    ...spec,
    sortOrder: index + 1,
    subsystem: MECHANISM_TYPE_LABELS[spec.type] || spec.type,
  }));
}

export function attachMechanismSpecs(concept = {}, team = {}, season = {}) {
  const mainMechanisms = normalizeTextList(concept.mainMechanisms || concept.mechanisms);
  const enrichedConcept = { ...concept, mainMechanisms };
  return {
    ...enrichedConcept,
    mechanismSpecs: buildMechanismSpecsForConcept(enrichedConcept, team, season),
  };
}

export function getMechanismSpecs(concept = {}, team = {}, season = {}) {
  if (Array.isArray(concept.mechanismSpecs) && concept.mechanismSpecs.length) return concept.mechanismSpecs;
  return buildMechanismSpecsForConcept(concept, team, season);
}

export function validateMechanismSpecs(specs = []) {
  const issues = [];
  const typeSet = new Set(specs.map((spec) => spec.type));
  const requiredTypes = ['drivetrain', 'intake', 'manipulator', 'control'];

  for (const type of requiredTypes) {
    if (!typeSet.has(type)) issues.push(`Missing ${type} mechanism spec.`);
  }

  for (const spec of specs) {
    if (!spec.id) issues.push(`Missing stable id for ${spec.name || spec.type || 'mechanism'}.`);
    if (!spec.name) issues.push(`Missing name for ${spec.id || spec.type || 'mechanism'}.`);
    if (!Array.isArray(spec.hardware) || spec.hardware.length === 0) issues.push(`${spec.id || spec.name} has no hardware requirements.`);
    if (!spec.code?.subsystem) issues.push(`${spec.id || spec.name} has no code subsystem mapping.`);
    if (!spec.cad?.placement) issues.push(`${spec.id || spec.name} has no CAD placement.`);
    if (!spec.validation) issues.push(`${spec.id || spec.name} has no validation flags.`);
  }

  return { ok: issues.length === 0, issues };
}

export function conceptHasMechanismCoverage(concept = {}) {
  const text = conceptText(concept);
  const mechanisms = normalizeTextList(concept.mainMechanisms || concept.mechanisms);
  const hasDrive = /drive|drivetrain|mecanum|tank|swerve|chassis|x-drive|x drive/.test(text);
  const hasScoring = /score|scor|intake|outtake|arm|lift|slide|wrist|gripper|claw|collector|launcher|guide/.test(text);
  const hasControl = /auto|autonomous|driver|teleop|preset|vision|sensor|macro|control|encoder/.test(text);

  return mechanisms.length >= 3 && hasDrive && hasScoring && hasControl;
}

export function mechanismHardwareLines(specs = []) {
  const lines = [];
  for (const spec of specs) {
    for (const item of spec.hardware || []) {
      lines.push({
        mechanismId: spec.id,
        mechanismName: spec.name,
        subsystem: spec.subsystem || MECHANISM_TYPE_LABELS[spec.type] || spec.type,
        query: item.query || [item.name, item.skuHint].filter(Boolean).join(' '),
        qty: Number(item.quantity || 1),
        required: item.required !== false,
        buyFirst: Number(item.buyFirst || spec.sortOrder || 5),
      });
    }
  }
  return lines;
}

export function mechanismIds(specs = []) {
  return specs.map((spec) => spec.id).filter(Boolean);
}
