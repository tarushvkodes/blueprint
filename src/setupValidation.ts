import type { SeasonSource, Team, TeamSetupValidation } from './types'

const experienceLevels = ['Beginner', 'Intermediate', 'Advanced']
const strategyModes = ['ai', 'team-provided', 'hybrid']

function cleanList(value?: string[]) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)))
}

function makeCheck(id: string, label: string, done: boolean, message: string, required = true) {
  return { id, label, done, required, message }
}

export function validateTeamSetupDraft(team: Team, season?: SeasonSource): TeamSetupValidation {
  const priorities = cleanList(team.priorities)
  const tools = cleanList(team.tools)
  const inventory = cleanList(team.inventory)
  const checks = [
    makeCheck('team-identity', 'Team identity', Boolean(team.name?.trim() && team.number?.trim() && team.location?.trim()), 'Add team name, number, and location.'),
    makeCheck('experience', 'Skill level', experienceLevels.includes(team.experience), 'Choose Beginner, Intermediate, or Advanced.'),
    makeCheck('roster', 'Roster size', Number(team.students) >= 1 && Number(team.mentors) >= 0, 'Add at least one student and a non-negative mentor count.'),
    makeCheck('budget-timeline', 'Budget and timeline', Number(team.budget) >= 250 && Number(team.timelineWeeks) >= 1 && Number(team.timelineWeeks) <= 52, 'Use a budget of at least $250 and a timeline from 1 to 52 weeks.'),
    makeCheck('resources', 'Tools and build space', tools.length > 0 && Boolean(team.buildSpace?.trim()), 'Add available tools and build space.'),
    makeCheck('inventory', 'Inventory captured', inventory.length > 0, 'Add existing inventory so BOM missing/owned lists are useful.', false),
    makeCheck('strategy-mode', 'Strategy mode', strategyModes.includes(team.strategyMode || ''), 'Choose AI-generated, team-provided, or hybrid strategy mode.'),
    makeCheck('robot-priorities', 'Robot priorities', priorities.length >= 2, 'Choose at least two robot priorities.'),
    makeCheck('goals', 'Team goals', Boolean(team.goals && team.goals.trim().length >= 20), 'Add a concrete goal for the robot plan.'),
    makeCheck('season-source', 'Season source', Boolean(season && !season.isSample), 'Upload or ingest the current season manual before final recommendations.', false),
  ]
  const blockers = checks.filter((item) => item.required && !item.done).map((item) => item.message)
  const warnings = checks.filter((item) => !item.required && !item.done).map((item) => item.message)
  const completed = checks.filter((item) => item.done).length

  return {
    ready: blockers.length === 0,
    completed,
    total: checks.length,
    percent: Math.round((completed / checks.length) * 100),
    checks,
    blockers,
    warnings,
  }
}
