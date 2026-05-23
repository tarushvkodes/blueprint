import {
  Bot,
  CheckCircle2,
  Download,
  FileText,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Send,
  Upload,
} from 'lucide-react'
import { useState, type ChangeEvent } from 'react'
import { artifactUrl } from './api'
import { codeSample, defaultBlueprintQuestion } from './projectData'
import { workspaceTabs, type AiStatus, type BuildGuideStep, type ProjectData, type Team, type WorkspaceTab } from './types'

type WorkspaceProps = {
  project: ProjectData
  selectedConcept: number
  setSelectedConcept: (index: number) => void
  total: number
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  status: string
  chatAnswer: string
  aiStatus: AiStatus | null
  openLanding: () => void
  regenerateProject: () => void
  saveIntake: (team: Team) => void
  generateFullBlueprint: (team?: Team) => void
  uploadManual: (file: File) => void
  syncCatalog: () => void
  askBlueprint: () => void
  downloadCode: () => void
}

export function Workspace({
  project,
  selectedConcept,
  setSelectedConcept,
  total,
  activeTab,
  setActiveTab,
  status,
  chatAnswer,
  aiStatus,
  openLanding,
  regenerateProject,
  saveIntake,
  generateFullBlueprint,
  uploadManual,
  syncCatalog,
  askBlueprint,
  downloadCode,
}: WorkspaceProps) {
  const selected = project.concepts[selectedConcept] ?? project.concepts[0]
  const buildGuideRows: BuildGuideStep[] = project.buildGuide?.length
    ? project.buildGuide
    : project.buildSteps.map((step) => ({ phase: 'Build', instructions: step }))
  const [teamDraft, setTeamDraft] = useState(project.team)

  const updateTeamField = (field: keyof Team, value: string | number) => {
    setTeamDraft((current) => ({ ...current, [field]: value }))
  }

  const updateTeamList = (field: keyof Team, value: string) => {
    setTeamDraft((current) => ({
      ...current,
      [field]: value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
    }))
  }

  const handleManualUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) uploadManual(file)
    event.target.value = ''
  }

  const openArtifact = (path?: string) => {
    window.open(artifactUrl(path), '_blank')
  }

  return (
    <main className="app-shell workspace-screen">
      <nav className="workspace-nav">
        <button className="brand workspace-brand" type="button" onClick={openLanding} aria-label="Back to Blueprint overview">
          <span className="brand-mark">
            <Bot size={18} />
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
        <div className="workspace-command-panel">
          <button type="button" onClick={syncCatalog}>
            <PackageCheck size={18} />
            Sync REV catalog
          </button>
          <button type="button" onClick={downloadCode}>
            <Download size={18} />
            Download code ZIP
          </button>
          <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadGltf)}>
            <Download size={18} />
            Download CAD GLB
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
                <strong>{project.generatedBy === 'vertex-express' ? 'Vertex AI' : 'Fallback'}</strong>
              </div>

              <div className="setup-grid">
                <section className="setup-card">
                  <h3><FileText size={18} /> Season workbook</h3>
                  <p>{project.season?.title || project.season?.seasonName || 'Upload a current FTC manual or season PDF.'}</p>
                  <small>{project.season?.manualVersion || 'No manual version detected'} · {project.sourceDocuments?.length || 0} source documents</small>
                  {project.season?.isSample && <em>Sample DECODE data is active until a PDF is uploaded.</em>}
                  <label className="file-upload">
                    <Upload size={18} />
                    Upload season PDF
                    <input type="file" accept="application/pdf,.pdf" onChange={handleManualUpload} />
                  </label>
                </section>

                <section className="setup-card">
                  <h3>Team requirements</h3>
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
                      Budget
                      <input type="number" value={teamDraft.budget} onChange={(event) => updateTeamField('budget', Number(event.target.value))} />
                    </label>
                    <label>
                      Experience
                      <select value={teamDraft.experience} onChange={(event) => updateTeamField('experience', event.target.value)}>
                        <option>Beginner</option>
                        <option>Intermediate</option>
                        <option>Advanced</option>
                      </select>
                    </label>
                    <label className="wide">
                      Goals
                      <textarea value={teamDraft.goals || ''} onChange={(event) => updateTeamField('goals', event.target.value)} />
                    </label>
                    <label className="wide">
                      Constraints
                      <textarea value={teamDraft.constraints || ''} onChange={(event) => updateTeamField('constraints', event.target.value)} />
                    </label>
                    <label className="wide">
                      Inventory
                      <textarea value={(teamDraft.inventory || []).join(', ')} onChange={(event) => updateTeamList('inventory', event.target.value)} />
                    </label>
                    <label className="wide">
                      Priorities
                      <textarea value={(teamDraft.priorities || []).join(', ')} onChange={(event) => updateTeamList('priorities', event.target.value)} />
                    </label>
                  </div>
                  <div className="setup-actions">
                    <button type="button" onClick={() => saveIntake(teamDraft)}>Save intake</button>
                    <button type="button" onClick={() => generateFullBlueprint(teamDraft)}>Generate blueprint</button>
                  </div>
                </section>

                <section className="setup-card setup-card-wide">
                  <h3>Downloads</h3>
                  <div className="artifact-buttons">
                    <button type="button" onClick={downloadCode}><Download size={16} /> Code ZIP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadGltf)}><Download size={16} /> CAD GLB</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadStep)}><Download size={16} /> CAD STEP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.buildGuideHtml)}><Download size={16} /> Build guide</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.projectJson)}><Download size={16} /> Project JSON</button>
                  </div>
                </section>
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
                    onClick={() => setSelectedConcept(index)}
                  >
                    <span>{concept.difficulty}</span>
                    <strong>{concept.name}</strong>
                    <p>{concept.fit}</p>
                    <em>${concept.cost.toLocaleString()} · {concept.buildTime}</em>
                  </button>
                ))}
              </div>
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
              <p>Blueprint generates a parametric CAD layout first, then exposes downloadable GLB-style and STEP-style artifacts for review.</p>
              <div className="artifact-buttons">
                <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadGltf)}><Download size={16} /> Download GLB</button>
                <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadStep)}><Download size={16} /> Download STEP</button>
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
                <span>{defaultBlueprintQuestion}</span>
                <button type="button" onClick={askBlueprint}><Send size={16} /> Ask</button>
              </div>
              {chatAnswer && <p className="workspace-answer">{chatAnswer}</p>}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
