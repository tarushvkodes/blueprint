import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConcepts, buildGuide, defaultTeam } from '../server/generators/project.js';

test('build guide covers build, wire, test, tune, safety, and checkpoints from mechanism specs', () => {
  const team = defaultTeam({
    name: 'Guide Test FTC',
    number: '9100',
    budget: 1800,
    tools: ['hex drivers', 'laptop'],
  });
  const concepts = buildConcepts(team);
  const project = {
    team,
    concepts,
    selectedDesign: concepts[1],
  };
  const guide = buildGuide(project);
  const phases = guide.map((step) => step.phase.toLowerCase()).join(' ');

  assert.ok(guide.length >= 10);
  assert.match(phases, /build drivetrain/);
  assert.match(phases, /wire drivetrain/);
  assert.match(phases, /test drivetrain/);
  assert.match(phases, /build intake/);
  assert.match(phases, /tune scoring/);
  assert.match(phases, /tune autonomous/);
  assert.ok(guide.every((step) => step.parts && step.tools && step.checkpoint && step.commonMistake && step.test && step.safetyWarning));
});
