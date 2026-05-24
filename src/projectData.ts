import {
  Calculator,
  Code2,
  FileCheck2,
  HandCoins,
  PackageCheck,
  Route,
  SlidersHorizontal,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectData } from './types'

export const navItems = ['Strategy', 'Design', 'BOM', 'Physics', 'CAD', 'Code', 'Build', 'Chat'] as const

export const defaultBlueprintQuestion = 'Can we make the selected robot cheaper without losing reliable autonomous?'

export const profilePriorities = [
  'Low cost',
  'Reliable autonomous',
  'Easy maintenance',
  'Simple driver control',
  'Alliance-friendly scoring',
]

export const manifesto =
  'Blueprint turns a kickoff panic into an engineering workspace where every strategy, part, mechanism, code file, build step, and sponsor draft stays connected to rules, math, budget, and student decisions.'

export const fallbackProject: ProjectData = {
  team: {
    name: 'Metal Magic FTC',
    number: 'Prototype',
    location: 'Virginia',
    experience: 'Intermediate',
    students: 9,
    mentors: 2,
    budget: 1500,
    supplier: 'REV Robotics',
    manual: 'Current FTC manual',
    tools: ['basic hand tools', '3D printer'],
    priorities: ['reliable autonomous', 'easy maintenance', 'simple driver control'],
    inventory: ['REV Starter Kit V3.1'],
    timelineWeeks: 6,
    goals: 'Build a reliable, legal FTC robot that students can understand and iterate.',
    constraints: 'Keep the design inside FTC starting configuration and budget.',
    strategyMode: 'hybrid',
    strategyNotes: 'Prefer a conservative first robot plan with clear tradeoffs before adding high-risk mechanisms.',
    cadExperience: 'Beginner',
    programmingExperience: 'Beginner',
    buildSpace: 'Classroom or garage build space',
  },
  season: {
    seasonName: 'Sample season',
    manualVersion: null,
    title: 'Upload a current FTC manual',
    isSample: true,
    scoringSummary: 'Sample season data is shown until a current FTC manual is uploaded.',
    robotConstraints: ['Upload the current official manual to replace sample constraints.'],
  },
  generatedBy: 'local-fallback',
  aiFallbackReason: 'No live project loaded yet.',
  setupValidation: undefined,
  sourceDocuments: [],
  artifactUrls: {},
  artifactGeneration: {
    generatedBy: 'local-fallback',
    ai: {},
  },
  strategy: {
    recommendation: 'Build a reliable drivetrain and one repeatable scoring path before adding complexity.',
    scoringPriorities: ['repeatable teleop scoring', 'reliable autonomous movement', 'low penalty exposure'],
    whatToIgnore: ['fragile mechanisms until the first scoring loop works'],
    autonomous: ['drive/park reliably', 'add preload scoring only after repeatability'],
    teleOp: ['driver 1 owns drivetrain', 'driver 2 owns scoring', 'slow mode for alignment'],
    endgame: ['attempt only if build time remains'],
    driverPracticeGoals: ['five clean cycles in a row', 'consistent button sequence under time pressure'],
    allianceCompatibility: 'Prefer a robot that can avoid traffic and help partners score.',
    citations: [],
    generatedBy: 'local-fallback',
  },
  concepts: [
    {
      name: 'Reliable Decode Scorer',
      difficulty: 'Beginner-safe',
      cost: 927,
      buildTime: '3-4 weeks',
      fit: 'Alliance-friendly scoring with conservative mechanisms',
      mechanisms: ['Tank drivetrain', 'Single-stage lift', 'Servo wrist', 'Passive guide'],
      risks: ['Lower top speed', 'Limited vertical reach'],
    },
    {
      name: 'Balanced Cycle Machine',
      difficulty: 'Intermediate',
      cost: 1248,
      buildTime: '5-6 weeks',
      fit: 'Fast cycles, autonomous starter path, and maintainable REV-only BOM',
      mechanisms: ['Mecanum drivetrain', 'Linear slide', 'Active intake', 'Preset scoring'],
      risks: ['Needs driver practice', 'Slide alignment matters'],
    },
    {
      name: 'High Ceiling Vision Rig',
      difficulty: 'Advanced',
      cost: 1715,
      buildTime: '7+ weeks',
      fit: 'Aggressive autonomous and high-scoring teleop specialization',
      mechanisms: ['Mecanum drivetrain', 'Multi-stage lift', 'Vision alignment', 'Macro controls'],
      risks: ['Over budget', 'More code tuning'],
    },
  ],
  rules: [],
  bom: [],
  bomSummary: null,
  bomOverrides: {},
  physics: [],
  buildSteps: [],
  codeFiles: [],
  code: {},
  cad: null,
  codeValidation: {
    ok: false,
    issues: ['No live generated code loaded yet.'],
    warnings: [],
  },
  autonomousPlan: {
    drivetrain: 'mecanum',
    reliability: 'high reliability',
    startPosition: 'audience-side tile',
    alliance: 'configurable red or blue',
    desiredAction: 'score preload then park',
    sensors: ['drive encoders'],
    path: [
      { order: 1, action: 'Reset encoders and close intake gate', durationMs: 250 },
      { order: 2, action: 'Drive off start line', distanceMm: 610, headingDeg: 0 },
      { order: 3, action: 'Park in the safest available zone', distanceMm: 420, headingDeg: 0 },
    ],
    pseudocode: ['initialize hardware', 'reset encoders', 'drive path', 'stop all motors'],
    tuningConstants: { wheelDiameterMm: 96, gearRatio: 1, drivePower: 0.35 },
    testingPlan: ['Run each step alone.', 'Run 10 full trials and keep the simplest reliable path.'],
    warnings: ['Retune if battery, wheels, gearing, traction, or robot weight changes.'],
  },
  driverInsight: 'Upload CSV or JSON gamepad logs to generate control remaps and macro suggestions.',
  driverAnalysis: {
    eventCount: 0,
    buttonUsage: [],
    repeatedSequences: [],
    phaseBreakdown: [],
    heatmap: [],
    timingGaps: { averageSeconds: 0, p90Seconds: 0, maxSeconds: 0 },
    suggestions: ['Upload CSV or JSON gamepad logs to generate control remaps and macro suggestions.'],
    recommendedMap: {
      driver1: { leftStick: 'drive/strafe', rightStickX: 'turn', leftBumper: 'slow mode' },
      driver2: { a: 'intake close', b: 'intake open', y: 'high preset' },
    },
  },
  sponsorDraft: 'Subject: Supporting local FTC students building an engineering robot',
  sponsorDesk: {
    subject: 'Subject: Supporting local FTC students building an engineering robot',
    tiers: [
      { amount: 250, benefit: 'Team website and social recognition' },
      { amount: 500, benefit: 'Logo on pit display and outreach materials' },
      { amount: 1000, benefit: 'Robot/cart recognition where event rules allow' },
    ],
  },
}

