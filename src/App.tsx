import { useState } from 'react'
import './App.css'
import { useBlueprintProject } from './hooks/useBlueprintProject'
import { LandingPage } from './LandingPage'
import { Workspace } from './Workspace'
import type { WorkspaceTab } from './types'

function App() {
  const {
    project,
    projectList,
    selected,
    selectedConcept,
    setSelectedConcept,
    total,
    workspaceStatus,
    chatAnswer,
    chatSuggestions,
    aiStatus,
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
  } = useBlueprintProject()
  const [activeAccordion, setActiveAccordion] = useState(1)
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('Dashboard')
  const [demoRunning, setDemoRunning] = useState(false)

  const openWorkspace = (tab: WorkspaceTab = 'Dashboard') => {
    setActiveWorkspaceTab(tab)
    setWorkspaceOpen(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const openLanding = () => {
    setWorkspaceOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const startDemo = async () => {
    setDemoRunning(true)
    try {
      const demo = await runDemo()
      if (demo) openWorkspace('Dashboard')
    } finally {
      setDemoRunning(false)
    }
  }

  if (workspaceOpen) {
    return (
      <Workspace
        project={project}
        projectList={projectList}
        selectedConcept={selectedConcept}
        total={total}
        activeTab={activeWorkspaceTab}
        setActiveTab={setActiveWorkspaceTab}
        status={workspaceStatus}
        chatAnswer={chatAnswer}
        chatSuggestions={chatSuggestions}
        aiStatus={aiStatus}
        openLanding={openLanding}
        createProject={createProject}
        switchProject={switchProject}
        regenerateProject={regenerateProject}
        saveIntake={saveIntake}
        generateFullBlueprint={generateFullBlueprint}
        selectDesign={selectDesign}
        updateBomOverride={updateBomOverride}
        uploadManual={uploadManual}
        ingestManualUrl={ingestManualUrl}
        syncCatalog={syncCatalog}
        askBlueprint={askBlueprint}
        applyChatSuggestion={applyChatSuggestion}
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
      startDemo={startDemo}
      demoRunning={demoRunning}
    />
  )
}

export default App
