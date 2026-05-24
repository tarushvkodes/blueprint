import { defaultBlueprintQuestion, fallbackProject } from './projectData'
import type {
  ApiBomItem,
  ApiConcept,
  ApiPhysicsItem,
  ApiProjectResponse,
  BomItem,
  Concept,
  PhysicsItem,
  ProjectData,
  ProjectSummary,
  Team,
  AiStatus,
  ChatSuggestion,
  TeamSetupValidation,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787/api'

export class BlueprintApiError extends Error {
  status: number
  payload: unknown
  setupValidation?: TeamSetupValidation

  constructor(status: number, payload: unknown) {
    const message = typeof payload === 'object' && payload && 'error' in payload
      ? String((payload as { error?: unknown }).error)
      : `Blueprint API request failed: ${status}`
    super(message)
    this.name = 'BlueprintApiError'
    this.status = status
    this.payload = payload
    this.setupValidation = typeof payload === 'object' && payload && 'setupValidation' in payload
      ? (payload as { setupValidation?: TeamSetupValidation }).setupValidation
      : undefined
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new BlueprintApiError(response.status, payload)
  }

  return payload as T
}

function normalizeConcept(concept: ApiConcept | Concept): Concept {
  const estimatedCost = 'estimatedCost' in concept ? concept.estimatedCost : undefined
  const strategyFit = 'strategyFit' in concept ? concept.strategyFit : undefined
  const mainMechanisms = 'mainMechanisms' in concept ? concept.mainMechanisms : undefined
  const rawCost = estimatedCost ?? concept.cost
  const cost = Number(rawCost)

  return {
    id: concept.id,
    name: concept.name,
    difficulty: concept.difficulty,
    cost: Number.isFinite(cost) ? cost : 0,
    buildTime: concept.buildTime ?? 'Timeline pending',
    fit: strategyFit ?? concept.fit ?? '',
    mechanisms: mainMechanisms ?? concept.mechanisms ?? [],
    mechanismSpecs: concept.mechanismSpecs ?? [],
    risks: concept.risks ?? [],
  }
}

function normalizeBomItem(item: ApiBomItem | BomItem): BomItem {
  const qty = Number(item.qty)
  const price = Number(item.price)
  return {
    mechanismId: item.mechanismId,
    mechanismIds: item.mechanismIds,
    mechanismName: item.mechanismName,
    subsystem: item.subsystem,
    sku: item.sku,
    part: item.part,
    qty: Number.isFinite(qty) ? qty : 0,
    ownedQty: item.ownedQty,
    missingQty: item.missingQty,
    price: Number.isFinite(price) ? price : 0,
    total: item.total,
    missingTotal: item.missingTotal,
    budgetCategory: item.budgetCategory,
    stock: item.stock,
    productUrl: item.productUrl,
    lastChecked: item.lastChecked,
    substitutionSuggestions: item.substitutionSuggestions,
    overrideNote: item.overrideNote,
    overridden: item.overridden,
  }
}

function physicsInputs(item: ApiPhysicsItem | PhysicsItem) {
  if (item.inputs) return item.inputs
  const assumptions = 'assumptions' in item ? item.assumptions : undefined

  return Object.entries(assumptions ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ')
}

function normalizePhysicsItem(item: ApiPhysicsItem | PhysicsItem): PhysicsItem {
  const safetyFactor = 'safetyFactor' in item ? item.safetyFactor : undefined

  return {
    mechanismId: item.mechanismId,
    mechanism: item.mechanism,
    formula: item.formula,
    inputs: physicsInputs(item),
    result: item.result,
    recommendation: item.recommendation,
    margin: safetyFactor ?? item.margin ?? '',
  }
}

function normalizeBom(data: ApiProjectResponse, previousProject: ProjectData) {
  if (data.bom === undefined) return previousProject.bom
  if (Array.isArray(data.bom)) return data.bom.map(normalizeBomItem)

  return [...(data.bom.required ?? []), ...(data.bom.optional ?? [])].map(normalizeBomItem)
}

function normalizeDriverInsight(driverInsight: ApiProjectResponse['driverInsight'], fallback: string) {
  if (typeof driverInsight === 'string') return driverInsight
  return driverInsight?.suggestions?.join(' ') ?? fallback
}

function normalizeSponsorDraft(sponsorDraft: ApiProjectResponse['sponsorDraft'], fallback: string) {
  if (typeof sponsorDraft === 'string') return sponsorDraft
  return sponsorDraft?.subject ?? fallback
}

export function normalizeProjectResponse(data: ApiProjectResponse, previousProject: ProjectData): ProjectData {
  const concepts = data.concepts ?? previousProject.concepts
  const physics = data.physics ?? previousProject.physics

  return {
    id: data.id ?? previousProject.id,
    demo: data.demo ?? previousProject.demo,
    team: {
      ...previousProject.team,
      ...(data.team ?? {}),
    },
    setupValidation: data.setupValidation ?? previousProject.setupValidation,
    season: data.season ?? previousProject.season,
    generatedBy: data.generatedBy ?? previousProject.generatedBy,
    aiFallbackReason: data.aiFallbackReason ?? previousProject.aiFallbackReason,
    aiStatus: data.aiStatus ?? previousProject.aiStatus,
    sourceDocuments: data.sourceDocuments ?? previousProject.sourceDocuments,
    artifactUrls: data.artifactUrls ?? previousProject.artifactUrls,
    strategy: data.strategy ?? previousProject.strategy,
    concepts: concepts.map(normalizeConcept),
    rules: data.rules ?? previousProject.rules,
    legalChecklist: data.legalChecklist ?? previousProject.legalChecklist,
    review: data.review ?? previousProject.review,
    bom: normalizeBom(data, previousProject),
    bomSummary: data.bomSummary ?? previousProject.bomSummary,
    bomOverrides: data.bomOverrides ?? previousProject.bomOverrides,
    physics: physics.map(normalizePhysicsItem),
    buildSteps: data.buildGuide
      ? data.buildGuide.map((step) => `${step.phase}: ${step.instructions}`)
      : data.buildSteps ?? previousProject.buildSteps,
    buildGuide: data.buildGuide ?? previousProject.buildGuide,
    codeFiles: data.code ? Object.keys(data.code) : data.codeFiles ?? previousProject.codeFiles,
    codeValidation: data.codeValidation ?? previousProject.codeValidation,
    autonomousPlan: data.autonomousPlan ?? previousProject.autonomousPlan,
    driverInsight: normalizeDriverInsight(data.driverInsight, previousProject.driverInsight),
    driverAnalysis: data.driverAnalysis ?? previousProject.driverAnalysis,
    sponsorDraft: normalizeSponsorDraft(data.sponsorDraft, previousProject.sponsorDraft),
    sponsorDesk: data.sponsorDesk ?? previousProject.sponsorDesk,
  }
}

export function fetchDemoProject() {
  return requestJson<ApiProjectResponse>('/project/demo')
    .then((data) => normalizeProjectResponse(data, fallbackProject))
}

export async function fetchProject(projectId: string, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}`)

  return normalizeProjectResponse(data, previousProject)
}

export function fetchAiStatus() {
  return requestJson<AiStatus>('/ai/status')
}

export async function listProjects() {
  const data = await requestJson<{ projects?: ProjectSummary[] }>('/projects')

  return data.projects ?? []
}

export async function regenerateProjectFromTeam(team: Team, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>('/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team }),
  })

  return normalizeProjectResponse(data, previousProject)
}

export async function startDemoRun(previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>('/projects/demo-run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  })

  return normalizeProjectResponse(data, previousProject)
}

export async function updateProjectIntake(projectId: string, team: Team, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/intake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team }),
  })

  return normalizeProjectResponse(data, previousProject)
}

export async function generateBlueprint(projectId: string, team: Team, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/generate-blueprint`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team }),
  })

  return normalizeProjectResponse(data, previousProject)
}

