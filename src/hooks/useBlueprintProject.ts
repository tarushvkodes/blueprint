import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analyzeDriverLogText,
  applyChatSuggestion as applyChatSuggestionRequest,
  askBlueprintQuestion,
  BlueprintApiError,
  fetchAiStatus,
  fetchDemoProject,
  fetchProject,
  generateBlueprint,
  ingestSeasonUrl,
  listProjects,
  projectCodeExportUrl,
  regenerateProjectFromTeam,
  selectProjectDesign,
  startDemoRun,
  streamBlueprintQuestion,
  syncRevCatalog as syncRevCatalogRequest,
  updateProjectIntake,
  updateBomOverride as updateBomOverrideRequest,
  uploadSeasonPdf,
} from '../api'
import { defaultBlueprintQuestion, fallbackProject } from '../projectData'
import type { AiStatus, ChatMessage, ChatSuggestion, ProjectData, ProjectSummary, Team } from '../types'

const lastProjectKey = 'blueprint:lastProjectId'

export function useBlueprintProject() {
  const [project, setProject] = useState<ProjectData>(fallbackProject)
  const [selectedConcept, setSelectedConcept] = useState(1)
  const [workspaceStatus, setWorkspaceStatus] = useState('')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'I have the demo robot packet loaded. Ask me to make the BOM cheaper, explain a physics margin, tune autonomous, or rewrite the grant story.',
      status: 'complete',
    },
  ])
  const [chatSuggestions, setChatSuggestions] = useState<ChatSuggestion[]>([])
  const [chatStreaming, setChatStreaming] = useState(false)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [projectList, setProjectList] = useState<ProjectSummary[]>([])

  useEffect(() => {
    let rememberedProjectId: string | null
    try {
      rememberedProjectId = window.localStorage.getItem(lastProjectKey)
    } catch {
      rememberedProjectId = null
    }
    const loadProject = rememberedProjectId
      ? fetchProject(rememberedProjectId, fallbackProject).catch(() => fetchDemoProject())
      : fetchDemoProject()

    loadProject
      .then(setProject)
      .catch(() => setProject(fallbackProject))
    listProjects()
      .then(setProjectList)
      .catch(() => setProjectList([]))
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }, [])

  useEffect(() => {
    if (project.id && !project.demo) {
      try {
        window.localStorage.setItem(lastProjectKey, project.id)
      } catch {
        // Local storage is a convenience restore path; the API cache remains authoritative.
      }
    }
  }, [project.demo, project.id])

  const selected = project.concepts[selectedConcept] ?? project.concepts[0]
  const total = useMemo(
    () => project.bom.reduce((sum, item) => sum + item.qty * item.price, 0),
    [project.bom],
  )

  const createProject = useCallback(async (team: Team = project.team) => {
    setWorkspaceStatus('Creating project workspace...')
    try {
      const nextProject = await regenerateProjectFromTeam(team, project)
      setProject(nextProject)
      setSelectedConcept(1)
      setWorkspaceStatus('Project workspace created')
      listProjects().then(setProjectList).catch(() => {})
    } catch (error) {
      if (error instanceof BlueprintApiError && error.setupValidation?.blockers?.length) {
        setWorkspaceStatus(`Finish setup: ${error.setupValidation.blockers[0]}`)
        return
      }
      setWorkspaceStatus('Could not reach Blueprint API')
    }
  }, [project])

  const switchProject = useCallback(async (projectId: string) => {
    if (!projectId || projectId === project.id) return
    setWorkspaceStatus('Loading project workspace...')
    try {
      const nextProject = await fetchProject(projectId, project)
      setProject(nextProject)
      setSelectedConcept(1)
      setWorkspaceStatus('Project workspace loaded')
    } catch {
      setWorkspaceStatus('Could not load project')
    }
  }, [project])

  const regenerateProject = useCallback(() => {
    createProject(project.team)
  }, [createProject, project.team])

  const runDemo = useCallback(async () => {
    setWorkspaceStatus('Building demo workspace...')
    try {
      const nextProject = await startDemoRun(project)
      setProject(nextProject)
      setSelectedConcept(1)
      setWorkspaceStatus('Demo generated with deterministic AI')
      listProjects().then(setProjectList).catch(() => {})
      fetchAiStatus().then(setAiStatus).catch(() => {})
      return nextProject
    } catch (error) {
      setWorkspaceStatus(error instanceof BlueprintApiError ? error.message : 'Demo generation failed')
      return null
    }
  }, [project])

  const saveIntake = useCallback(async (team: Team) => {
    setWorkspaceStatus('Saving team intake...')
    try {
      const nextProject = await updateProjectIntake(project.id || 'demo', team, project)
      setProject(nextProject)
      setWorkspaceStatus('Team intake saved')
      listProjects().then(setProjectList).catch(() => {})
    } catch {
      setWorkspaceStatus('Could not save team intake')
    }
  }, [project])

  const generateFullBlueprint = useCallback(async (team?: Team) => {
    setWorkspaceStatus('Generating full blueprint...')
    try {
      const nextProject = await generateBlueprint(project.id || 'demo', team || project.team, project)
      setProject(nextProject)
      setSelectedConcept(1)
      setWorkspaceStatus('Blueprint generated with deterministic AI')
      listProjects().then(setProjectList).catch(() => {})
      fetchAiStatus().then(setAiStatus).catch(() => {})
      return nextProject
    } catch (error) {
      if (error instanceof BlueprintApiError && error.setupValidation?.blockers?.length) {
        setWorkspaceStatus(`Finish setup: ${error.setupValidation.blockers[0]}`)
        return null
      }
      setWorkspaceStatus(error instanceof BlueprintApiError ? error.message : 'Blueprint generation failed')
      return null
    }
  }, [project])

  const selectDesign = useCallback(async (index: number) => {
    const concept = project.concepts[index]
    setSelectedConcept(index)
    if (!project.id || !concept?.id) return
    setWorkspaceStatus('Updating selected design...')
    try {
      const nextProject = await selectProjectDesign(project.id, concept.id, project)
      setProject(nextProject)
      setWorkspaceStatus('Selected design updated')
      listProjects().then(setProjectList).catch(() => {})
    } catch {
      setWorkspaceStatus('Could not update selected design')
    }
  }, [project])

  const updateBomOverride = useCallback(async (key: string, override: { qty?: number, price?: number, note?: string }) => {
    if (!project.id) return
    setWorkspaceStatus('Updating BOM override...')
    try {
      const nextProject = await updateBomOverrideRequest(project.id, key, override, project)
      setProject(nextProject)
      setWorkspaceStatus('BOM override applied')
    } catch {
      setWorkspaceStatus('Could not update BOM override')
    }
  }, [project])

  const uploadManual = useCallback(async (file: File) => {
    setWorkspaceStatus('Uploading season PDF...')
    try {
      const nextProject = await uploadSeasonPdf(project.id || 'demo', file, project)
      setProject(nextProject)
      setWorkspaceStatus('Season PDF indexed')
      listProjects().then(setProjectList).catch(() => {})
    } catch {
      setWorkspaceStatus('Season PDF upload failed')
    }
  }, [project])

  const ingestManualUrl = useCallback(async (url: string) => {
    if (!url.trim()) return
    setWorkspaceStatus('Indexing season URL...')
    try {
      const nextProject = await ingestSeasonUrl(project.id || 'demo', url, project)
      setProject(nextProject)
      setWorkspaceStatus('Season URL indexed')
      listProjects().then(setProjectList).catch(() => {})
    } catch {
      setWorkspaceStatus('Season URL ingestion failed')
    }
  }, [project])

  const syncCatalog = useCallback(async () => {
    setWorkspaceStatus('Syncing REV catalog...')
    try {
      const synced = await syncRevCatalogRequest()
      setWorkspaceStatus(`Synced ${synced} REV products`)
    } catch {
      setWorkspaceStatus('REV catalog sync failed')
    }
  }, [])

  const askBlueprint = useCallback(async (message = defaultBlueprintQuestion) => {
    const trimmed = message.trim()
    if (!trimmed) return
    setWorkspaceStatus('Streaming Blueprint chat...')
    const userMessageId = `user-${Date.now()}`
    const assistantMessageId = `assistant-${Date.now()}`
    setChatMessages((current) => [
      ...current,
      { id: userMessageId, role: 'user', content: trimmed, status: 'complete' },
      { id: assistantMessageId, role: 'assistant', content: '', status: 'streaming' },
    ])
    setChatStreaming(true)
    try {
      const id = project.id || 'demo'
      if (trimmed.toLowerCase().startsWith('/goal')) {
        const result = await askBlueprintQuestion(id, project, trimmed)
        if (result.project) setProject(result.project)
        setChatSuggestions(result.suggestedActions)
        setChatMessages((current) => current.map((item) => (
          item.id === assistantMessageId ? { ...item, content: result.answer, status: 'complete' } : item
        )))
        setWorkspaceStatus('Goal updated')
        return
      }
      const result = await streamBlueprintQuestion(
        id,
        trimmed,
        (token) => {
          setChatMessages((current) => current.map((item) => (
            item.id === assistantMessageId ? { ...item, content: item.content + token } : item
          )))
        },
        setChatSuggestions,
      )
      setChatMessages((current) => current.map((item) => (
        item.id === assistantMessageId
          ? { ...item, content: item.content || result.answer || 'Blueprint returned no answer.', status: 'complete' }
          : item
      )))
      setWorkspaceStatus('Answer ready')
    } catch {
      const errorText = 'Chat needs a valid Google AI Studio API key. The rest of the demo packet is deterministic and ready.'
      setChatMessages((current) => current.map((item) => (
        item.id === assistantMessageId ? { ...item, content: errorText, status: 'error' } : item
      )))
      setWorkspaceStatus('Chat request failed')
    } finally {
      setChatStreaming(false)
    }
  }, [project])

  const applyChatSuggestion = useCallback(async (suggestion: ChatSuggestion) => {
    if (!project.id) return
    if (suggestion.action === 'open-tab') {
      setWorkspaceStatus(`Open ${suggestion.payload?.tab || suggestion.label} from the workspace tabs`)
      return
    }
    setWorkspaceStatus('Applying chat suggestion...')
    try {
      const result = await applyChatSuggestionRequest(project.id, suggestion, project)
      if (result.project) setProject(result.project)
      setWorkspaceStatus(result.message)
    } catch {
      setWorkspaceStatus('Could not apply chat suggestion')
    }
  }, [project])

  const analyzeDriverLogs = useCallback(async (file: File) => {
    setWorkspaceStatus('Analyzing driver logs...')
    try {
      const text = await file.text()
      const id = project.id || 'demo'
      const analysis = await analyzeDriverLogText(id, text)
      setProject((currentProject) => ({
        ...currentProject,
        driverAnalysis: analysis,
        driverInsight: analysis.suggestions.join(' ') || 'Driver log analyzed, but no suggestions were returned.',
      }))
      setWorkspaceStatus('Driver log suggestions ready')
    } catch {
      setWorkspaceStatus('Driver log analysis failed')
    }
  }, [project.id])

  const downloadCode = useCallback(() => {
    const id = project.id || 'demo'
    window.open(projectCodeExportUrl(id), '_blank')
  }, [project.id])

  return {
    project,
    projectList,
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    chatMessages,
    chatSuggestions,
    chatStreaming,
    aiStatus: aiStatus ?? project.aiStatus ?? null,
    createProject,
    runDemo,
    switchProject,
    regenerateProject,
    saveIntake,
    generateFullBlueprint,
    selectDesign,
    updateBomOverride,
    uploadManual,
    ingestManualUrl,
    syncCatalog,
    askBlueprint,
    applyChatSuggestion,
    analyzeDriverLogs,
    downloadCode,
  }
}
