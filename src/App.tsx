import { useState } from 'react'
import './App.css'
import { useBlueprintProject } from './hooks/useBlueprintProject'
import { LandingPage } from './LandingPage'
import { Workspace } from './Workspace'
import { Wizard } from './Wizard'
import type { Team, WorkspaceTab } from './types'

type AppView = 'landing' | 'wizard' | 'workspace'

function App() {
  const {
    project,
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    chatAnswer,
    setChatAnswer,
    aiStatus,
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
  } = useBlueprintProject()
  const [activeAccordion, setActiveAccordion] = useState(1)
  const [view, setView] = useState<AppView>('landing')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('Dashboard')
  const [wizardSubmitting, setWizardSubmitting] = useState(false)
  const [autoOpenedForId, setAutoOpenedForId] = useState<string | null>(null)

  if (
    hasLoaded &&
    view === 'landing' &&
    activeProjectId &&
    project.id === activeProjectId &&
    autoOpenedForId !== activeProjectId
  ) {
    setAutoOpenedForId(activeProjectId)
    setView('workspace')
  }

  const isNewUser = !activeProjectId

  const openWorkspace = (tab: WorkspaceTab = 'Dashboard') => {
    setActiveWorkspaceTab(tab)
    setView('workspace')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openWizard = () => {
    setView('wizard')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openLanding = () => {
    setView('landing')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleLandingCta = (tab: WorkspaceTab = 'Dashboard') => {
    if (isNewUser) openWizard()
    else openWorkspace(tab)
  }

  const handleWizardComplete = async (team: Team) => {
    setWizardSubmitting(true)
    try {
      await createProject(team)
      setActiveWorkspaceTab('Dashboard')
      setView('workspace')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setWizardSubmitting(false)
    }
  }

  if (view === 'wizard') {
    return (
      <Wizard
        initialTeam={project.team}
        isSubmitting={wizardSubmitting}
        onCancel={openLanding}
        onComplete={handleWizardComplete}
      />
    )
  }

  if (view === 'workspace') {
    return (
      <Workspace
        project={project}
        selectedConcept={selectedConcept}
        setSelectedConcept={setSelectedConcept}
        total={total}
        activeTab={activeWorkspaceTab}
        setActiveTab={setActiveWorkspaceTab}
        status={workspaceStatus}
        chatAnswer={chatAnswer}
        setChatAnswer={setChatAnswer}
        aiStatus={aiStatus}
        activeProjectId={activeProjectId}
        openLanding={openLanding}
        openWizard={openWizard}
        regenerateProject={regenerateProject}
        saveIntake={saveIntake}
        generateFullBlueprint={generateFullBlueprint}
        uploadManual={uploadManual}
        uploadInventoryFile={uploadInventoryFile}
        uploadDriverLogs={uploadDriverLogs}
        syncCatalog={syncCatalog}
        askBlueprint={askBlueprint}
        downloadCode={downloadCode}
        updateBom={updateBom}
        addSubstitution={addSubstitution}
        removeSubstitution={removeSubstitution}
        appendNotes={appendNotes}
        resetProject={resetProject}
      />
    )
  }

  return (
    <LandingPage
      project={project}
      selected={selected}
      selectedConcept={selectedConcept}
      setSelectedConcept={setSelectedConcept}
      total={total}
      activeAccordion={activeAccordion}
      setActiveAccordion={setActiveAccordion}
      isNewUser={isNewUser}
      openWorkspace={handleLandingCta}
      openWizard={openWizard}
    />
  )
}

export default App
