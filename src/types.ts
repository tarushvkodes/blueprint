export const workspaceTabs = ['Dashboard', 'Overview', 'Strategy', 'Design', 'BOM', 'Physics', 'CAD', 'Code', 'Autonomous', 'Build', 'Driver Logs', 'Grants', 'Chat'] as const

export type WorkspaceTab = (typeof workspaceTabs)[number]

export type Team = {
  name: string
  number: string
  location: string
  experience: string
  students: number
  mentors: number
  budget: number
  supplier: string
  manual: string
  tools?: string[]
  priorities?: string[]
  inventory?: string[]
  timelineWeeks?: number
  goals?: string
  constraints?: string
  strategyMode?: string
  strategyNotes?: string
  cadExperience?: string
  programmingExperience?: string
  buildSpace?: string
  bomOverrides?: Record<string, BomOverride>
}

export type BomOverride = {
  qty?: number
  price?: number
  note?: string
}

export type Concept = {
  id?: string
  name: string
  difficulty: string
  cost: number
  buildTime: string
  fit: string
  mechanisms: string[]
  mechanismSpecs?: MechanismSpec[]
  risks: string[]
}

export type MechanismHardware = {
  kind: string
  name: string
  quantity: number
  skuHint?: string | null
  query?: string | null
  required?: boolean
  buyFirst?: number
}

export type MechanismSpec = {
  id: string
  type: 'drivetrain' | 'intake' | 'manipulator' | 'sensor' | 'control' | string
  subsystem?: string
  name: string
  role: string
  summary: string
  architecture: string
  priority: 'required' | 'recommended' | 'optional' | string
  sortOrder?: number
  hardware: MechanismHardware[]
  physicsInputs?: Record<string, string | number | boolean | null>
  cad?: {
    placement?: string
    envelopeMm?: Record<string, number>
    notes?: string[]
  }
  code?: {
    subsystem?: string
    driveMode?: string
    hardwareNames?: string[]
    presets?: Record<string, number>
  }
  risks?: string[]
  validation?: {
    requiresPhysics?: boolean
    requiresCode?: boolean
    requiresCad?: boolean
  }
}

export type Rule = {
  rule: string
  section: string
  status: string
  confidence: string
  note: string
  sourceDocument?: string
  mechanismId?: string | null
  page?: number | null
  version?: string | null
}

export type LegalChecklistItem = {
  id: string
  mechanismId?: string | null
  mechanismName: string
  concern: string
  status: string
  severity: 'info' | 'warning' | 'blocker' | string
  message: string
  citation?: {
    ruleNumber: string
    manualSection: string
    page?: number | null
    sourceDocument: string
    version?: string | null
    sourceDate?: string | null
    explanation: string
    confidence: string
  } | null
}

export type ReviewPass = {
  pass: boolean
  checkedAt?: string
  blockers: string[]
  warnings: string[]
  fixes: string[]
  finalCaveats?: string[]
  legalChecklist?: LegalChecklistItem[]
}

export type BomItem = {
  mechanismId?: string
  mechanismIds?: string[]
  mechanismName?: string
  subsystem: string
  sku: string
  part: string
  qty: number
  ownedQty?: number
  missingQty?: number
  price: number
  total?: number
  missingTotal?: number
  budgetCategory?: string
  stock: string
  productUrl?: string | null
  lastChecked?: string | null
  substitutionSuggestions?: BomSubstitution[]
  overrideNote?: string | null
  overridden?: boolean
}

export type BomSubstitution = {
  label: string
  impact: string
  query?: string | null
  sku?: string
  part?: string
  mechanismIds?: string[]
}

export type BomSubsystemTotal = {
  subsystem: string
  total: number
  requiredTotal: number
  optionalTotal: number
  missingTotal: number
}

export type BomSummary = {
  conceptId?: string
  conceptName?: string
  subtotal: number
  missingSubtotal: number
  ownedValue: number
  shippingEstimatePlaceholder: number
  estimatedCheckoutTotal: number
  budgetRemaining: number
  budgetMode: string
  subsystemTotals: BomSubsystemTotal[]
  buyFirst: BomItem[]
  substitutions: BomSubstitution[]
}