export async function selectProjectDesign(projectId: string, designId: string, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/select-design`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ designId }),
  })

  return normalizeProjectResponse(data, previousProject)
}

export async function uploadSeasonPdf(projectId: string, file: File, previousProject: ProjectData) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', file.name)
  formData.append('type', 'season-resource')

  const data = await requestJson<{ project?: ApiProjectResponse }>(`/projects/${projectId}/documents/upload`, {
    method: 'POST',
    body: formData,
  })

  if (!data.project) return previousProject
  return normalizeProjectResponse(data.project, previousProject)
}

export async function syncRevCatalog() {
  const data = await requestJson<{ synced?: number }>('/catalog/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'ftc', limit: 12 }),
  })

  return data.synced ?? 0
}

export async function askBlueprintQuestion(projectId: string, previousProject: ProjectData, message = defaultBlueprintQuestion) {
  const data = await requestJson<{ answer?: string; project?: ApiProjectResponse; suggestedActions?: (string | ChatSuggestion)[] }>(`/projects/${projectId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  return {
    answer: data.answer ?? 'Blueprint returned no answer.',
    project: data.project ? normalizeProjectResponse(data.project, previousProject) : null,
    suggestedActions: (data.suggestedActions ?? []).map((action, index) => (
      typeof action === 'string'
        ? { id: `legacy-${index}`, label: action, description: action, action: 'open-tab' as const, payload: { tab: action } }
        : action
    )),
  }
}

export async function applyChatSuggestion(projectId: string, suggestion: ChatSuggestion, previousProject: ProjectData) {
  const data = await requestJson<{ project?: ApiProjectResponse; applied?: boolean; message?: string }>(`/projects/${projectId}/chat/apply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ suggestion }),
  })

  return {
    applied: data.applied ?? false,
    message: data.message ?? 'Suggestion applied.',
    project: data.project ? normalizeProjectResponse(data.project, previousProject) : null,
  }
}

export async function analyzeDriverLogText(projectId: string, text: string) {
  const data = await requestJson<{
    eventCount?: number
    buttonUsage?: { button: string, count: number }[]
    repeatedSequences?: { sequence: string[], count: number, recommendation: string }[]
    timingGaps?: { averageSeconds: number, p90Seconds: number, maxSeconds: number }
    phaseBreakdown?: { phase: string, count: number }[]
    heatmap?: { control: string, intensity: number, driver: string }[]
    suggestions?: string[]
    recommendedMap?: {
      driver1?: Record<string, string>
      driver2?: Record<string, string>
    }
  }>(`/projects/${projectId}/driver-logs/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv: text }),
  })

  return {
    eventCount: data.eventCount ?? 0,
    buttonUsage: data.buttonUsage ?? [],
    repeatedSequences: data.repeatedSequences ?? [],
    timingGaps: data.timingGaps,
    phaseBreakdown: data.phaseBreakdown ?? [],
    heatmap: data.heatmap ?? [],
    suggestions: data.suggestions ?? [],
    recommendedMap: data.recommendedMap ?? {},
  }
}

export async function ingestSeasonUrl(projectId: string, url: string, previousProject: ProjectData) {
  const data = await requestJson<{ project?: ApiProjectResponse }>(`/projects/${projectId}/documents/ingest-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!data.project) return previousProject
  return normalizeProjectResponse(data.project, previousProject)
}

export async function updateBomOverride(projectId: string, key: string, override: { qty?: number, price?: number, note?: string }, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/bom/overrides`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, override }),
  })

  return normalizeProjectResponse(data, previousProject)
}

export function projectCodeExportUrl(projectId: string) {
  return `${API_BASE}/projects/${projectId}/code/export.zip`
}

export function artifactUrl(path?: string) {
  if (!path) return '#'
  return path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/api') ? path.slice(4) : path}`
}
