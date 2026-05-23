import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  analyzeDriverLogText,
  askBlueprintQuestion,
  fetchAiStatus,
  fetchDemoProject,
  fetchProject,
  generateBlueprint,
  projectCodeExportUrl,
  regenerateProjectFromTeam,
  selectProjectDesign,
  syncRevCatalog as syncRevCatalogRequest,
  updateProjectIntake,
  uploadSeasonPdf,
} from '../api'
import { defaultBlueprintQuestion, fallbackProject } from '../projectData'
import type { AiStatus, ProjectData, Team } from '../types'

const lastProjectKey = 'blueprint:lastProjectId'

export function useBlueprintProject() {
  const [project, setProject] = useState<ProjectData>(fallbackProject)
  const [selectedConcept, setSelectedConcept] = useState(1)
  const [workspaceStatus, setWorkspaceStatus] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)

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
    } catch {
      setWorkspaceStatus('Could not reach Blueprint API')
    }
  }, [project])

  const regenerateProject = useCallback(() => {
    createProject(project.team)
  }, [createProject, project.team])

  const saveIntake = useCallback(async (team: Team) => {
    setWorkspaceStatus('Saving team intake...')
    try {
      const nextProject = await updateProjectIntake(project.id || 'demo', team, project)
      setProject(nextProject)
      setWorkspaceStatus('Team intake saved')
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
      setWorkspaceStatus(nextProject.generatedBy === 'vertex-express' ? 'Blueprint generated with Vertex AI' : 'Blueprint generated with local fallback')
      fetchAiStatus().then(setAiStatus).catch(() => {})
    } catch {
      setWorkspaceStatus('Blueprint generation failed')
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
    } catch {
      setWorkspaceStatus('Could not update selected design')
    }
  }, [project])

  const uploadManual = useCallback(async (file: File) => {
    setWorkspaceStatus('Uploading season PDF...')
    try {
      const nextProject = await uploadSeasonPdf(project.id || 'demo', file, project)
      setProject(nextProject)
      setWorkspaceStatus('Season PDF indexed')
    } catch {
      setWorkspaceStatus('Season PDF upload failed')
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

  const askBlueprint = useCallback(async () => {
    setWorkspaceStatus('Asking Blueprint...')
    try {
      const id = project.id || 'demo'
      const answer = await askBlueprintQuestion(id, defaultBlueprintQuestion)
      setChatAnswer(answer)
      setWorkspaceStatus('Answer ready')
    } catch {
      setWorkspaceStatus('Chat request failed')
    }
  }, [project.id])

  const analyzeDriverLogs = useCallback(async (file: File) => {
    setWorkspaceStatus('Analyzing driver logs...')
    try {
      const text = await file.text()
      const id = project.id || 'demo'
      const insight = await analyzeDriverLogText(id, text)
      setProject((currentProject) => ({ ...currentProject, driverInsight: insight }))
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
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    chatAnswer,
    aiStatus: aiStatus ?? project.aiStatus ?? null,
    createProject,
    regenerateProject,
    saveIntake,
    generateFullBlueprint,
    selectDesign,
    uploadManual,
    syncCatalog,
    askBlueprint,
    analyzeDriverLogs,
    downloadCode,
  }
}
