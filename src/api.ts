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
  Team,
  AiStatus,
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
    price: Number.isFinite(price) ? price : 0,
    stock: item.stock,
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
    concepts: concepts.map(normalizeConcept),
    rules: data.rules ?? previousProject.rules,
    legalChecklist: data.legalChecklist ?? previousProject.legalChecklist,
    review: data.review ?? previousProject.review,
    bom: normalizeBom(data, previousProject),
    physics: physics.map(normalizePhysicsItem),
    buildSteps: data.buildGuide
      ? data.buildGuide.map((step) => `${step.phase}: ${step.instructions}`)
      : data.buildSteps ?? previousProject.buildSteps,
    buildGuide: data.buildGuide ?? previousProject.buildGuide,
    codeFiles: data.code ? Object.keys(data.code) : data.codeFiles ?? previousProject.codeFiles,
    codeValidation: data.codeValidation ?? previousProject.codeValidation,
    driverInsight: normalizeDriverInsight(data.driverInsight, previousProject.driverInsight),
    sponsorDraft: normalizeSponsorDraft(data.sponsorDraft, previousProject.sponsorDraft),
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

export async function regenerateProjectFromTeam(team: Team, previousProject: ProjectData) {
  const data = await requestJson<ApiProjectResponse>('/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team }),
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
  const data = await requestJson<{ answer?: string; project?: ApiProjectResponse }>(`/projects/${projectId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  return {
    answer: data.answer ?? 'Blueprint returned no answer.',
    project: data.project ? normalizeProjectResponse(data.project, previousProject) : null,
  }
}

export async function analyzeDriverLogText(projectId: string, text: string) {
  const data = await requestJson<{ suggestions?: string[] }>(`/projects/${projectId}/driver-logs/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ csv: text }),
  })

  return data.suggestions?.join(' ') ?? 'Driver log analyzed, but no suggestions were returned.'
}

export function projectCodeExportUrl(projectId: string) {
  return `${API_BASE}/projects/${projectId}/code/export.zip`
}

export function artifactUrl(path?: string) {
  if (!path) return '#'
  return path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/api') ? path.slice(4) : path}`
}
