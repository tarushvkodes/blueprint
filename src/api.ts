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
  Substitution,
  Team,
  AiStatus,
} from './types'

const API_BASE = (import.meta.env?.VITE_API_BASE as string | undefined) || 'http://localhost:8787/api'

const EMPTY_PREVIOUS: ProjectData = fallbackProject

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)

  if (!response.ok) {
    throw new Error(`Blueprint API request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function normalizeConcept(concept: ApiConcept | Concept): Concept {
  const estimatedCost = 'estimatedCost' in concept ? concept.estimatedCost : undefined
  const strategyFit = 'strategyFit' in concept ? concept.strategyFit : undefined
  const mainMechanisms = 'mainMechanisms' in concept ? concept.mainMechanisms : undefined

  return {
    name: concept.name,
    difficulty: concept.difficulty,
    cost: estimatedCost ?? concept.cost ?? 0,
    buildTime: concept.buildTime ?? 'Timeline pending',
    fit: strategyFit ?? concept.fit ?? '',
    mechanisms: mainMechanisms ?? concept.mechanisms ?? [],
    risks: concept.risks ?? [],
  }
}

function normalizeBomItem(item: ApiBomItem | BomItem): BomItem {
  const override = 'priceOverride' in item ? item.priceOverride : undefined
  return {
    subsystem: item.subsystem,
    sku: item.sku,
    part: item.part,
    qty: item.qty,
    price: item.price,
    stock: item.stock,
    priceOverride: override === undefined ? null : override,
    owned: 'owned' in item ? Boolean(item.owned) : false,
    note: 'note' in item ? String(item.note ?? '') : '',
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
    team: {
      ...previousProject.team,
      ...(data.team ?? {}),
    },
    season: data.season ?? previousProject.season,
    generatedBy: data.generatedBy ?? previousProject.generatedBy,
    aiFallbackReason: data.aiFallbackReason ?? previousProject.aiFallbackReason,
    aiStatus: data.aiStatus ?? previousProject.aiStatus,
    sourceDocuments: data.sourceDocuments ?? previousProject.sourceDocuments,
    artifactUrls: data.artifactUrls ?? previousProject.artifactUrls,
    concepts: concepts.map(normalizeConcept),
    rules: data.rules ?? previousProject.rules,
    bom: normalizeBom(data, previousProject),
    physics: physics.map(normalizePhysicsItem),
    buildSteps: data.buildGuide
      ? data.buildGuide.map((step) => `${step.phase}: ${step.instructions}`)
      : data.buildSteps ?? previousProject.buildSteps,
    buildGuide: data.buildGuide ?? previousProject.buildGuide,
    codeFiles: data.code ? Object.keys(data.code) : data.codeFiles ?? previousProject.codeFiles,
    substitutions: data.substitutions ?? previousProject.substitutions ?? [],
    driverInsight: normalizeDriverInsight(data.driverInsight, previousProject.driverInsight),
    sponsorDraft: normalizeSponsorDraft(data.sponsorDraft, previousProject.sponsorDraft),
  }
}

export async function fetchDemoProject() {
  const data = await requestJson<ApiProjectResponse>('/project/demo')
  return normalizeProjectResponse(data, EMPTY_PREVIOUS)
}

export async function fetchProjectById(projectId: string, previousProject?: ProjectData) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}`)
  return normalizeProjectResponse(data, previousProject ?? EMPTY_PREVIOUS)
}

export async function createProject(team: Team, previousProject?: ProjectData) {
  const data = await requestJson<ApiProjectResponse>('/projects', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ team }),
  })
  return normalizeProjectResponse(data, previousProject ?? EMPTY_PREVIOUS)
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

export type ChatCitation = {
  ruleNumber?: string
  manualSection?: string
  sourceDocument?: string
  version?: string | null
  explanation?: string
  confidence?: string
}

export type ChatAskResult = {
  answer: string
  citations: ChatCitation[]
  suggestedActions: string[]
  generatedBy?: string
}

export async function askBlueprintQuestion(projectId: string, message = defaultBlueprintQuestion): Promise<ChatAskResult> {
  const data = await requestJson<{
    answer?: string
    citations?: ChatCitation[]
    suggestedActions?: string[]
    generatedBy?: string
  }>(`/projects/${projectId}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  })

  return {
    answer: data.answer ?? 'Blueprint returned no answer.',
    citations: data.citations ?? [],
    suggestedActions: data.suggestedActions ?? [],
    generatedBy: data.generatedBy,
  }
}

export type BomUpdatePatch = {
  sku: string
  qty?: number
  price?: number
  priceOverride?: number | null
  owned?: boolean
  note?: string
}

export async function updateBomEntries(
  projectId: string,
  updates: BomUpdatePatch[],
  previousProject: ProjectData,
) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/bom/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ updates }),
  })
  return normalizeProjectResponse(data, previousProject)
}

export async function addBomSubstitution(
  projectId: string,
  substitution: Substitution,
  previousProject: ProjectData,
) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/bom/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ addSubstitution: substitution }),
  })
  return normalizeProjectResponse(data, previousProject)
}

export async function removeBomSubstitution(
  projectId: string,
  sku: string,
  previousProject: ProjectData,
) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/bom/update`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ removeSubstitution: sku }),
  })
  return normalizeProjectResponse(data, previousProject)
}

export async function appendProjectNotes(
  projectId: string,
  text: string,
  previousProject: ProjectData,
  mode: 'append' | 'replace' = 'append',
) {
  const data = await requestJson<ApiProjectResponse>(`/projects/${projectId}/notes`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, mode }),
  })
  return normalizeProjectResponse(data, previousProject)
}

export async function uploadInventoryPdf(projectId: string, file: File, previousProject: ProjectData) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', file.name)
  formData.append('type', 'inventory')

  const data = await requestJson<{ project?: ApiProjectResponse }>(`/projects/${projectId}/documents/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!data.project) return previousProject
  return normalizeProjectResponse(data.project, previousProject)
}

export async function analyzeDriverLogs(projectId: string, events: unknown) {
  return requestJson<{ suggestions?: string[]; buttonUsage?: Array<{ button: string; count: number }>; eventCount?: number; recommendedMap?: Record<string, Record<string, string>> }>(
    `/projects/${projectId}/driver-logs/analyze`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logs: events }),
    },
  )
}

export function projectCodeExportUrl(projectId: string) {
  return `${API_BASE}/projects/${projectId}/code/export.zip`
}

export function artifactUrl(path?: string) {
  if (!path) return '#'
  return path.startsWith('http') ? path : `${API_BASE}${path.startsWith('/api') ? path.slice(4) : path}`
}