export type PhysicsItem = {
  mechanismId?: string
  mechanism: string
  formula: string
  inputs: string
  result: string
  recommendation: string
  margin: string
}

export type ProjectData = {
  id?: string
  demo?: boolean
  team: Team
  setupValidation?: TeamSetupValidation
  season?: SeasonSource
  generatedBy?: string
  aiFallbackReason?: string | null
  aiStatus?: AiStatus
  sourceDocuments?: SourceDocument[]
  artifactUrls?: ArtifactUrls
  artifactGeneration?: {
    generatedBy?: string
    ai?: Record<string, boolean>
  }
  strategy?: StrategyPlan | null
  concepts: Concept[]
  rules: Rule[]
  legalChecklist?: LegalChecklistItem[]
  review?: ReviewPass
  bom: BomItem[]
  bomSummary?: BomSummary | null
  bomOverrides?: Record<string, BomOverride>
  physics: PhysicsItem[]
  buildSteps: string[]
  buildGuide?: BuildGuideStep[]
  codeFiles: string[]
  code?: Record<string, string>
  codeValidation?: CodeValidation
  cad?: Record<string, unknown> | null
  autonomousPlan?: AutonomousPlan | null
  driverInsight: string
  driverAnalysis?: DriverAnalysis | null
  sponsorDraft: string
  sponsorDesk?: SponsorDesk | null
}

export type StrategyPlan = {
  recommendation: string
  scoringPriorities: string[]
  whatToIgnore: string[]
  autonomous: string[]
  teleOp: string[]
  endgame: string[]
  driverPracticeGoals: string[]
  allianceCompatibility: string
  citations?: {
    ruleNumber: string
    manualSection: string
    page?: number | null
    sourceDocument: string
    version?: string | null
    explanation: string
    confidence: string
  }[]
  generatedBy?: string
}

export type AutonomousPlan = {
  drivetrain: string
  reliability: string
  startPosition: string
  alliance: string
  desiredAction: string
  sensors: string[]
  path: {
    order: number
    action: string
    distanceMm?: number
    headingDeg?: number
    durationMs?: number
    fallback?: string
  }[]
  pseudocode: string[]
  tuningConstants: Record<string, string | number>
  testingPlan: string[]
  warnings: string[]
}

export type ProjectSummary = {
  id: string
  status?: string
  createdAt?: string
  updatedAt?: string
  team: Pick<Team, 'name' | 'number' | 'budget' | 'experience'>
  season: string
  selectedDesign?: string | null
  generatedBy?: string
  setupValidation?: TeamSetupValidation | null
}

export type DriverAnalysis = {
  eventCount: number
  buttonUsage: {
    button: string
    count: number
  }[]
  repeatedSequences?: {
    sequence: string[]
    count: number
    recommendation: string
  }[]
  timingGaps?: {
    averageSeconds: number
    p90Seconds: number
    maxSeconds: number
  }
  phaseBreakdown?: {
    phase: string
    count: number
  }[]
  heatmap?: {
    control: string
    intensity: number
    driver: string
  }[]
  suggestions: string[]
  recommendedMap: {
    driver1?: Record<string, string>
    driver2?: Record<string, string>
  }
}

export type SponsorDesk = {
  subject: string
  body?: string
  tiers?: {
    amount: number
    benefit: string
  }[]
}

export type ChatSuggestion = {
  id: string
  label: string
  description: string
  action: 'set-goal' | 'add-priority' | 'regenerate-bom' | 'regenerate-autonomous' | 'open-tab'
  payload?: Record<string, string | number | boolean | string[] | null>
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: 'streaming' | 'complete' | 'error'
}

export type TeamSetupCheck = {
  id: string
  label: string
  done: boolean
  required: boolean
  message: string
}

export type TeamSetupValidation = {
  ready: boolean
  completed: number
  total: number
  percent: number
  checks: TeamSetupCheck[]
  blockers: string[]
  warnings: string[]
}

