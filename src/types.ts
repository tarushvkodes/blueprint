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
  risks: string[]
}

export type Rule = {
  rule: string
  section: string
  status: string
  confidence: string
  note: string
}

export type BomItem = {
  subsystem: string
  sku: string
  part: string
  qty: number
  price: number
  stock: string
}

export type PhysicsItem = {
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
  season?: SeasonSource
  generatedBy?: string
  aiFallbackReason?: string | null
  aiStatus?: AiStatus
  sourceDocuments?: SourceDocument[]
  artifactUrls?: ArtifactUrls
  concepts: Concept[]
  rules: Rule[]
  bom: BomItem[]
  physics: PhysicsItem[]
  buildSteps: string[]
  buildGuide?: BuildGuideStep[]
  codeFiles: string[]
  driverInsight: string
  sponsorDraft: string
}

export type AiStatus = {
  ready: boolean
  provider: string
  textModel: string
  imageModel: string
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
  cadGltf?: string
  cadStep?: string
  buildGuideHtml?: string
}

export type BuildGuideStep = {
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
  concepts?: ApiConcept[]
  rules?: Rule[]
  bom?: BomItem[] | {
    required?: ApiBomItem[]
    optional?: ApiBomItem[]
  }
  physics?: ApiPhysicsItem[]
  buildGuide?: ApiBuildStep[]
  buildSteps?: string[]
  code?: Record<string, string>
  codeFiles?: string[]
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
