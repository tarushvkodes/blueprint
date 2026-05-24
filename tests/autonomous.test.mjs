import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutonomousPlan, buildConcepts, defaultTeam } from '../server/generators/project.js';

test('autonomous plan matches selected drivetrain and includes tuning warnings', () => {
  const team = defaultTeam({
    name: 'Auto Test FTC',
    number: '9300',
    experience: 'Beginner',
    budget: 1600,
  });
  const concepts = buildConcepts(team);
  const project = {
    team,
    concepts,
    selectedDesign: concepts[1],
  };
  const plan = buildAutonomousPlan(project, { desiredAction: 'score preload then park' });

  assert.ok(['mecanum', 'tank', 'x-drive'].includes(plan.drivetrain));
  assert.ok(plan.path.length >= 4);
  assert.ok(plan.pseudocode.some((line) => /battery/i.test(line)));
  assert.ok(plan.testingPlan.some((line) => /10/.test(line)));
  assert.ok(plan.warnings.some((line) => /wheel diameter|gear ratio|track width|battery/i.test(line)));
});
