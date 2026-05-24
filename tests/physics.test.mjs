import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConcepts, calculateMechanisms, defaultTeam } from '../server/generators/project.js';

test('physics includes current, battery, center-of-gravity, and tipping estimates', () => {
  const team = defaultTeam({
    name: 'Physics Test FTC',
    number: '9200',
    budget: 1800,
  });
  const concepts = buildConcepts(team);
  const physics = calculateMechanisms({ design: concepts[1] });
  const mechanisms = physics.map((item) => item.mechanism).join(' ');

  assert.match(mechanisms, /Battery and current load/);
  assert.match(mechanisms, /Center of gravity and tipping risk/);
  assert.ok(physics.find((item) => item.mechanism === 'Battery and current load')?.result.includes('A estimated peak'));
  assert.ok(physics.find((item) => item.mechanism === 'Center of gravity and tipping risk')?.result.includes('degree static tip angle'));
});
