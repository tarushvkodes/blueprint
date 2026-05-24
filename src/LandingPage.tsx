import {
  Boxes,
  CheckCircle2,
  ChevronRight,
  Code2,
  Cpu,
  Gauge,
  Layers3,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { useRef } from 'react'
import { useLandingAnimations } from './hooks/useLandingAnimations'
import { RobotPreview } from './RobotPreview'
import { LiquidLogoMark, ShaderBackdrop } from './VisualEffects'
import {
  agentRows,
  defaultBlueprintQuestion,
  getAccordionPanels,
  manifesto,
  navItems,
  platformModules,
  profilePriorities,
} from './projectData'
import type { Concept, ProjectData, WorkspaceTab } from './types'

type LandingPageProps = {
  project: ProjectData
  selected: Concept
  selectedConcept: number
  setSelectedConcept: (index: number) => void
  total: number
  activeAccordion: number
  setActiveAccordion: (index: number) => void
  openWorkspace: (tab?: WorkspaceTab) => void
  startDemo: () => void
  demoRunning?: boolean
}

function physicsVisualClass(mechanism: string) {
  const text = mechanism.toLowerCase()
  if (/battery|current/.test(text)) return 'physics-visual-power'
  if (/tip|gravity|center/.test(text)) return 'physics-visual-balance'
  if (/intake|roller/.test(text)) return 'physics-visual-intake'
  if (/arm/.test(text)) return 'physics-visual-arm'
  if (/lift/.test(text)) return 'physics-visual-lift'
  if (/torque/.test(text)) return 'physics-visual-torque'
  return 'physics-visual-speed'
}

export function LandingPage({
  project,
  selected,
  selectedConcept,
  setSelectedConcept,
  total,
  activeAccordion,
  setActiveAccordion,
  openWorkspace,
  startDemo,
  demoRunning = false,
}: LandingPageProps) {
  const manifestoRef = useRef<HTMLParagraphElement>(null)
  const pinnedRef = useRef<HTMLElement>(null)

  useLandingAnimations({ manifestoRef, pinnedRef, refreshKey: project })
  const generatedCodeEntries = Object.entries(project.code || {})
  const landingCode = generatedCodeEntries.find(([fileName]) => /TeleOpMain\.java$/i.test(fileName))?.[1]
    || generatedCodeEntries[0]?.[1]
    || 'Generate a project to load FTC SDK starter code.'

  return (
    <main className="app-shell overflow-x-hidden w-full max-w-full">
      <ShaderBackdrop />
      <nav className="nav-shell liquid-glass">
        <button className="brand" type="button" onClick={() => openWorkspace('Dashboard')} aria-label="Blueprint workspace">
          <span className="brand-mark">
            <LiquidLogoMark size={34} />
          </span>
          Blueprint
        </button>
        <div className="nav-links" aria-label="Primary navigation">
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => openWorkspace(item === 'CAD' ? 'Design' : (item as WorkspaceTab))}
            >
              {item}
            </button>
          ))}
        </div>
        <button className="nav-action" type="button" onClick={() => openWorkspace('Dashboard')}>
          Open workspace
        </button>
      </nav>

      <section className="hero-section" id="top">
        <div className="hero-wash" />
        <div className="hero-copy">
          <p className="eyebrow">AI engineering co-pilot for FTC teams</p>
          <h1>
            Build the robot plan before kickoff eats your calendar.
          </h1>
          <p className="hero-lede">
            A complete project workspace for strategy, rules citations, REV BOMs, physics-backed mechanisms,
            starter CAD, FTC Java code, build instructions, grants, and driver optimization.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" type="button" onClick={startDemo} disabled={demoRunning}>
              {demoRunning ? 'Building demo' : 'Demo'} <WandSparkles size={18} />
            </button>
            <button className="button button-primary" type="button" onClick={() => openWorkspace('Dashboard')}>
              Generate project <ChevronRight size={18} />
            </button>
            <button className="button button-secondary" type="button" onClick={() => openWorkspace('Physics')}>
              Inspect the math
            </button>
          </div>
          <div className="hero-system-strip liquid-glass" aria-label="Blueprint system summary">
            <span>
              <strong>{project.concepts.length}</strong>
              concepts
            </span>
            <span>
              <strong>${total.toLocaleString()}</strong>
              selected BOM
            </span>
            <span>
              <strong>{project.team.timelineWeeks}</strong>
              week build lane
            </span>
          </div>
        </div>
        <div className="hero-visual image-scale">
          <div className="workspace-card liquid-glass">
            <div className="workspace-topline">
              <span>{project.team.manual}</span>
              <ShieldCheck size={18} />
            </div>
            <div className="robot-stage">
              <RobotPreview />
            </div>
            <div className="hero-hud-grid" aria-label="Selected robot concept">
              <span>
                <small>Active concept</small>
                <strong>{selected.difficulty}</strong>
              </span>
              <span>
                <small>Build time</small>
                <strong>{selected.buildTime}</strong>
              </span>
            </div>
            <div className="workspace-footer">
              <span>{selected.name}</span>
              <strong>${selected.cost.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="onboarding-section" id="strategy">
        <div className="section-heading">
          <h2>One team profile becomes a full engineering packet.</h2>
          <p>
            Beginner, intermediate, and advanced modes share the same backbone: constraints in, cited outputs out.
          </p>
        </div>
        <div className="profile-grid">
          <div className="profile-panel liquid-glass">
            <h3>{project.team.name}</h3>
            <dl>
              <div>
                <dt>Budget</dt>
                <dd>${project.team.budget.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Supplier</dt>
                <dd>{project.team.supplier}</dd>
              </div>
              <div>
                <dt>Skill level</dt>
                <dd>{project.team.experience}</dd>
              </div>
              <div>
                <dt>Students</dt>
                <dd>{project.team.students}</dd>
              </div>
            </dl>
          </div>
          <div className="priority-panel liquid-glass">
            {profilePriorities.map((priority) => (
              <span key={priority}>
                <CheckCircle2 size={16} />
                {priority}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="bento-section">
        <div className="feature-grid">
          {platformModules.map((module) => {
            const Icon = module.icon
            return (
              <article className={`feature-card liquid-glass group ${module.span}`} key={module.title}>
                <div className="feature-card-bg" />
                <div className="feature-icon">
                  <Icon size={24} />
                </div>
                <h3>{module.title}</h3>
                <p>{module.copy}</p>
              </article>
            )
          })}
        </div>
      </section>

      <section className="concept-section" id="design">
        <div className="section-heading wide">
          <h2>Three concepts, then a merge path.</h2>
          <p>
            The MVP does not stop at a tiny demo. It generates strategy fit, architecture, cost, risks, tools,
            upgrade path, and rule concerns for each build direction.
          </p>
        </div>
        <div className="concept-grid">
          {project.concepts.map((concept, index) => (
            <button
              className={`concept-card liquid-glass group ${selectedConcept === index ? 'is-selected' : ''}`}
              key={concept.name}
              onClick={() => setSelectedConcept(index)}
              type="button"
            >
              <span>{concept.difficulty}</span>
              <h3>{concept.name}</h3>
              <p>{concept.fit}</p>
              <div className="concept-meta">
                <strong>${concept.cost.toLocaleString()}</strong>
                <small>{concept.buildTime}</small>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="rules-section" id="bom">
        <div className="split-heading">
          <h2>Rules, budget, and supply move together.</h2>
          <p>
            Every legality-sensitive answer should carry a source, date, rule context, confidence, and a refusal to
            invent certainty.
          </p>
        </div>
        <div className="data-panels">
          <article className="rules-panel liquid-glass">
            <h3><ShieldCheck size={20} /> Legal checklist</h3>
            {project.rules.map((rule, index) => (
              <div className="rule-row" key={`${rule.rule}-${rule.section}-${index}`}>
                <strong>{rule.rule}</strong>
                <span>{rule.section}</span>
                <p>{rule.note}</p>
                <small>{rule.status} confidence: {rule.confidence}</small>
              </div>
            ))}
          </article>
          <article className="bom-panel liquid-glass">
            <div className="panel-title-row">
              <h3><Boxes size={20} /> Bill of materials</h3>
              <strong>${total.toLocaleString()}</strong>
            </div>
            <div className="bom-table">
              {project.bom.map((item, index) => (
                <div className="bom-row" key={`${item.sku}-${index}`}>
                  <span>{item.subsystem}</span>
                  <strong>{item.part}</strong>
                  <small>{item.sku}</small>
                  <em>{item.qty} x ${item.price}</em>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="physics-section" id="physics">
        <div className="section-heading">
          <h2>Show the proof, not just the part.</h2>
          <p>
            Torque, RPM, gearing, stall margin, current draw, lift load, center of gravity, and driver speed limits
            become readable student-facing calculations.
          </p>
        </div>
        <div className="physics-grid">
          {project.physics.map((item) => (
            <article className="physics-card liquid-glass group" key={item.mechanism}>
              <div className={`physics-card-media image-scale ${physicsVisualClass(item.mechanism)}`}>
                <i />
                <b />
              </div>
              <div>
                <span>{item.margin}</span>
                <h3>{item.mechanism}</h3>
                <code>{item.formula}</code>
                <p>{item.inputs}</p>
                <strong>{item.result}</strong>
                <small>{item.recommendation}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="pinned-section" ref={pinnedRef}>
        <div className="pinned-title">
          <h2>Agentic workflow with review gates.</h2>
          <p>
            Specialized agents pass structured outputs forward, then a review agent hunts contradictions before the
            team sees the plan.
          </p>
        </div>
        <div className="agent-stack">
          {agentRows.map((row, index) => (
            <article className="agent-card liquid-glass image-scale" key={row}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{row}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="cad-code-section" id="cad">
        <div className="cad-panel liquid-glass image-scale">
          <RobotPreview />
          <div className="cad-overlay">
            <Layers3 size={20} />
            <span>Conceptual CAD starter: top, side, isometric, wiring, and exploded views.</span>
          </div>
        </div>
        <div className="code-panel liquid-glass" id="code">
          <div className="panel-title-row">
            <h2>FTC SDK Java starter code</h2>
            <Cpu size={22} />
          </div>
          <pre><code>{landingCode}</code></pre>
          <div className="file-row">
            {project.codeFiles.map((file) => (
              <span key={file}>{file}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="build-section" id="build">
        <div className="section-heading wide">
          <h2>
            Build guide with checkpoints and test-before-continuing moments.
          </h2>
        </div>
        <div className="timeline">
          {project.buildSteps.map((step, index) => (
            <article key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="accordion-section">
        <div className="horizontal-accordion">
          {getAccordionPanels(project).map((item, index) => {
            const Icon = item.icon
            return (
              <button
                className={`accordion-slice ${activeAccordion === index ? 'open' : ''}`}
                type="button"
                key={item.title}
                onMouseEnter={() => setActiveAccordion(index)}
                onFocus={() => setActiveAccordion(index)}
              >
                <Icon size={24} />
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </button>
            )
          })}
        </div>
      </section>

      <section className="manifesto-section">
        <p ref={manifestoRef}>
          {manifesto.split(' ').map((word, index) => (
            <span key={`${word}-${index}`}>{word} </span>
          ))}
        </p>
      </section>

      <section className="chat-section" id="chat">
          <div className="chat-card liquid-glass">
          <MessageSquareText size={28} />
          <h2>Project-aware chatbot for iteration.</h2>
          <p>
            Ask why the lift stalls, make the BOM cheaper, regenerate a safer autonomous, rewrite sponsor emails, or
            turn driver logs into a better controller map.
          </p>
          <div className="prompt-bar">
            <span>{defaultBlueprintQuestion}</span>
            <button type="button" onClick={() => openWorkspace('Chat')}>Ask</button>
          </div>
        </div>
      </section>

      <div className="marquee" aria-hidden="true">
        <div>
          <span>Rules RAG</span>
          <Gauge />
          <span>REV BOM</span>
          <Sparkles />
          <span>CAD Starter</span>
          <Code2 />
          <span>FTC Java</span>
          <ShieldCheck />
        </div>
        <div>
          <span>Rules RAG</span>
          <Gauge />
          <span>REV BOM</span>
          <Sparkles />
          <span>CAD Starter</span>
          <Code2 />
          <span>FTC Java</span>
          <ShieldCheck />
        </div>
      </div>

      <footer className="footer-cta">
        <h2>Turn kickoff chaos into a cited, budgeted, buildable first plan.</h2>
        <button className="button button-primary" type="button" onClick={() => openWorkspace('Dashboard')}>
          Start the workspace
        </button>
      </footer>
    </main>
  )
}
