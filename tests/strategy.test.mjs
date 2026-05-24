import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStrategy, defaultTeam } from '../server/generators/project.js';

test('strategy engine emits full match-phase guidance and citations', () => {
  const team = defaultTeam({
    name: 'Strategy Test FTC',
    number: '9400',
    experience: 'Beginner',
    goals: 'Build a conservative robot that can park and score one task reliably.',
  });
  const strategy = buildStrategy(team, {
    seasonName: 'Test Season',
    scoringSummary: 'Autonomous scoring and endgame park are valuable.',
    pointValues: 'Autonomous preload and endgame return tasks exist.',
  });

  assert.match(strategy.recommendation, /Build drivetrain/i);
  assert.ok(strategy.scoringPriorities.length >= 3);
  assert.ok(strategy.whatToIgnore.length >= 1);
  assert.ok(strategy.autonomous.some((item) => /encoder|score|movement/i.test(item)));
  assert.ok(strategy.teleOp.some((item) => /driver/i.test(item)));
  assert.ok(strategy.driverPracticeGoals.length >= 2);
  assert.ok(Array.isArray(strategy.citations));
});
