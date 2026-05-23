import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addBomSubstitution as addBomSubstitutionRequest,
  analyzeDriverLogs as analyzeDriverLogsRequest,
  appendProjectNotes as appendProjectNotesRequest,
  askBlueprintQuestion,
  createProject as createProjectRequest,
  fetchAiStatus,
  fetchDemoProject,
  fetchProjectById,
  generateBlueprint,
  projectCodeExportUrl,
  regenerateProjectFromTeam,
  removeBomSubstitution as removeBomSubstitutionRequest,
  syncRevCatalog as syncRevCatalogRequest,
  updateBomEntries,
  updateProjectIntake,
  uploadInventoryPdf,
  uploadSeasonPdf,
  type BomUpdatePatch,
  type ChatAskResult,
} from '../api'
import { defaultBlueprintQuestion, fallbackProject } from '../projectData'
import type { AiStatus, ProjectData, Substitution, Team } from '../types'

const ACTIVE_PROJECT_STORAGE_KEY = 'blueprint:activeProjectId'

function readStoredProjectId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredProjectId(id: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (id) window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, id)
    else window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY)
  } catch {
    /* storage may be unavailable; fail silent */
  }
}

export type WorkspaceFlowState = 'loading' | 'landing' | 'wizard' | 'workspace'

export function useBlueprintProject() {
  const [project, setProject] = useState<ProjectData>(fallbackProject)
  const [selectedConcept, setSelectedConcept] = useState(1)
  const [workspaceStatus, setWorkspaceStatus] = useState('')
  const [chatAnswer, setChatAnswer] = useState<ChatAskResult | null>(null)
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(() => readStoredProjectId())
  const [hasLoaded, setHasLoaded] = useState(false)
  const projectRef = useRef<ProjectData>(project)

  useEffect(() => {
    projectRef.current = project
  }, [project])

  const setActiveProjectId = useCallback((id: string | null) => {
    writeStoredProjectId(id)
    setActiveProjectIdState(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadInitial() {
      const storedId = readStoredProjectId()
      try {
        if (storedId) {
          const real = await fetchProjectById(storedId, fallbackProject)
          if (!cancelled) setProject(real)
        } else {
          const demo = await fetchDemoProject()
          if (!cancelled) setProject(demo)
        }
      } catch {
        try {
          const demo = await fetchDemoProject()
          if (!cancelled) setProject(demo)
        } catch {
          if (!cancelled) setProject(fallbackProject)
        }
        if (storedId) writeStoredProjectId(null)
      } finally {
        if (!cancelled) setHasLoaded(true)
      }
      try {
        const status = await fetchAiStatus()
        if (!cancelled) setAiStatus(status)
      } catch {
        if (!cancelled) setAiStatus(null)
      }
    }
    loadInitial()
    return () => {
      cancelled = true
    }
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
      if (nextProject.id) setActiveProjectId(nextProject.id)
      setWorkspaceStatus('Project regenerated')
    } catch {
      setWorkspaceStatus('Could not reach Blueprint API')
    }
  }, [project, setActiveProjectId])

  const createProject = useCallback(
    async (team: Team) => {
      setWorkspaceStatus('Creating project...')
      try {
        const nextProject = await createProjectRequest(team, project)
        setProject(nextProject)
        setSelectedConcept(1)
        if (nextProject.id) setActiveProjectId(nextProject.id)
        setWorkspaceStatus('Project created')
        return nextProject
      } catch (error) {
        setWorkspaceStatus('Could not create project')
        throw error
      }
    },
    [project, setActiveProjectId],
  )

  const saveIntake = useCallback(
    async (team: Team) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setWorkspaceStatus('No active project to save')
        return
      }
      setWorkspaceStatus('Saving team intake...')
      try {
        const nextProject = await updateProjectIntake(projectId, team, project)
        setProject(nextProject)
        if (nextProject.id) setActiveProjectId(nextProject.id)
        setWorkspaceStatus('Team intake saved')
      } catch {
        setWorkspaceStatus('Could not save team intake')
      }
    },
    [activeProjectId, project, setActiveProjectId],
  )

  const generateFullBlueprint = useCallback(
    async (team?: Team) => {
      const projectId = project.id || activeProjectId || 'demo'
      setWorkspaceStatus('Generating full blueprint...')
      try {
        const nextProject = await generateBlueprint(projectId, team || project.team, project)
        setProject(nextProject)
        setSelectedConcept(1)
        if (nextProject.id) setActiveProjectId(nextProject.id)
        setWorkspaceStatus(
          nextProject.generatedBy === 'vertex-express'
            ? 'Blueprint generated with Vertex AI'
            : 'Blueprint generated with local fallback',
        )
        fetchAiStatus().then(setAiStatus).catch(() => {})
      } catch {
        setWorkspaceStatus('Blueprint generation failed')
      }
    },
    [activeProjectId, project, setActiveProjectId],
  )

  const uploadManual = useCallback(
    async (file: File) => {
      const projectId = project.id || activeProjectId || 'demo'
      setWorkspaceStatus('Uploading season PDF...')
      try {
        const nextProject = await uploadSeasonPdf(projectId, file, project)
        setProject(nextProject)
        setWorkspaceStatus('Season PDF indexed')
      } catch {
        setWorkspaceStatus('Season PDF upload failed')
      }
    },
    [activeProjectId, project],
  )

  const uploadInventoryFile = useCallback(
    async (file: File) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setWorkspaceStatus('Create a project before uploading inventory.')
        return
      }
      const extension = file.name.toLowerCase().split('.').pop() || ''
      setWorkspaceStatus('Uploading inventory file...')
      try {
        if (extension === 'pdf') {
          const nextProject = await uploadInventoryPdf(projectId, file, project)
          setProject(nextProject)
          setWorkspaceStatus('Inventory PDF indexed')
          return
        }
        const text = await file.text()
        let parsedItems: string[] = []
        if (extension === 'json') {
          const parsed = JSON.parse(text)
          if (Array.isArray(parsed)) {
            parsedItems = parsed
              .map((entry) => {
                if (typeof entry === 'string') return entry
                if (entry && typeof entry === 'object') {
                  return String(entry.part || entry.name || entry.sku || entry.title || '').trim()
                }
                return ''
              })
              .filter(Boolean)
          } else if (parsed && Array.isArray(parsed.items)) {
            parsedItems = parsed.items
              .map((entry: unknown) => {
                if (typeof entry === 'string') return entry
                if (entry && typeof entry === 'object') {
                  const obj = entry as Record<string, unknown>
                  return String(obj.part || obj.name || obj.sku || '').trim()
                }
                return ''
              })
              .filter(Boolean)
          }
        } else {
          parsedItems = text
            .split(/\r?\n/)
            .map((line) => line.split(',')[0]?.trim())
            .filter((value): value is string => !!value && value.toLowerCase() !== 'part' && value.toLowerCase() !== 'name')
        }
        if (parsedItems.length === 0) {
          setWorkspaceStatus('No inventory rows recognized in file')
          return
        }
        const mergedInventory = Array.from(
          new Set([...(project.team.inventory || []), ...parsedItems]),
        )
        const nextProject = await updateProjectIntake(
          projectId,
          { ...project.team, inventory: mergedInventory },
          project,
        )
        setProject(nextProject)
        setWorkspaceStatus(`Inventory updated (+${parsedItems.length} parts)`)
      } catch {
        setWorkspaceStatus('Inventory upload failed')
      }
    },
    [activeProjectId, project],
  )

  const uploadDriverLogs = useCallback(
    async (file: File) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setWorkspaceStatus('Create a project before uploading driver logs.')
        return
      }
      const extension = file.name.toLowerCase().split('.').pop() || ''
      setWorkspaceStatus('Analyzing driver logs...')
      try {
        const text = await file.text()
        let events: unknown
        if (extension === 'json') {
          events = JSON.parse(text)
        } else {
          events = text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
        }
        const insight = await analyzeDriverLogsRequest(projectId, events)
        const suggestions = insight.suggestions || []
        setProject((current) => ({
          ...current,
          driverInsight: suggestions.join(' ') || current.driverInsight,
        }))
        setWorkspaceStatus(`Driver log analyzed (${insight.eventCount ?? 0} events)`)
      } catch {
        setWorkspaceStatus('Driver log analysis failed')
      }
    },
    [activeProjectId, project],
  )

  const syncCatalog = useCallback(async () => {
    setWorkspaceStatus('Syncing REV catalog...')
    try {
      const synced = await syncRevCatalogRequest()
      setWorkspaceStatus(`Synced ${synced} REV products`)
    } catch {
      setWorkspaceStatus('REV catalog sync failed')
    }
  }, [])

  const askBlueprint = useCallback(
    async (question = defaultBlueprintQuestion) => {
      const projectId = project.id || activeProjectId || 'demo'
      setWorkspaceStatus('Asking Blueprint...')
      try {
        const result = await askBlueprintQuestion(projectId, question)
        setChatAnswer(result)
        setWorkspaceStatus('Answer ready')
        return result
      } catch {
        setWorkspaceStatus('Chat request failed')
        return null
      }
    },
    [activeProjectId, project.id],
  )

  const downloadCode = useCallback(() => {
    const projectId = project.id || activeProjectId || 'demo'
    window.open(projectCodeExportUrl(projectId), '_blank')
  }, [activeProjectId, project.id])

  const updateBom = useCallback(
    async (updates: BomUpdatePatch[]) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setProject((current) => ({
          ...current,
          bom: current.bom.map((row) => {
            const patch = updates.find((entry) => entry.sku === row.sku)
            if (!patch) return row
            const nextOverride =
              patch.priceOverride === undefined ? row.priceOverride : patch.priceOverride
            const nextPriceFromPatch =
              patch.price !== undefined
                ? Math.max(0, Number(patch.price))
                : row.price
            return {
              ...row,
              qty: patch.qty !== undefined ? Math.max(0, Math.floor(Number(patch.qty))) : row.qty,
              price: nextOverride !== undefined && nextOverride !== null ? Number(nextOverride) : nextPriceFromPatch,
              priceOverride: nextOverride === undefined ? row.priceOverride : nextOverride,
              owned: patch.owned !== undefined ? patch.owned : row.owned,
              note: patch.note !== undefined ? patch.note : row.note,
            }
          }),
        }))
        setWorkspaceStatus('BOM updated (in-session only — start a project to persist)')
        return
      }
      setWorkspaceStatus('Saving BOM changes...')
      try {
        const nextProject = await updateBomEntries(projectId, updates, projectRef.current)
        setProject(nextProject)
        setWorkspaceStatus('BOM updated')
      } catch {
        setWorkspaceStatus('Could not save BOM update')
      }
    },
    [activeProjectId, project.id],
  )

  const addSubstitution = useCallback(
    async (substitution: Substitution) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setProject((current) => ({
          ...current,
          substitutions: [
            ...(current.substitutions || []).filter((existing) => existing.sku !== substitution.sku),
            { ...substitution, createdAt: new Date().toISOString() },
          ],
        }))
        setWorkspaceStatus('Substitution noted (in-session only)')
        return
      }
      setWorkspaceStatus('Saving substitution...')
      try {
        const nextProject = await addBomSubstitutionRequest(projectId, substitution, projectRef.current)
        setProject(nextProject)
        setWorkspaceStatus('Substitution saved')
      } catch {
        setWorkspaceStatus('Could not save substitution')
      }
    },
    [activeProjectId, project.id],
  )

  const removeSubstitution = useCallback(
    async (sku: string) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        setProject((current) => ({
          ...current,
          substitutions: (current.substitutions || []).filter((existing) => existing.sku !== sku),
        }))
        return
      }
      try {
        const nextProject = await removeBomSubstitutionRequest(projectId, sku, projectRef.current)
        setProject(nextProject)
        setWorkspaceStatus('Substitution removed')
      } catch {
        setWorkspaceStatus('Could not remove substitution')
      }
    },
    [activeProjectId, project.id],
  )

  const appendNotes = useCallback(
    async (text: string) => {
      const projectId = project.id || activeProjectId
      if (!projectId) {
        const previous = projectRef.current.team.notes || ''
        const next = previous ? `${previous.trim()}\n\n${text.trim()}`.trim() : text.trim()
        setProject((current) => ({
          ...current,
          team: { ...current.team, notes: next },
        }))
        setWorkspaceStatus('Note saved (in-session only)')
        return
      }
      setWorkspaceStatus('Saving note...')
      try {
        const nextProject = await appendProjectNotesRequest(projectId, text, projectRef.current)
        setProject(nextProject)
        setWorkspaceStatus('Note saved to project')
      } catch {
        setWorkspaceStatus('Could not save note')
      }
    },
    [activeProjectId, project.id],
  )

  const resetProject = useCallback(() => {
    setActiveProjectId(null)
    setProject(fallbackProject)
    setChatAnswer(null)
  }, [setActiveProjectId])

  return {
    project,
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    setWorkspaceStatus,
    chatAnswer,
    setChatAnswer,
    aiStatus: aiStatus ?? project.aiStatus ?? null,
    activeProjectId,
    hasLoaded,
    regenerateProject,
    createProject,
    saveIntake,
    generateFullBlueprint,
    uploadManual,
    uploadInventoryFile,
    uploadDriverLogs,
    syncCatalog,
    askBlueprint,
    downloadCode,
    updateBom,
    addSubstitution,
    removeSubstitution,
    appendNotes,
    resetProject,
  }
}
