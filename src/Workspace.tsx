import {
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  Download,
  FileText,
  FlaskConical,
  Gauge,
  Layers3,
  MessageSquareText,
  PackageCheck,
  RefreshCw,
  Repeat2,
  Save,
  Send,
  Sparkles,
  TrashIcon,
  Upload,
  X,
} from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import { artifactUrl, type BomUpdatePatch, type ChatAskResult } from './api'
import { codeSample } from './projectData'
import {
  workspaceTabs,
  type AiStatus,
  type BomItem,
  type BuildGuideStep,
  type ProjectData,
  type Substitution,
  type Team,
  type WorkspaceTab,
} from './types'
import { LiquidLogoMark, ShaderBackdrop } from './VisualEffects'

type WorkspaceProps = {
  project: ProjectData
  selectedConcept: number
  setSelectedConcept: (index: number) => void
  total: number
  activeTab: WorkspaceTab
  setActiveTab: (tab: WorkspaceTab) => void
  status: string
  chatAnswer: ChatAskResult | null
  setChatAnswer: (answer: ChatAskResult | null) => void
  aiStatus: AiStatus | null
  activeProjectId: string | null
  openLanding: () => void
  openWizard: () => void
  regenerateProject: () => void
  saveIntake: (team: Team) => void
  generateFullBlueprint: (team?: Team) => void
  uploadManual: (file: File) => void
  uploadInventoryFile: (file: File) => void
  uploadDriverLogs: (file: File) => void
  syncCatalog: () => void
  askBlueprint: (question?: string) => Promise<ChatAskResult | null>
  downloadCode: () => void
  updateBom: (updates: BomUpdatePatch[]) => Promise<void> | void
  addSubstitution: (substitution: Substitution) => Promise<void> | void
  removeSubstitution: (sku: string) => Promise<void> | void
  appendNotes: (text: string) => Promise<void> | void
  resetProject: () => void
}

type UploadState = {
  active: boolean
  fileName?: string
  message?: string
  error?: string
}

const RULE_KEYWORD_REGEX = /(?:\b|^)(rule|legal|legality|allowed|illegal|legality|inspection|inspector|penalty|penalties|construction\s+rule|robot\s+construction|gracious\s+professional|extension|expansion|control\s+system|battery|tether|q\s*&\s*a|q&a|update|prohibited|disallow)/i

const PROMPT_QUICK_ASKS: string[] = [
  'Can we make the selected robot cheaper without losing reliable autonomous?',
  'Is our intake legal under the current manual?',
  'What gear ratio should we use for the drivetrain?',
  'Write a sponsor email asking a local company for $500.',
]

function formatCurrency(value: number | undefined | null) {
  if (value === undefined || value === null || Number.isNaN(value)) return '$0'
  return `$${Math.round(value).toLocaleString()}`
}

