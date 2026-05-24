import type { BuildGuideStep, ProjectData, Team } from './types'

export const wizardSteps = [
  { title: 'Team', copy: 'Identity, roster, location, and mentor coverage.' },
  { title: 'Resources', copy: 'Budget, tools, space, inventory, and supplier preference.' },
  { title: 'Strategy', copy: 'AI, team-provided, or hybrid planning with priorities.' },
  { title: 'Review', copy: 'Confirm the packet inputs before generation.' },
]

export const priorityOptions = [
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

export const strategyModes = [
  { value: 'ai', label: 'AI-generated', copy: 'Blueprint proposes the initial strategy from constraints.' },
  { value: 'team-provided', label: 'Team-provided', copy: 'Students drive the strategy; Blueprint checks and packages it.' },
  { value: 'hybrid', label: 'Hybrid', copy: 'Students set direction while Blueprint fills gaps and tradeoffs.' },
]

export function displayedCode(project: ProjectData) {
  const generatedCodeEntries = Object.entries(project.code || {})
  const displayedCodeFile = generatedCodeEntries.find(([fileName]) => /TeleOpMain\.java$/i.test(fileName)) || generatedCodeEntries[0]

  return displayedCodeFile
    ? `// ${displayedCodeFile[0]}\n${displayedCodeFile[1]}`
    : '// Generate a project to load FTC SDK starter code.'
}

export function cadPreview(project: ProjectData) {
  if (!project.cad) return JSON.stringify(project.season?.robotConstraints || [], null, 2)

  return JSON.stringify({
    generatedBy: project.cad.generatedBy,
    disclaimer: project.cad.disclaimer,
    robotDimensionsMm: project.cad.robotDimensionsMm,
    subsystemLayout: project.cad.subsystemLayout,
    verificationNotes: project.cad.verificationNotes,
  }, null, 2)
}

export function buildGuideRows(project: ProjectData): BuildGuideStep[] {
  return project.buildGuide?.length
    ? project.buildGuide
    : project.buildSteps.map((step) => ({ phase: 'Build', instructions: step }))
}

export function parseInventoryText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(/,|\t/).map((cell) => cell.trim()).find((cell) => (
      cell &&
      !/^(item|part|parts|sku|qty|quantity|inventory)$/i.test(cell) &&
      !/^\d+(\.\d+)?$/.test(cell)
    )))
    .filter((item): item is string => Boolean(item))
}

export function mergeInventory(team: Team, imported: string[]) {
  return Array.from(new Set([...(team.inventory || []), ...imported]))
}
