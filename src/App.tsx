import { useState } from 'react'
import './App.css'
import { useBlueprintProject } from './hooks/useBlueprintProject'
import { LandingPage } from './LandingPage'
import { Workspace } from './Workspace'
import type { WorkspaceTab } from './types'

function App() {
  const {
    project,
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    chatAnswer,
    aiStatus,
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
  } = useBlueprintProject()
  const [activeAccordion, setActiveAccordion] = useState(1)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('Dashboard')

  const openWorkspace = (tab: WorkspaceTab = 'Dashboard') => {
    setActiveWorkspaceTab(tab)
    setWorkspaceOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openLanding = () => {
    setWorkspaceOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (workspaceOpen) {
    return (
      <Workspace
        project={project}
        selectedConcept={selectedConcept}
        total={total}
        activeTab={activeWorkspaceTab}
        setActiveTab={setActiveWorkspaceTab}
        status={workspaceStatus}
        chatAnswer={chatAnswer}
        aiStatus={aiStatus}
        openLanding={openLanding}
        createProject={createProject}
        regenerateProject={regenerateProject}
        saveIntake={saveIntake}
        generateFullBlueprint={generateFullBlueprint}
        selectDesign={selectDesign}
        uploadManual={uploadManual}
        syncCatalog={syncCatalog}
        askBlueprint={askBlueprint}
        analyzeDriverLogs={analyzeDriverLogs}
        downloadCode={downloadCode}
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
      openWorkspace={openWorkspace}
    />
  )
}

export default App
