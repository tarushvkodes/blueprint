import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  askBlueprintQuestion,
  fetchAiStatus,
  fetchDemoProject,
  generateBlueprint,
  projectCodeExportUrl,
  regenerateProjectFromTeam,
  syncRevCatalog as syncRevCatalogRequest,
  updateProjectIntake,
  uploadSeasonPdf,
} from '../api'
import { defaultBlueprintQuestion, fallbackProject } from '../projectData'
import type { AiStatus, ProjectData, Team } from '../types'

export function useBlueprintProject() {
  const [project, setProject] = useState<ProjectData>(fallbackProject)
  const [selectedConcept, setSelectedConcept] = useState(1)
  const [workspaceStatus, setWorkspaceStatus] = useState('')
  const [chatAnswer, setChatAnswer] = useState('')
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)

  useEffect(() => {
    fetchDemoProject()
      .then(setProject)
      .catch(() => setProject(fallbackProject))
    fetchAiStatus()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }, [])

  const selected = project.concepts[selectedConcept] ?? project.concepts[0]
  const total = useMemo(
    () => project.bom.reduce((sum, item) => sum + item.qty * item.price, 0),
    [project.bom],
  )

  const regenerateProject = useCallback(async () => {
    setWorkspaceStatus('Generating project...')
    try {
      const nextProject = await regenerateProjectFromTeam(project.team, project)
      setProject(nextProject)
      setSelectedConcept(1)
      setWorkspaceStatus('Project regenerated')
    } catch {
      setWorkspaceStatus('Could not reach Blueprint API')
    }
  }, [project])

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
    regenerateProject,
    saveIntake,
    generateFullBlueprint,
    uploadManual,
    syncCatalog,
    askBlueprint,
    downloadCode,
  }
}