export type PlatformModule = {
  title: string
  icon: LucideIcon
  span: string
  copy: string
}

export const platformModules: PlatformModule[] = [
  {
    title: 'Rules-aware project memory',
    icon: FileCheck2,
    span: 'feature-large',
    copy: 'Manual TU32, uploaded PDFs, inventory, strategy notes, CAD references, and source-aware citations live in one working context.',
  },
  {
    title: 'REV-first supply engine',
    icon: PackageCheck,
    span: 'feature-tall',
    copy: 'BOMs split required, optional, spare, already-owned, and missing parts with last-checked availability language.',
  },
  {
    title: 'Physics before vibes',
    icon: Calculator,
    span: 'feature-wide',
    copy: 'Every drivetrain, lift, arm, intake, and servo recommendation exposes assumptions, formulas, safety factor, and warnings.',
  },
  {
    title: 'FTC SDK code studio',
    icon: Code2,
    span: 'feature-wide',
    copy: 'Starter Java files, hardware maps, TeleOp, Auto, constants, telemetry, and safety limits align to generated mechanisms.',
  },
]

export const agentRows = [
  'Intake Agent collects team constraints, tools, budget, inventory, skill level, and build timeline.',
  'Rules Agent refuses legal claims without citations, manual version, section, and confidence.',
  'Strategy Agent ranks scoring priorities, alliance fit, autonomous value, penalties, and what to ignore.',
  'Mechanical Agent proposes three architectures and hands mechanism inputs to the physics verifier.',
  'Review Agent checks contradictions across BOM, code, CAD, build steps, and student safety warnings.',
]

export const codeSample = `public class TeleOpMain extends LinearOpMode {
  private final RobotHardware robot = new RobotHardware();

  @Override
  public void runOpMode() {
    robot.init(hardwareMap);
    telemetry.addLine("Blueprint hardware initialized");
    waitForStart();

    while (opModeIsActive()) {
      double drive = -gamepad1.left_stick_y * Constants.DRIVE_LIMIT;
      double turn = gamepad1.right_stick_x * Constants.TURN_LIMIT;
      robot.drive.arcade(drive, turn);
      robot.lift.holdOrMove(gamepad2.left_stick_y);
      telemetry.update();
    }
  }
}`

export function getAccordionPanels(project: ProjectData) {
  return [
    { title: 'Driver logs', icon: SlidersHorizontal, copy: project.driverInsight },
    { title: 'Grant desk', icon: HandCoins, copy: project.sponsorDraft },
    { title: 'Autonomous', icon: Route, copy: 'Generate encoder-based parking, preload scoring, path constants, and a tuning checklist.' },
    { title: 'Hardware config', icon: Wrench, copy: 'Case-sensitive FTC configuration names stay aligned with generated code.' },
  ]
}
