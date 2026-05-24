import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  FileText,
  MessageSquareText,
  PackageCheck,
  PlusCircle,
  RefreshCw,
  Save,
  Send,
  SlidersHorizontal,
  Upload,
  Users,
} from 'lucide-react'
import { useMemo, useState, type ChangeEvent, type KeyboardEvent } from 'react'
import { artifactUrl } from './api'
import { codeSample, defaultBlueprintQuestion } from './projectData'
import { validateTeamSetupDraft } from './setupValidation'
import { workspaceTabs, type AiStatus, type BuildGuideStep, type ProjectData, type Team, type WorkspaceTab } from './types'
import { LiquidLogoMark, ShaderBackdrop } from './VisualEffects'

type WorkspaceProps = {
  project: ProjectData
  selectedConcept: number
  total: number
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  status: string
  chatAnswer: string
  aiStatus: AiStatus | null
  openLanding: () => void
  createProject: (team: Team) => void
  regenerateProject: () => void
  saveIntake: (team: Team) => void
  generateFullBlueprint: (team?: Team) => void
  selectDesign: (index: number) => void
  uploadManual: (file: File) => void
  syncCatalog: () => void
  analyzeDriverLogs: (file: File) => void
  askBlueprint: (message?: string) => void
  downloadCode: () => void
}

const wizardSteps = [
  { title: 'Team', copy: 'Identity, roster, location, and mentor coverage.' },
  { title: 'Resources', copy: 'Budget, tools, space, inventory, and supplier preference.' },
  { title: 'Strategy', copy: 'AI, team-provided, or hybrid planning with priorities.' },
  { title: 'Review', copy: 'Confirm the packet inputs before generation.' },
]

const priorityOptions = [
  'Low cost',
  'Easy to build',
  'Fast drivetrain',
  'Strong endgame',
  'Reliable autonomous',
  'Simple driver control',
  'Easy maintenance',
  'Maximum scoring potential',
  'Alliance-friendly reliability',
]

const strategyModes = [
  { value: 'ai', label: 'AI-generated', copy: 'Blueprint proposes the initial strategy from constraints.' },
  { value: 'team-provided', label: 'Team-provided', copy: 'Students drive the strategy; Blueprint checks and packages it.' },
  { value: 'hybrid', label: 'Hybrid', copy: 'Students set direction while Blueprint fills gaps and tradeoffs.' },
]

