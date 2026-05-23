import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { LiquidLogoMark, ShaderBackdrop } from './VisualEffects'
import type { Team } from './types'

const ROBOT_PRIORITY_OPTIONS = [
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

const TOOL_OPTIONS = [
  'Hand tools',
  '3D printer',
  'Drill press',
  'Bandsaw',
  'CNC router',
  'Soldering iron',
  'Multimeter',
  'Oscilloscope',
  'Vinyl cutter',
]

const SKILL_OPTIONS = ['Beginner', 'Intermediate', 'Advanced'] as const

const STRATEGY_MODES = [
  { id: 'ai', label: 'AI-generated', description: 'Blueprint proposes strategy from the manual + your constraints.' },
  { id: 'team', label: 'Team-provided', description: 'You drive the strategy; Blueprint follows your goals and notes.' },
  { id: 'hybrid', label: 'Hybrid', description: 'Blueprint suggests; the team edits before generating the rest.' },
]

type WizardProps = {
  initialTeam?: Partial<Team>
  isSubmitting?: boolean
  onCancel: () => void
  onComplete: (team: Team) => Promise<void> | void
}

type WizardStepId =
  | 'identity'
  | 'team'
  | 'workspace'
  | 'inventory'
  | 'strategy'
  | 'review'

type WizardStep = {
  id: WizardStepId
  title: string
  caption: string
}

const STEPS: WizardStep[] = [
  { id: 'identity', title: 'Team identity', caption: 'Who is this project for?' },
  { id: 'team', title: 'Team capacity', caption: 'Students, mentors, and skill bands.' },
  { id: 'workspace', title: 'Workspace + tools', caption: 'Where you build and what you have.' },
  { id: 'inventory', title: 'Inventory + budget', caption: 'Parts you own and the budget ceiling.' },
  { id: 'strategy', title: 'Timeline + priorities', caption: 'Timeline, robot priorities, strategy mode.' },
  { id: 'review', title: 'Review + create', caption: 'Confirm and seed the workspace.' },
]

function buildDefaultTeam(initial: Partial<Team> | undefined): Team {
  return {
    name: initial?.name ?? '',
    number: initial?.number ?? '',
    location: initial?.location ?? '',
    experience: initial?.experience ?? 'Beginner',
    students: initial?.students ?? 8,
    mentors: initial?.mentors ?? 1,
    budget: initial?.budget ?? 1500,
    supplier: initial?.supplier ?? 'REV Robotics',
    manual: initial?.manual ?? 'Sample DECODE manual until a current season PDF is uploaded',
    tools: initial?.tools ?? ['Hand tools'],
    priorities: initial?.priorities ?? ['Reliable autonomous', 'Easy maintenance'],
    inventory: initial?.inventory ?? [],
    timelineWeeks: initial?.timelineWeeks ?? 6,
    goals: initial?.goals ?? '',
    constraints: initial?.constraints ?? '',
    strategyMode: initial?.strategyMode ?? 'hybrid',
    cadExperience: initial?.cadExperience ?? 'Beginner',
    programmingExperience: initial?.programmingExperience ?? 'Beginner',
    buildSpace: initial?.buildSpace ?? '',
    notes: initial?.notes ?? '',
  }
}

function parseList(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function Wizard({ initialTeam, onCancel, onComplete, isSubmitting }: WizardProps) {
  const [team, setTeam] = useState<Team>(() => buildDefaultTeam(initialTeam))
  const [stepIndex, setStepIndex] = useState(0)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const step = STEPS[stepIndex]

  const setField = <K extends keyof Team>(field: K, value: Team[K]) => {
    setTeam((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field as string]) return current
      const next = { ...current }
      delete next[field as string]
      return next
    })
  }

  const togglePriority = (priority: string) => {
    setField(
      'priorities',
      team.priorities?.includes(priority)
        ? team.priorities.filter((entry) => entry !== priority)
        : [...(team.priorities || []), priority],
    )
  }

  const toggleTool = (tool: string) => {
    setField(
      'tools',
      team.tools?.includes(tool)
        ? team.tools.filter((entry) => entry !== tool)
        : [...(team.tools || []), tool],
    )
  }

  const summaryRows = useMemo(
    () => [
      { label: 'Team', value: team.name || '—' },
      { label: 'Number', value: team.number || '—' },
      { label: 'Location', value: team.location || '—' },
      { label: 'Experience', value: team.experience },
      { label: 'Students', value: String(team.students) },
      { label: 'Mentors', value: String(team.mentors) },
      { label: 'Build space', value: team.buildSpace || '—' },
      { label: 'Tools', value: (team.tools || []).join(', ') || '—' },
      { label: 'CAD experience', value: team.cadExperience || '—' },
      { label: 'Programming experience', value: team.programmingExperience || '—' },
      { label: 'Inventory items', value: String((team.inventory || []).length) },
      { label: 'Budget', value: `$${(team.budget || 0).toLocaleString()}` },
      { label: 'Supplier', value: team.supplier || 'REV Robotics' },
      { label: 'Timeline', value: `${team.timelineWeeks || 0} weeks` },
      { label: 'Robot priorities', value: (team.priorities || []).join(', ') || '—' },
      {
        label: 'Strategy mode',
        value: STRATEGY_MODES.find((mode) => mode.id === team.strategyMode)?.label || 'Hybrid',
      },
    ],
    [team],
  )

  const validateStep = (): boolean => {
    const nextErrors: Record<string, string> = {}
    if (step.id === 'identity') {
      if (!team.name.trim()) nextErrors.name = 'Team name is required.'
      if (!team.number.trim()) nextErrors.number = 'Team number is required.'
      if (!team.location.trim()) nextErrors.location = 'Location helps grants + outreach.'
    }
    if (step.id === 'team') {
      if (!team.students || team.students < 1) nextErrors.students = 'Need at least one student.'
      if (team.mentors < 0) nextErrors.mentors = 'Mentor count cannot be negative.'
    }
    if (step.id === 'inventory') {
      if (!team.budget || team.budget < 1) nextErrors.budget = 'Add a budget (use 0 only if unknown).'
    }
    if (step.id === 'strategy') {
      if (!team.timelineWeeks || team.timelineWeeks < 1) nextErrors.timelineWeeks = 'Add competition timeline weeks.'
      if ((team.priorities || []).length === 0) nextErrors.priorities = 'Pick at least one robot priority.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const goNext = () => {
    if (!validateStep()) return
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1))
  }

  const goBack = () => setStepIndex((current) => Math.max(0, current - 1))

  const finish = async () => {
    if (!validateStep()) return
    setSubmitError(null)
    try {
      await onComplete(team)
    } catch {
      setSubmitError('We could not reach Blueprint. Try again in a moment.')
    }
  }

  return (
    <main className="app-shell wizard-screen">
      <ShaderBackdrop variant="workspace" />
      <header className="wizard-nav liquid-glass">
        <div className="wizard-nav-brand">
          <span className="brand-mark">
            <LiquidLogoMark size={34} />
          </span>
          <div>
            <p className="eyebrow">Project Wizard</p>
            <strong>Set up your Blueprint workspace</strong>
          </div>
        </div>
        <button type="button" className="wizard-close" onClick={onCancel} aria-label="Cancel wizard">
          <X size={16} />
          Cancel
        </button>
      </header>

      <section className="wizard-layout">
        <aside className="wizard-stepper liquid-glass">
          <ol>
            {STEPS.map((entry, index) => {
              const isActive = index === stepIndex
              const isComplete = index < stepIndex
              return (
                <li
                  key={entry.id}
                  className={`wizard-step ${isActive ? 'is-active' : ''} ${isComplete ? 'is-complete' : ''}`}
                >
                  <span className="wizard-step-index">{isComplete ? <CheckCircle2 size={16} /> : index + 1}</span>
                  <div>
                    <strong>{entry.title}</strong>
                    <small>{entry.caption}</small>
                  </div>
                </li>
              )
            })}
          </ol>
        </aside>

        <div className="wizard-form liquid-glass">
          <div className="wizard-form-header">
            <p className="eyebrow">Step {stepIndex + 1} of {STEPS.length}</p>
            <h1>{step.title}</h1>
            <p>{step.caption}</p>
          </div>

          {step.id === 'identity' && (
            <div className="wizard-fields">
              <label>
                Team name
                <input value={team.name} onChange={(event) => setField('name', event.target.value)} placeholder="Metal Magic FTC" />
                {errors.name && <em className="wizard-error">{errors.name}</em>}
              </label>
              <label>
                Team number
                <input
                  value={team.number}
                  onChange={(event) => setField('number', event.target.value)}
                  placeholder="12345"
                />
                {errors.number && <em className="wizard-error">{errors.number}</em>}
              </label>
              <label>
                Location
                <input
                  value={team.location}
                  onChange={(event) => setField('location', event.target.value)}
                  placeholder="City, State / Region"
                />
                {errors.location && <em className="wizard-error">{errors.location}</em>}
              </label>
              <label>
                Experience level
                <select
                  value={team.experience}
                  onChange={(event) => setField('experience', event.target.value)}
                >
                  {SKILL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step.id === 'team' && (
            <div className="wizard-fields">
              <label>
                Number of students
                <input
                  type="number"
                  min={1}
                  value={team.students}
                  onChange={(event) => setField('students', Number(event.target.value))}
                />
                {errors.students && <em className="wizard-error">{errors.students}</em>}
              </label>
              <label>
                Available mentors
                <input
                  type="number"
                  min={0}
                  value={team.mentors}
                  onChange={(event) => setField('mentors', Number(event.target.value))}
                />
                {errors.mentors && <em className="wizard-error">{errors.mentors}</em>}
              </label>
              <label>
                CAD experience
                <select
                  value={team.cadExperience}
                  onChange={(event) => setField('cadExperience', event.target.value)}
                >
                  {SKILL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Programming experience
                <select
                  value={team.programmingExperience}
                  onChange={(event) => setField('programmingExperience', event.target.value)}
                >
                  {SKILL_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step.id === 'workspace' && (
            <div className="wizard-fields">
              <label className="wide">
                Build space limitations
                <textarea
                  rows={3}
                  value={team.buildSpace}
                  onChange={(event) => setField('buildSpace', event.target.value)}
                  placeholder="e.g. classroom for 2 hours after school, no permanent shop, no welding."
                />
              </label>
              <div className="wide wizard-tag-group" role="group" aria-label="Tools available">
                <strong>Tools available</strong>
                <small>Select every tool the team can use this season.</small>
                <div className="wizard-tag-grid">
                  {TOOL_OPTIONS.map((tool) => {
                    const isOn = team.tools?.includes(tool)
                    return (
                      <button
                        type="button"
                        key={tool}
                        className={`wizard-tag ${isOn ? 'is-on' : ''}`}
                        onClick={() => toggleTool(tool)}
                      >
                        {tool}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step.id === 'inventory' && (
            <div className="wizard-fields">
              <label className="wide">
                Existing parts inventory
                <textarea
                  rows={3}
                  value={(team.inventory || []).join(', ')}
                  onChange={(event) => setField('inventory', parseList(event.target.value))}
                  placeholder="REV Starter Kit V3.1, Control Hub, HD Hex Motor"
                />
                <small>Comma- or newline-separated. CSV/JSON upload is available later on the Dashboard.</small>
              </label>
              <label>
                Budget (USD)
                <input
                  type="number"
                  min={0}
                  value={team.budget}
                  onChange={(event) => setField('budget', Number(event.target.value))}
                />
                {errors.budget && <em className="wizard-error">{errors.budget}</em>}
              </label>
              <label>
                Preferred supplier
                <input
                  value={team.supplier}
                  onChange={(event) => setField('supplier', event.target.value)}
                />
              </label>
              <label className="wide">
                Project goals (optional)
                <textarea
                  rows={2}
                  value={team.goals}
                  onChange={(event) => setField('goals', event.target.value)}
                  placeholder="Compete reliably, qualify for state, etc."
                />
              </label>
            </div>
          )}

          {step.id === 'strategy' && (
            <div className="wizard-fields">
              <label>
                Competition timeline (weeks)
                <input
                  type="number"
                  min={1}
                  value={team.timelineWeeks}
                  onChange={(event) => setField('timelineWeeks', Number(event.target.value))}
                />
                {errors.timelineWeeks && <em className="wizard-error">{errors.timelineWeeks}</em>}
              </label>
              <div className="wizard-tag-group" role="group" aria-label="Strategy mode">
                <strong>Strategy mode</strong>
                <div className="wizard-strategy-grid">
                  {STRATEGY_MODES.map((mode) => {
                    const isOn = team.strategyMode === mode.id
                    return (
                      <button
                        type="button"
                        key={mode.id}
                        className={`wizard-strategy-card ${isOn ? 'is-on' : ''}`}
                        onClick={() => setField('strategyMode', mode.id)}
                      >
                        <strong>{mode.label}</strong>
                        <span>{mode.description}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="wide wizard-tag-group" role="group" aria-label="Robot priorities">
                <strong>Robot priorities</strong>
                <small>Pick the goals Blueprint should weight when generating strategy + BOM.</small>
                <div className="wizard-tag-grid">
                  {ROBOT_PRIORITY_OPTIONS.map((priority) => {
                    const isOn = team.priorities?.includes(priority)
                    return (
                      <button
                        type="button"
                        key={priority}
                        className={`wizard-tag ${isOn ? 'is-on' : ''}`}
                        onClick={() => togglePriority(priority)}
                      >
                        {priority}
                      </button>
                    )
                  })}
                </div>
                {errors.priorities && <em className="wizard-error">{errors.priorities}</em>}
              </div>
            </div>
          )}

          {step.id === 'review' && (
            <div className="wizard-review">
              <p>
                Blueprint will create the project, seed strategy, concepts, BOM, physics, and starter code.
                You can edit everything once the workspace opens.
              </p>
              <dl className="wizard-review-grid">
                {summaryRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
              {submitError && <em className="wizard-error wide">{submitError}</em>}
            </div>
          )}

          <div className="wizard-actions">
            <button
              type="button"
              className="wizard-secondary"
              onClick={goBack}
              disabled={stepIndex === 0 || isSubmitting}
            >
              <ArrowLeft size={16} /> Back
            </button>
            {stepIndex < STEPS.length - 1 ? (
              <button type="button" className="wizard-primary" onClick={goNext} disabled={isSubmitting}>
                Continue <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="wizard-primary"
                onClick={finish}
                disabled={isSubmitting}
              >
                <Sparkles size={16} />
                {isSubmitting ? 'Creating project…' : 'Create project'}
              </button>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
