export const workspaceTabs = ['Dashboard', 'Overview', 'Strategy', 'Design', 'BOM', 'Physics', 'CAD', 'Code', 'Build', 'Chat'] as const

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
  price: number
  stock: string
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
  concepts: Concept[]
  rules: Rule[]
  legalChecklist?: LegalChecklistItem[]
  review?: ReviewPass
  bom: BomItem[]
  physics: PhysicsItem[]
  buildSteps: string[]
  buildGuide?: BuildGuideStep[]
  codeFiles: string[]
  codeValidation?: CodeValidation
  driverInsight: string
  sponsorDraft: string
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
  textModel: string
  imageModel: string
  projectId?: string | null
  location?: string | null
  message: string
  lastError?: string | null
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
  pages?: number | null
  ingestedAt?: string
  seasonSource?: SeasonSource | null
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
  physics?: ApiPhysicsItem[]
  buildGuide?: ApiBuildStep[]
  buildSteps?: string[]
  code?: Record<string, string>
  codeFiles?: string[]
  codeValidation?: CodeValidation
  season?: SeasonSource
  generatedBy?: string
  aiFallbackReason?: string | null
  aiStatus?: AiStatus
  sourceDocuments?: SourceDocument[]
  artifactUrls?: ArtifactUrls
  driverInsight?: string | {
    suggestions?: string[]
  }
  sponsorDraft?: string | {
    subject?: string
  }
}