export function Workspace({
  project,
  selectedConcept,
  total,
  activeTab,
  setActiveTab,
  status,
  chatAnswer,
  aiStatus,
  openLanding,
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
}: WorkspaceProps) {
  const selected = project.concepts[selectedConcept] ?? project.concepts[0]
  const isVertexGenerated = project.generatedBy?.startsWith('vertex')
  const buildGuideRows: BuildGuideStep[] = project.buildGuide?.length
    ? project.buildGuide
    : project.buildSteps.map((step) => ({ phase: 'Build', instructions: step }))
  const [teamDraftState, setTeamDraftState] = useState<{ projectId?: string, team: Team }>(() => ({
    projectId: project.id,
    team: project.team,
  }))
  const [wizardStep, setWizardStep] = useState(0)
  const [inventoryUploadStatus, setInventoryUploadStatus] = useState('')
  const [chatDraft, setChatDraft] = useState(defaultBlueprintQuestion)
  const teamDraft = teamDraftState.projectId === project.id ? teamDraftState.team : project.team
  const setTeamDraft = (updater: Team | ((current: Team) => Team)) => {
    setTeamDraftState((current) => {
      const currentTeam = current.projectId === project.id ? current.team : project.team
      const nextTeam = typeof updater === 'function' ? updater(currentTeam) : updater

      return { projectId: project.id, team: nextTeam }
    })
  }

  const setupValidation = useMemo(() => validateTeamSetupDraft(teamDraft, project.season), [project.season, teamDraft])
  const setupChecks = setupValidation.checks
  const setupReady = setupValidation.ready
  const setupComplete = setupValidation.completed
  const currentWizardStep = wizardSteps[wizardStep]

  const updateTeamField = (field: keyof Team, value: string | number) => {
    setTeamDraft((current) => ({ ...current, [field]: value }))
  }

  const updateTeamList = (field: keyof Team, value: string) => {
    setTeamDraft((current) => ({
      ...current,
      [field]: value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
    }))
  }

  const toggleTeamListItem = (field: keyof Team, value: string) => {
    setTeamDraft((current) => {
      const currentValues = Array.isArray(current[field]) ? current[field] as string[] : []
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value]

      return { ...current, [field]: nextValues }
    })
  }

  const handleManualUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) uploadManual(file)
    event.target.value = ''
  }

  const handleInventoryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const imported = text
      .split(/\r?\n/)
      .map((line) => line.split(/,|\t/).map((cell) => cell.trim()).find((cell) => (
        cell &&
        !/^(item|part|parts|sku|qty|quantity|inventory)$/i.test(cell) &&
        !/^\d+(\.\d+)?$/.test(cell)
      )))
      .filter((item): item is string => Boolean(item))
    const nextInventory = Array.from(new Set([...(teamDraft.inventory || []), ...imported]))
    setTeamDraft((current) => ({ ...current, inventory: nextInventory }))
    setInventoryUploadStatus(imported.length ? `Imported ${imported.length} inventory lines` : 'No inventory rows found')
    event.target.value = ''
  }

  const handleDriverLogUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) analyzeDriverLogs(file)
    event.target.value = ''
  }

  const openArtifact = (path?: string) => {
    window.open(artifactUrl(path), '_blank')
  }

  const submitChat = () => {
    const message = chatDraft.trim()
    if (!message) return
    askBlueprint(message)
  }

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitChat()
    }
  }

  return (
    <main className="app-shell workspace-screen">
      <ShaderBackdrop variant="workspace" />
      <nav className="workspace-nav liquid-glass">
        <button className="brand workspace-brand" type="button" onClick={openLanding} aria-label="Back to Blueprint overview">
          <span className="brand-mark">
            <LiquidLogoMark size={34} />
          </span>
          Blueprint
        </button>
        <div className="workspace-tabs" aria-label="Workspace tabs">
          {workspaceTabs.map((tab) => (
            <button
              className={activeTab === tab ? 'is-active' : ''}
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <button className="nav-action workspace-action" type="button" onClick={regenerateProject}>
          <RefreshCw size={16} />
          Regenerate
        </button>
      </nav>

      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h1>{project.team.name}</h1>
          <p>
            {project.team.manual} is connected to strategy, REV supply, physics checks, starter code, build steps,
            grants, and driver-control iteration.
          </p>
        </div>
        <div className="workspace-command-panel liquid-glass">
          <button type="button" onClick={syncCatalog}>
            <PackageCheck size={18} />
            Sync REV catalog
          </button>
          <button type="button" onClick={downloadCode}>
            <Download size={18} />
            Download code ZIP
          </button>
          <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadConceptJson || project.artifactUrls?.cadGltf)}>
            <Download size={18} />
            Download CAD concept
          </button>
          <button type="button" onClick={() => setActiveTab('Chat')}>
            <MessageSquareText size={18} />
            Ask Blueprint
          </button>
          <span>{status || 'Ready'}</span>
        </div>
      </section>

      <section className="workspace-layout">
        <aside className="workspace-sidebar">
          <div>
            <span>AI provider</span>
            <strong>{aiStatus?.message || project.aiStatus?.message || 'Local fallback active'}</strong>
          </div>
          <div>
            <span>Season source</span>
            <strong>{project.season?.isSample ? 'Sample DECODE' : project.season?.seasonName || 'Upload needed'}</strong>
          </div>
          <div>
            <span>Budget</span>
            <strong>${project.team.budget.toLocaleString()}</strong>
          </div>
          <div>
            <span>BOM subtotal</span>
            <strong>${total.toLocaleString()}</strong>
          </div>
          <div>
            <span>Selected design</span>
            <strong>{selected?.name}</strong>
          </div>
          <div>
            <span>Team level</span>
            <strong>{project.team.experience}</strong>
          </div>
        </aside>

        <div className="workspace-main">
          {activeTab === 'Dashboard' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <div>
                  <h2>Blueprint setup</h2>
                  <p>Upload the official season manual, enter team requirements, then generate code, CAD, and build instructions.</p>
                </div>
                <strong>{isVertexGenerated ? 'Vertex AI' : 'Fallback'}</strong>
              </div>

              <div className="setup-grid wizard-grid">
                <aside className="wizard-rail" aria-label="Project setup steps">
                  {wizardSteps.map((step, index) => (
                    <button
                      className={wizardStep === index ? 'is-active' : ''}
                      key={step.title}
                      type="button"
                      onClick={() => setWizardStep(index)}
                    >
                      <span>{index + 1}</span>
                      <strong>{step.title}</strong>
                      <small>{step.copy}</small>
                    </button>
                  ))}
                </aside>

                <section className="setup-card wizard-card">
                  <div className="wizard-card-header">
                    <span>Step {wizardStep + 1} of {wizardSteps.length}</span>
                    <h3>{currentWizardStep.title}</h3>
                    <p>{currentWizardStep.copy}</p>
                  </div>

                  {wizardStep === 0 && (
                    <div className="setup-form">
                      <label>
                        Team name
                        <input value={teamDraft.name} onChange={(event) => updateTeamField('name', event.target.value)} />
                      </label>
                      <label>
                        Team number
                        <input value={teamDraft.number} onChange={(event) => updateTeamField('number', event.target.value)} />
                      </label>
                      <label>
                        Location
                        <input value={teamDraft.location} onChange={(event) => updateTeamField('location', event.target.value)} />
                      </label>
                      <label>
                        Experience
                        <select value={teamDraft.experience} onChange={(event) => updateTeamField('experience', event.target.value)}>
                          <option>Beginner</option>
                          <option>Intermediate</option>
                          <option>Advanced</option>
                        </select>
                      </label>
                      <label>
                        Students
                        <input type="number" min="1" value={teamDraft.students} onChange={(event) => updateTeamField('students', Number(event.target.value))} />
                      </label>
                      <label>
                        Mentors
                        <input type="number" min="0" value={teamDraft.mentors} onChange={(event) => updateTeamField('mentors', Number(event.target.value))} />
                      </label>
                    </div>
                  )}

                  {wizardStep === 1 && (
                    <div className="setup-form">
                      <label>
                        Budget
                        <input type="number" min="0" value={teamDraft.budget} onChange={(event) => updateTeamField('budget', Number(event.target.value))} />
                      </label>
                      <label>
                        Timeline weeks
                        <input type="number" min="1" value={teamDraft.timelineWeeks || 6} onChange={(event) => updateTeamField('timelineWeeks', Number(event.target.value))} />
                      </label>
                      <label>
                        Preferred supplier
                        <input value={teamDraft.supplier} onChange={(event) => updateTeamField('supplier', event.target.value)} />
                      </label>
                      <label>
                        Build space
                        <input value={teamDraft.buildSpace || ''} onChange={(event) => updateTeamField('buildSpace', event.target.value)} />
                      </label>
                      <label className="wide">
                        Tools available
                        <textarea value={(teamDraft.tools || []).join(', ')} onChange={(event) => updateTeamList('tools', event.target.value)} />
                      </label>
                      <label className="wide">
                        Existing inventory
                        <textarea value={(teamDraft.inventory || []).join(', ')} onChange={(event) => updateTeamList('inventory', event.target.value)} />
                      </label>
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="strategy-editor">
                      <div className="mode-picker" role="group" aria-label="Strategy input mode">
                        {strategyModes.map((mode) => (
                          <button
                            className={teamDraft.strategyMode === mode.value ? 'is-active' : ''}
                            key={mode.value}
                            type="button"
                            aria-pressed={teamDraft.strategyMode === mode.value}
                            onClick={() => updateTeamField('strategyMode', mode.value)}
                          >
                            <strong>{mode.label}</strong>
                            <span>{mode.copy}</span>
                          </button>
                        ))}
                      </div>
                      <div className="priority-picker" aria-label="Robot priorities">
                        {priorityOptions.map((priority) => (
                          <button
                            className={teamDraft.priorities?.includes(priority) ? 'is-active' : ''}
                            key={priority}
                            type="button"
                            aria-pressed={teamDraft.priorities?.includes(priority)}
                            onClick={() => toggleTeamListItem('priorities', priority)}
                          >
                            {priority}
                          </button>
                        ))}
                      </div>
                      <div className="setup-form">
                        <label>
                          CAD experience
                          <select value={teamDraft.cadExperience || 'Beginner'} onChange={(event) => updateTeamField('cadExperience', event.target.value)}>
                            <option>Beginner</option>
                            <option>Intermediate</option>
                            <option>Advanced</option>
                          </select>
                        </label>
                        <label>
                          Programming experience
                          <select value={teamDraft.programmingExperience || 'Beginner'} onChange={(event) => updateTeamField('programmingExperience', event.target.value)}>
                            <option>Beginner</option>
                            <option>Intermediate</option>
                            <option>Advanced</option>
                          </select>
                        </label>
                        <label className="wide">
                          Team strategy notes
                          <textarea value={teamDraft.strategyNotes || ''} onChange={(event) => updateTeamField('strategyNotes', event.target.value)} />
                        </label>
                        <label className="wide">
                          Goals
                          <textarea value={teamDraft.goals || ''} onChange={(event) => updateTeamField('goals', event.target.value)} />
                        </label>
                        <label className="wide">
                          Constraints
                          <textarea value={teamDraft.constraints || ''} onChange={(event) => updateTeamField('constraints', event.target.value)} />
                        </label>
                      </div>
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <div className="review-board">
                      <div>
                        <Users size={18} />
                        <span>Team</span>
                        <strong>{teamDraft.name} #{teamDraft.number}</strong>
                      </div>
                      <div>
                        <Database size={18} />
                        <span>Budget</span>
                        <strong>${Number(teamDraft.budget || 0).toLocaleString()}</strong>
                      </div>
                      <div>
                        <CalendarDays size={18} />
                        <span>Timeline</span>
                        <strong>{teamDraft.timelineWeeks || 0} weeks</strong>
                      </div>
                      <div>
                        <ClipboardList size={18} />
                        <span>Inputs</span>
                        <strong>{teamDraft.inventory?.length || 0} inventory items</strong>
                      </div>
                    </div>
                  )}

                  <div className="setup-actions wizard-actions">
                    <button type="button" disabled={wizardStep === 0} onClick={() => setWizardStep((step) => Math.max(0, step - 1))}>
                      <ChevronLeft size={16} />
                      Back
                    </button>
                    <button type="button" onClick={() => saveIntake(teamDraft)}>
                      <Save size={16} />
                      Save draft
                    </button>
                    <button type="button" disabled={!setupReady} onClick={() => createProject(teamDraft)}>
                      <PlusCircle size={16} />
                      Create project
                    </button>
                    {wizardStep < wizardSteps.length - 1 ? (
                      <button type="button" onClick={() => setWizardStep((step) => Math.min(wizardSteps.length - 1, step + 1))}>
                        Next
                        <ChevronRight size={16} />
                      </button>
                    ) : (
                      <button type="button" disabled={!setupReady} onClick={() => generateFullBlueprint(teamDraft)}>
                        Generate blueprint
                      </button>
                    )}
                  </div>
                  {!setupReady && (
                    <div className="setup-alert">
                      <strong>Finish setup before generation</strong>
                      <span>{setupValidation.blockers[0]}</span>
                    </div>
                  )}
                </section>

                <aside className="setup-card setup-companion">
                  <h3><FileText size={18} /> Project sources</h3>
                  <p>{project.season?.title || project.season?.seasonName || 'Upload a current FTC manual or season PDF.'}</p>
                  <small>{project.season?.manualVersion || 'No manual version detected'} · {project.sourceDocuments?.length || 0} source documents</small>
                  {project.season?.isSample && <em>Sample DECODE data is active until a PDF is uploaded.</em>}
                  <label className="file-upload">
                    <Upload size={18} />
                    Upload season PDF
                    <input type="file" accept="application/pdf,.pdf" onChange={handleManualUpload} />
                  </label>

                  <div className="data-upload-stack">
                    <label className="file-upload secondary-upload">
                      <Upload size={18} />
                      Import inventory
                      <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={handleInventoryUpload} />
                    </label>
                    {inventoryUploadStatus && <small>{inventoryUploadStatus}</small>}
                    <label className="file-upload secondary-upload">
                      <SlidersHorizontal size={18} />
                      Analyze driver logs
                      <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleDriverLogUpload} />
                    </label>
                  </div>

                  <div className="setup-meter">
                    <span>{setupComplete}/{setupChecks.length} setup checks</span>
                    <div><i style={{ width: `${setupValidation.percent}%` }} /></div>
                  </div>
                  <ul className="setup-checklist">
                    {setupChecks.map((item) => (
                      <li className={item.done ? 'is-done' : item.required ? 'is-required' : ''} key={item.label} title={item.done ? item.label : item.message}>
                        <CheckCircle2 size={15} />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                  {!!setupValidation.warnings.length && (
                    <small className="setup-warning">{setupValidation.warnings[0]}</small>
                  )}

                  <div className="artifact-buttons compact-artifacts">
                    <button type="button" onClick={downloadCode}><Download size={16} /> Code ZIP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadConceptJson || project.artifactUrls?.cadGltf)}><Download size={16} /> CAD concept JSON</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadConceptStep || project.artifactUrls?.cadStep)}><Download size={16} /> CAD concept STEP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.buildGuideHtml)}><Download size={16} /> Build guide</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.projectJson)}><Download size={16} /> Project JSON</button>
                  </div>
                </aside>
              </div>
            </div>
          )}

          {activeTab === 'Overview' && (
            <div className="workspace-grid">
              <article className="workspace-card-flat">
                <h2>Strategy recommendation</h2>
                <p>{selected?.fit}</p>
                <button type="button" onClick={() => setActiveTab('Strategy')}>Open strategy</button>
              </article>
              <article className="workspace-card-flat">
                <h2>Legal/rules checklist</h2>
                <p>{project.rules[0]?.note || 'Manual citations will appear after ingestion.'}</p>
                <button type="button" onClick={() => setActiveTab('BOM')}>Review supply</button>
              </article>
              <article className="workspace-card-flat">
                <h2>Mechanism math</h2>
                <p>{project.physics[0]?.result || 'Physics calculations are ready to generate.'}</p>
                <button type="button" onClick={() => setActiveTab('Physics')}>Open physics</button>
              </article>
              <article className="workspace-card-flat">
                <h2>Generated artifacts</h2>
                <p>{project.codeFiles.length} code files, {project.buildSteps.length} build phases, and a CAD concept preview.</p>
                <button type="button" onClick={() => setActiveTab('Code')}>Open code</button>
              </article>
            </div>
          )}

          {activeTab === 'Strategy' && (
            <div className="workspace-panel">
              <h2>Strategy</h2>
              <p>Prioritize reliable scoring, low penalty exposure, driver practice, and mechanisms that match the team budget.</p>
              <div className="workspace-list">
                {['Reliable autonomous', 'Repeatable teleop cycles', 'Alliance-friendly behavior', 'Low-maintenance mechanisms'].map((item) => (
                  <span key={item}><CheckCircle2 size={16} />{item}</span>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Design' && (
            <div className="workspace-panel">
              <h2>Robot concepts</h2>
              <div className="workspace-concepts">
                {project.concepts.map((concept, index) => (
                  <button
                    className={selectedConcept === index ? 'is-selected' : ''}
                    key={concept.name}
                    type="button"
                    onClick={() => selectDesign(index)}
                  >
                    <span>{concept.difficulty}</span>
                    <strong>{concept.name}</strong>
                    <p>{concept.fit}</p>
                    <em>${concept.cost.toLocaleString()} · {concept.buildTime}</em>
                  </button>
                ))}
              </div>
              {!!selected?.mechanismSpecs?.length && (
                <div className="mechanism-spec-grid">
                  {selected.mechanismSpecs.map((spec) => (
                    <article key={spec.id}>
                      <span>{spec.type}</span>
                      <strong>{spec.name}</strong>
                      <p>{spec.summary}</p>
                      <small>{spec.id}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'BOM' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <h2>Bill of materials</h2>
                <strong>${total.toLocaleString()}</strong>
              </div>
              <div className="workspace-table">
                {project.bom.map((item, index) => (
                  <div key={`${item.sku}-${index}`}>
                    <span>{item.subsystem}</span>
                    <strong>{item.part}</strong>
                    <small>{item.sku}</small>
                    <em>{item.qty} x ${item.price}</em>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Physics' && (
            <div className="workspace-panel">
              <h2>Mechanism calculations</h2>
              <div className="workspace-physics">
                {project.physics.map((item) => (
                  <article key={item.mechanism}>
                    <span>{item.margin}</span>
                    <h3>{item.mechanism}</h3>
                    <code>{item.formula}</code>
                    <p>{item.inputs}</p>
                    <strong>{item.result}</strong>
                    <small>{item.recommendation}</small>
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Code' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <h2>FTC SDK Java</h2>
                <button type="button" onClick={downloadCode}><Download size={16} /> ZIP</button>
              </div>
              <div className={`validation-banner ${project.codeValidation?.ok ? 'is-ok' : 'has-issues'}`}>
                <strong>{project.codeValidation?.ok ? 'Static validation passed' : 'Static validation needs review'}</strong>
                <span>{project.codeValidation?.note || 'Compile inside a real FTC SDK project before robot use.'}</span>
              </div>
              <pre><code>{codeSample}</code></pre>
              <div className="file-row">
                {project.codeFiles.map((file) => <span key={file}>{file}</span>)}
              </div>
            </div>
          )}

          {activeTab === 'CAD' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <h2>CAD exports</h2>
                <strong>{project.season?.seasonName || 'Season'}</strong>
              </div>
              <p>Blueprint generates a parametric CAD layout first, then exposes downloadable concept artifacts for review.</p>
              <p>These are concept specs for review, not manufacturing-ready mesh or STEP exports.</p>
              <div className="artifact-buttons">
                <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadConceptJson || project.artifactUrls?.cadGltf)}><Download size={16} /> Concept JSON</button>
                <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadConceptStep || project.artifactUrls?.cadStep)}><Download size={16} /> Concept STEP note</button>
              </div>
              <pre><code>{JSON.stringify(project.season?.robotConstraints || [], null, 2)}</code></pre>
            </div>
          )}

          {activeTab === 'Build' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <h2>Build guide</h2>
                <button type="button" onClick={() => openArtifact(project.artifactUrls?.buildGuideHtml)}><Download size={16} /> HTML</button>
              </div>
              <div className="timeline workspace-timeline">
                {buildGuideRows.map((step, index) => (
                  <article key={`${step.phase}-${index}`}>
                    <span>{index + 1}</span>
                    <h3>{step.title || step.phase}</h3>
                    <p>{step.instructions}</p>
                    {step.diagram && <small>{step.diagram}</small>}
                    {step.test && <small>Test: {step.test}</small>}
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Chat' && (
            <div className="workspace-panel">
              <h2>Ask Blueprint</h2>
              <p>Use this as the iteration layer for strategy, legality, torque, code, grants, and driver controls.</p>
              <div className="workspace-chat-row">
                <textarea
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder="/goal Build a reliable low-cost autonomous robot"
                />
                <button type="button" onClick={submitChat}><Send size={16} /> Send</button>
              </div>
              {chatAnswer && <p className="workspace-answer">{chatAnswer}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