export type AiStatus = {
  ready: boolean
  provider: string
  configured?: {
    forceFallback: boolean
    expressApiKey: boolean
    applicationDefaultCredentials: boolean
  }
  credentialsMode?: string
  textModel: string
  imageModel: string
  projectId?: string | null
  location?: string | null
  message: string
  lastError?: string | null
  lastOkAt?: string | null
  lastProvider?: string | null
  lastLatencyMs?: number | null
  lastSmokeTestAt?: string | null
  smokeTestRecommended?: boolean
}

export type SeasonSource = {
  seasonName: string
  manualVersion?: string | null
  title?: string
  sourceDocument?: string
  pages?: number | null
  scoringSummary?: string
  pointValues?: string
  robotConstraints?: string[]
  fieldFacts?: string[]
  isSample?: boolean
}

export type SourceDocument = {
  id: string
  title: string
  type: string
  version?: string | null
  sourceDate?: string | null
  sourceUrl?: string | null
  pages?: number | null
  ingestedAt?: string
  seasonSource?: SeasonSource | null
  health?: {
    chunkCount: number
    ruleCount: number
    hasPageNumbers: boolean
    officialSource: boolean
    hasVersionConflict: boolean
    sourceAgeDays?: number | null
    status: string
    warnings: string[]
  }
}

export type ArtifactUrls = {
  projectJson?: string
  codeZip?: string
  cadConceptJson?: string
  cadConceptStep?: string
  cadGltf?: string
  cadStep?: string
  buildGuideHtml?: string
}

export type CodeValidation = {
  ok: boolean
  checkedAt?: string
  checkedFiles?: string[]
  requiredFiles?: string[]
  hardwareNames?: string[]
  issues: string[]
  warnings: string[]
  note?: string
}

export type BuildGuideStep = {
  mechanismId?: string | null
  phase: string
  title?: string
  parts?: string[]
  tools?: string[]
  time?: string
  diagram?: string
  instructions: string
  safetyWarning?: string
  checkpoint?: string
  commonMistake?: string
  test?: string
  generatedBy?: string
}

export type ApiConcept = Partial<Concept> & {
  name: string
  difficulty: string
  estimatedCost?: number
  strategyFit?: string
  mainMechanisms?: string[]
}

export type ApiBomItem = BomItem & {
  total?: number
}

export type ApiPhysicsItem = Partial<PhysicsItem> & {
  mechanism: string
  formula: string
  result: string
  recommendation: string
  assumptions?: Record<string, string | number | boolean | null>
  safetyFactor?: string
}

export type ApiBuildStep = BuildGuideStep

export type ApiProjectResponse = {
  id?: string
  demo?: boolean
  team?: Partial<Team>
  setupValidation?: TeamSetupValidation
  concepts?: ApiConcept[]
  rules?: Rule[]
  legalChecklist?: LegalChecklistItem[]
  review?: ReviewPass
  bom?: BomItem[] | {
    required?: ApiBomItem[]
    optional?: ApiBomItem[]
  }
  bomSummary?: BomSummary | null
  bomOverrides?: Record<string, BomOverride>
  physics?: ApiPhysicsItem[]
  buildGuide?: ApiBuildStep[]
  buildSteps?: string[]
  code?: Record<string, string>
  cad?: Record<string, unknown> | null
  codeFiles?: string[]
  codeValidation?: CodeValidation
  autonomousPlan?: AutonomousPlan | null
  season?: SeasonSource
  generatedBy?: string
  aiFallbackReason?: string | null
  aiStatus?: AiStatus
  sourceDocuments?: SourceDocument[]
  artifactUrls?: ArtifactUrls
  artifactGeneration?: {
    generatedBy?: string
    ai?: Record<string, boolean>
  }
  strategy?: StrategyPlan | null
  driverInsight?: string | {
    suggestions?: string[]
  }
  driverAnalysis?: DriverAnalysis | null
  sponsorDraft?: string | {
    subject?: string
  }
  sponsorDesk?: SponsorDesk | null
}