function effectivePrice(item: BomItem) {
  if (item.priceOverride !== undefined && item.priceOverride !== null) {
    return Number(item.priceOverride)
  }
  return Number(item.price)
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
  setChatAnswer,
  aiStatus,
  activeProjectId,
  openLanding,
  openWizard,
  regenerateProject,
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
}: WorkspaceProps) {
  const selected = project.concepts[selectedConcept] ?? project.concepts[0]
  const buildGuideRows: BuildGuideStep[] = project.buildGuide?.length
    ? project.buildGuide
    : project.buildSteps.map((step) => ({ phase: 'Build', instructions: step }))

  const [teamDraft, setTeamDraft] = useState<Team>(project.team)
  const [trackedTeam, setTrackedTeam] = useState<Team>(project.team)
  const [intakeSaving, setIntakeSaving] = useState(false)
  const [intakeFeedback, setIntakeFeedback] = useState<string | null>(null)
  const [bomDraft, setBomDraft] = useState<BomItem[]>(project.bom)
  const [trackedBom, setTrackedBom] = useState<BomItem[]>(project.bom)
  const [bomFeedback, setBomFeedback] = useState<string | null>(null)
  const [bomSavingSku, setBomSavingSku] = useState<string | null>(null)
  const [substitutionDraft, setSubstitutionDraft] = useState<{ sku: string; replacement: string; note: string }>({
    sku: '',
    replacement: '',
    note: '',
  })
  const [substitutionFeedback, setSubstitutionFeedback] = useState<string | null>(null)
  const [chatMessage, setChatMessage] = useState(PROMPT_QUICK_ASKS[0])
  const [chatBusy, setChatBusy] = useState(false)
  const [chatRefusal, setChatRefusal] = useState<string | null>(null)
  const [applyFeedback, setApplyFeedback] = useState<string | null>(null)
  const [manualUpload, setManualUpload] = useState<UploadState>({ active: false })
  const [inventoryUpload, setInventoryUpload] = useState<UploadState>({ active: false })
  const [driverUpload, setDriverUpload] = useState<UploadState>({ active: false })
  const [trackedProjectId, setTrackedProjectId] = useState<string | null | undefined>(project.id)

  if (trackedTeam !== project.team) {
    setTrackedTeam(project.team)
    setTeamDraft(project.team)
  }

  if (trackedBom !== project.bom) {
    setTrackedBom(project.bom)
    setBomDraft(project.bom)
  }

  if (trackedProjectId !== project.id) {
    setTrackedProjectId(project.id)
    setIntakeFeedback(null)
    setBomFeedback(null)
    setSubstitutionFeedback(null)
    setApplyFeedback(null)
    setChatRefusal(null)
  }

  const bomSubtotal = useMemo(
    () => bomDraft.reduce((sum, item) => sum + item.qty * effectivePrice(item), 0),
    [bomDraft],
  )

  const refusalActive = project.season?.isSample === true

  const updateTeamField = <K extends keyof Team>(field: K, value: Team[K]) => {
    setIntakeFeedback(null)
    setTeamDraft((current) => ({ ...current, [field]: value }))
  }

  const updateTeamList = (field: keyof Team, value: string) => {
    setIntakeFeedback(null)
    setTeamDraft((current) => ({
      ...current,
      [field]: value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean),
    }))
  }

  const handleSaveIntake = async () => {
    setIntakeSaving(true)
    setIntakeFeedback('Saving…')
    try {
      await saveIntake(teamDraft)
      setIntakeFeedback('Saved')
    } finally {
      setIntakeSaving(false)
      setTimeout(() => setIntakeFeedback(null), 3000)
    }
  }

  const handleManualUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setManualUpload({ active: true, fileName: file.name, message: 'Uploading…' })
    Promise.resolve(uploadManual(file))
      .then(() => setManualUpload({ active: false, fileName: file.name, message: 'Indexed' }))
      .catch(() => setManualUpload({ active: false, fileName: file.name, error: 'Upload failed' }))
  }

  const handleInventoryUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setInventoryUpload({ active: true, fileName: file.name, message: 'Parsing…' })
    Promise.resolve(uploadInventoryFile(file))
      .then(() => setInventoryUpload({ active: false, fileName: file.name, message: 'Inventory merged' }))
      .catch(() => setInventoryUpload({ active: false, fileName: file.name, error: 'Upload failed' }))
  }

  const handleDriverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setDriverUpload({ active: true, fileName: file.name, message: 'Analyzing…' })
    Promise.resolve(uploadDriverLogs(file))
      .then(() => setDriverUpload({ active: false, fileName: file.name, message: 'Analysis ready' }))
      .catch(() => setDriverUpload({ active: false, fileName: file.name, error: 'Analysis failed' }))
  }

  const handleBomRowChange = <K extends keyof BomItem>(sku: string, field: K, value: BomItem[K]) => {
    setBomFeedback(null)
    setBomDraft((current) =>
      current.map((row) => {
        if (row.sku !== sku) return row
        const next = { ...row, [field]: value }
        if (field === 'priceOverride') {
          const override = value as BomItem['priceOverride']
          if (override !== null && override !== undefined && !Number.isNaN(Number(override))) {
            next.price = Number(override)
          }
        }
        return next
      }),
    )
  }

  const handleBomSaveRow = async (item: BomItem) => {
    setBomSavingSku(item.sku)
    setBomFeedback('Saving…')
    try {
      const original = project.bom.find((row) => row.sku === item.sku)
      const patch: BomUpdatePatch = {
        sku: item.sku,
        qty: item.qty,
        priceOverride:
          item.priceOverride === null || item.priceOverride === undefined
            ? null
            : Number(item.priceOverride),
        owned: !!item.owned,
        note: item.note ?? '',
      }
      if (item.priceOverride === null || item.priceOverride === undefined) {
        if (original && original.price !== item.price) {
          patch.price = item.price
        }
      }
      await updateBom([patch])
      setBomFeedback(`Saved ${item.part}`)
    } catch {
      setBomFeedback('Save failed')
    } finally {
      setBomSavingSku(null)
      setTimeout(() => setBomFeedback(null), 3000)
    }
  }

  const handleAddSubstitution = async () => {
    if (!substitutionDraft.sku || !substitutionDraft.replacement.trim()) {
      setSubstitutionFeedback('Pick a part and enter a replacement.')
      return
    }
    const original = project.bom.find((row) => row.sku === substitutionDraft.sku)
    setSubstitutionFeedback('Saving substitution…')
    try {
      await addSubstitution({
        sku: substitutionDraft.sku,
        originalPart: original?.part,
        replacement: substitutionDraft.replacement.trim(),
        note: substitutionDraft.note.trim(),
      })
      setSubstitutionFeedback('Substitution saved')
      setSubstitutionDraft({ sku: '', replacement: '', note: '' })
    } catch {
      setSubstitutionFeedback('Save failed')
    }
  }

  const handlePromptSubstitution = (item: BomItem) => {
    const initial = (project.substitutions || []).find((entry) => entry.sku === item.sku)
    const replacement = window.prompt(
      `Swap "${item.part}" for which part?`,
      initial?.replacement || '',
    )
    if (replacement === null) return
    const trimmed = replacement.trim()
    if (!trimmed) return
    const note = window.prompt(`Why swap "${item.part}"? (optional)`, initial?.note || '')
    setSubstitutionFeedback('Saving substitution…')
    Promise.resolve(
      addSubstitution({
        sku: item.sku,
        originalPart: item.part,
        replacement: trimmed,
        note: note ? note.trim() : '',
      }),
    )
      .then(() => setSubstitutionFeedback(`Saved substitution for ${item.part}`))
      .catch(() => setSubstitutionFeedback('Save failed'))
  }

  const handleAsk = async (questionOverride?: string) => {
    const message = (questionOverride ?? chatMessage).trim()
    if (!message) return
    if (refusalActive && RULE_KEYWORD_REGEX.test(message)) {
      setChatRefusal(
        'Blueprint refuses to issue rule-sensitive answers without a real manual. Upload the current FTC season PDF on the Dashboard first.',
      )
      setChatAnswer(null)
      return
    }
    setChatRefusal(null)
    setChatBusy(true)
    setApplyFeedback(null)
    try {
      await askBlueprint(message)
    } finally {
      setChatBusy(false)
    }
  }

  const handleApplySuggestion = async () => {
    if (!chatAnswer?.answer) return
    setApplyFeedback('Saving to notes…')
    try {
      await appendNotes(`Q: ${chatMessage}\nA: ${chatAnswer.answer}`)
      setApplyFeedback('Saved to project notes')
    } catch {
      setApplyFeedback('Could not save note')
    }
  }

  const handleCopySuggestion = async () => {
    if (!chatAnswer?.answer) return
    try {
      await navigator.clipboard.writeText(chatAnswer.answer)
      setApplyFeedback('Copied to clipboard')
    } catch {
      setApplyFeedback('Clipboard unavailable')
    }
  }

  const openArtifact = (path?: string) => {
    window.open(artifactUrl(path), '_blank')
  }

  const seasonLabel = project.season?.isSample
    ? 'Sample season (no manual uploaded)'
    : project.season?.title || project.season?.seasonName || 'Season pending'

  const aiStatusLabel = aiStatus?.message || project.aiStatus?.message || 'Local fallback active'

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
        <div className="workspace-nav-actions">
          <button className="nav-action workspace-action" type="button" onClick={openWizard}>
            <Sparkles size={16} /> New project
          </button>
          <button className="nav-action workspace-action" type="button" onClick={regenerateProject}>
            <RefreshCw size={16} />
            Regenerate
          </button>
        </div>
      </nav>

      {!activeProjectId && (
        <div className="workspace-banner liquid-glass">
          <AlertTriangle size={18} />
          <div>
            <strong>You are viewing the sample workspace.</strong>
            <p>Run the project wizard to create a real Blueprint workspace that persists.</p>
          </div>
          <button type="button" onClick={openWizard}>Start wizard</button>
        </div>
      )}

      <section className="workspace-hero">
        <div>
          <p className="eyebrow">Project workspace</p>
          <h1>{project.team.name}</h1>
          <p>
            {seasonLabel} is connected to strategy, REV supply, physics checks, starter code, build steps,
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
            <strong>{aiStatusLabel}</strong>
          </div>
          <div>
            <span>Season source</span>
            <strong>{project.season?.isSample ? 'Sample DECODE' : project.season?.seasonName || 'Upload needed'}</strong>
          </div>
          <div>
            <span>Budget</span>
            <strong>{formatCurrency(project.team.budget)}</strong>
          </div>
          <div>
            <span>BOM subtotal</span>
            <strong>{formatCurrency(total)}</strong>
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
                  <p>Upload the official season manual, edit team requirements, and stream new sources into the workspace.</p>
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
                  <UploadProgress state={manualUpload} />
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
                      Location
                      <input value={teamDraft.location} onChange={(event) => updateTeamField('location', event.target.value)} />
                    </label>
                    <label>
                      Budget
                      <input type="number" min={0} value={teamDraft.budget} onChange={(event) => updateTeamField('budget', Number(event.target.value))} />
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
                      <input type="number" min={0} value={teamDraft.students} onChange={(event) => updateTeamField('students', Number(event.target.value))} />
                    </label>
                    <label>
                      Mentors
                      <input type="number" min={0} value={teamDraft.mentors} onChange={(event) => updateTeamField('mentors', Number(event.target.value))} />
                    </label>
                    <label>
                      Timeline (weeks)
                      <input type="number" min={1} value={teamDraft.timelineWeeks || 0} onChange={(event) => updateTeamField('timelineWeeks', Number(event.target.value))} />
                    </label>
                    <label>
                      Supplier
                      <input value={teamDraft.supplier} onChange={(event) => updateTeamField('supplier', event.target.value)} />
                    </label>
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
                    <label>
                      Strategy mode
                      <select value={teamDraft.strategyMode || 'hybrid'} onChange={(event) => updateTeamField('strategyMode', event.target.value)}>
                        <option value="ai">AI-generated</option>
                        <option value="team">Team-provided</option>
                        <option value="hybrid">Hybrid</option>
                      </select>
                    </label>
                    <label className="wide">
                      Build space limitations
                      <textarea value={teamDraft.buildSpace || ''} onChange={(event) => updateTeamField('buildSpace', event.target.value)} />
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
                      Tools
                      <textarea value={(teamDraft.tools || []).join(', ')} onChange={(event) => updateTeamList('tools', event.target.value)} />
                    </label>
                    <label className="wide">
                      Inventory
                      <textarea value={(teamDraft.inventory || []).join(', ')} onChange={(event) => updateTeamList('inventory', event.target.value)} />
                    </label>
                    <label className="wide">
                      Priorities
                      <textarea value={(teamDraft.priorities || []).join(', ')} onChange={(event) => updateTeamList('priorities', event.target.value)} />
                    </label>
                    <label className="wide">
                      Project notes
                      <textarea
                        rows={4}
                        value={teamDraft.notes || ''}
                        onChange={(event) => updateTeamField('notes', event.target.value)}
                        placeholder="Mentor checklists, captain notes, applied chat suggestions, etc."
                      />
                    </label>
                  </div>
                  <div className="setup-actions">
                    <button type="button" onClick={handleSaveIntake} disabled={intakeSaving}>
                      <Save size={16} /> {intakeSaving ? 'Saving…' : 'Save intake'}
                    </button>
                    <button type="button" onClick={() => generateFullBlueprint(teamDraft)}>
                      <Sparkles size={16} /> Generate blueprint
                    </button>
                    {intakeFeedback && (
                      <span className={`setup-feedback ${intakeFeedback === 'Saved' ? 'is-success' : ''}`}>
                        {intakeFeedback === 'Saved' && <CheckCircle2 size={14} />}
                        {intakeFeedback}
                      </span>
                    )}
                  </div>
                </section>

                <section className="setup-card">
                  <h3><PackageCheck size={18} /> Team inventory upload</h3>
                  <p>Drop a CSV or JSON list of parts already on the shelf. Blueprint merges them into your inventory and uses them to flag already-owned BOM rows.</p>
                  <label className="file-upload">
                    <Upload size={18} />
                    Upload inventory CSV/JSON
                    <input type="file" accept=".csv,.json,text/csv,application/json,.pdf" onChange={handleInventoryUpload} />
                  </label>
                  <UploadProgress state={inventoryUpload} />
                  <small>{(project.team.inventory || []).length} inventory items currently tracked.</small>
                </section>

                <section className="setup-card">
                  <h3><Gauge size={18} /> Driver-control logs</h3>
                  <p>Upload a CSV/JSON capture of gamepad events. Blueprint suggests macros, slow-mode mapping, and ownership splits.</p>
                  <label className="file-upload">
                    <Upload size={18} />
                    Upload driver log
                    <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleDriverUpload} />
                  </label>
                  <UploadProgress state={driverUpload} />
                  {project.driverInsight && <small>{project.driverInsight}</small>}
                </section>

                <section className="setup-card setup-card-wide">
                  <h3>Downloads + utilities</h3>
                  <div className="artifact-buttons">
                    <button type="button" onClick={downloadCode}><Download size={16} /> Code ZIP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadGltf)}><Download size={16} /> CAD GLB</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.cadStep)}><Download size={16} /> CAD STEP</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.buildGuideHtml)}><Download size={16} /> Build guide</button>
                    <button type="button" onClick={() => openArtifact(project.artifactUrls?.projectJson)}><Download size={16} /> Project JSON</button>
                    {activeProjectId && (
                      <button type="button" onClick={resetProject} title="Stop using this project and return to landing">
                        <X size={16} /> Exit project
                      </button>
                    )}
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
                    <em>{formatCurrency(concept.cost)} · {concept.buildTime}</em>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'BOM' && (
            <div className="workspace-panel">
              <div className="workspace-panel-title">
                <div>
                  <h2>Bill of materials</h2>
                  <p>Edit qty, override price, mark already-owned items, and propose substitutions.</p>
                </div>
                <strong>{formatCurrency(bomSubtotal)}</strong>
              </div>

              {bomDraft.length === 0 ? (
                <p>No BOM yet. Generate a blueprint from the Dashboard to populate REV parts.</p>
              ) : (
                <div className="bom-editor">
                  {bomDraft.map((item) => {
                    const original = project.bom.find((row) => row.sku === item.sku)
                    const hasChanges =
                      !original ||
                      original.qty !== item.qty ||
                      original.price !== item.price ||
                      (original.priceOverride ?? null) !== (item.priceOverride ?? null) ||
                      !!original.owned !== !!item.owned ||
                      (original.note || '') !== (item.note || '')
                    return (
                      <article className="bom-editor-row" key={item.sku}>
                        <div className="bom-editor-head">
                          <div>
                            <span>{item.subsystem}</span>
                            <strong>{item.part}</strong>
                            <small>{item.sku} · {item.stock || 'Availability not checked'}</small>
                          </div>
                          <em>{formatCurrency(effectivePrice(item) * item.qty)}</em>
                        </div>
                        <div className="bom-editor-fields">
                          <label>
                            Qty
                            <input
                              type="number"
                              min={0}
                              value={item.qty}
                              onChange={(event) =>
                                handleBomRowChange(item.sku, 'qty', Math.max(0, Math.floor(Number(event.target.value))))
                              }
                            />
                          </label>
                          <label>
                            Price ($)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.price}
                              onChange={(event) =>
                                handleBomRowChange(item.sku, 'price', Math.max(0, Number(event.target.value)))
                              }
                            />
                          </label>
                          <label>
                            Price override ($)
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.priceOverride ?? ''}
                              placeholder="—"
                              onChange={(event) => {
                                const raw = event.target.value
                                handleBomRowChange(
                                  item.sku,
                                  'priceOverride',
                                  raw === '' ? null : Math.max(0, Number(raw)),
                                )
                              }}
                            />
                          </label>
                          <label className="bom-checkbox">
                            <input
                              type="checkbox"
                              checked={!!item.owned}
                              onChange={(event) => handleBomRowChange(item.sku, 'owned', event.target.checked)}
                            />
                            Already owned
                          </label>
                          <label className="wide">
                            Notes
                            <input
                              type="text"
                              value={item.note || ''}
                              placeholder="Spare available, ordered, swap planned…"
                              onChange={(event) => handleBomRowChange(item.sku, 'note', event.target.value)}
                            />
                          </label>
                        </div>
                        <div className="bom-editor-actions">
                          <button
                            type="button"
                            className="bom-save"
                            onClick={() => handleBomSaveRow(item)}
                            disabled={bomSavingSku === item.sku || !hasChanges}
                          >
                            <Save size={14} /> {bomSavingSku === item.sku ? 'Saving…' : hasChanges ? 'Save row' : 'Saved'}
                          </button>
                          <button type="button" className="bom-secondary" onClick={() => handlePromptSubstitution(item)}>
                            <Repeat2 size={14} /> Substitute
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}

              {bomFeedback && <p className="bom-feedback">{bomFeedback}</p>}

              <section className="substitutions-section">
                <header>
                  <FlaskConical size={18} />
                  <div>
                    <h3>Substitutions</h3>
                    <p>Swap a part out without losing context. Substitutions persist on the project and inform the Parts Agent.</p>
                  </div>
                </header>
                <div className="substitution-form">
                  <label>
                    Original part
                    <select
                      value={substitutionDraft.sku}
                      onChange={(event) => setSubstitutionDraft((current) => ({ ...current, sku: event.target.value }))}
                    >
                      <option value="">Select a BOM row…</option>
                      {bomDraft.map((item) => (
                        <option key={item.sku} value={item.sku}>
                          {item.part} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Replacement part
                    <input
                      value={substitutionDraft.replacement}
                      onChange={(event) =>
                        setSubstitutionDraft((current) => ({ ...current, replacement: event.target.value }))
                      }
                      placeholder="goBILDA 5202-0002-0019 Yellow Jacket"
                    />
                  </label>
                  <label className="wide">
                    Why?
                    <input
                      value={substitutionDraft.note}
                      onChange={(event) =>
                        setSubstitutionDraft((current) => ({ ...current, note: event.target.value }))
                      }
                      placeholder="Reason for swap (cost, availability, torque, etc.)"
                    />
                  </label>
                  <div className="substitution-actions">
                    <button type="button" onClick={handleAddSubstitution}>
                      <Repeat2 size={14} /> Save substitution
                    </button>
                    {substitutionFeedback && <span>{substitutionFeedback}</span>}
                  </div>
                </div>

                <div className="substitution-list">
                  {(project.substitutions || []).length === 0 ? (
                    <p className="substitution-empty">No substitutions yet. Use the form above or the “Substitute” button on a row.</p>
                  ) : (
                    (project.substitutions || []).map((entry) => {
                      const original = project.bom.find((row) => row.sku === entry.sku)
                      return (
                        <article key={entry.sku} className="substitution-entry">
                          <div>
                            <strong>{original?.part || entry.originalPart || entry.sku}</strong>
                            <small>{entry.sku}</small>
                          </div>
                          <span>→</span>
                          <div>
                            <strong>{entry.replacement}</strong>
                            {entry.note && <small>{entry.note}</small>}
                          </div>
                          <button type="button" className="substitution-remove" onClick={() => removeSubstitution(entry.sku)} aria-label="Remove substitution">
                            <TrashIcon size={14} />
                          </button>
                        </article>
                      )
                    })
                  )}
                </div>
              </section>
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

              {refusalActive && (
                <div className="chat-refusal liquid-glass">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>No verified manual loaded.</strong>
                    <p>
                      Blueprint refuses rule-sensitive answers while the active season is the sample DECODE
                      placeholder. Upload the current FTC season PDF on the Dashboard before asking legality
                      questions.
                    </p>
                  </div>
                  <button type="button" onClick={() => setActiveTab('Dashboard')}>
                    <Upload size={14} /> Upload manual
                  </button>
                </div>
              )}

              <div className="chat-prompt-list">
                {PROMPT_QUICK_ASKS.map((prompt) => (
                  <button
                    type="button"
                    key={prompt}
                    className={chatMessage === prompt ? 'is-active' : ''}
                    onClick={() => setChatMessage(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="workspace-chat-row">
                <input
                  value={chatMessage}
                  onChange={(event) => setChatMessage(event.target.value)}
                  placeholder="Ask about strategy, legality, torque, code, grants, driver controls…"
                />
                <button type="button" onClick={() => handleAsk()} disabled={chatBusy}>
                  <Send size={16} /> {chatBusy ? 'Thinking…' : 'Ask'}
                </button>
              </div>

              {chatRefusal && (
                <div className="chat-refusal chat-refusal-inline">
                  <AlertTriangle size={16} />
                  <span>{chatRefusal}</span>
                </div>
              )}

              {chatAnswer && (
                <div className="workspace-answer-card">
                  <p className="workspace-answer">{chatAnswer.answer}</p>
                  {chatAnswer.citations.length > 0 && (
                    <ul className="chat-citations">
                      {chatAnswer.citations.map((citation, index) => (
                        <li key={`${citation.ruleNumber || 'citation'}-${index}`}>
                          <strong>{citation.ruleNumber || 'Citation'}</strong>
                          <span>{citation.explanation}</span>
                          {citation.sourceDocument && <small>{citation.sourceDocument}</small>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="chat-apply-row">
                    <button type="button" className="chat-apply" onClick={handleApplySuggestion}>
                      <Sparkles size={14} /> Apply suggestion to project notes
                    </button>
                    <button type="button" className="chat-secondary" onClick={handleCopySuggestion}>
                      <Clipboard size={14} /> Copy answer
                    </button>
                    {applyFeedback && <span className="chat-feedback">{applyFeedback}</span>}
                  </div>
                </div>
              )}

              {project.team.notes && (
                <section className="notes-summary">
                  <header>
                    <Layers3 size={16} />
                    <strong>Project notes ({project.team.notes.split('\n').filter(Boolean).length} lines)</strong>
                  </header>
                  <pre>{project.team.notes}</pre>
                </section>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}

function UploadProgress({ state }: { state: UploadState }) {
  if (!state.active && !state.message && !state.error) return null
  if (state.active) {
    return (
      <div className="upload-progress is-active">
        <span className="upload-spinner" aria-hidden="true" />
        <span>{state.message || 'Uploading'} {state.fileName}</span>
      </div>
    )
  }
  if (state.error) {
    return (
      <div className="upload-progress is-error">
        <AlertTriangle size={14} />
        <span>{state.error} {state.fileName ? `(${state.fileName})` : ''}</span>
      </div>
    )
  }
  return (
    <div className="upload-progress is-success">
      <CheckCircle2 size={14} />
      <span>{state.message} {state.fileName ? `(${state.fileName})` : ''}</span>
    </div>
  )
}
