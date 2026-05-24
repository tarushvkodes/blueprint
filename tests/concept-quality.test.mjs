import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeAiConceptPacket,
  validateConceptPacket,
} from '../server/generators/conceptQuality.js';
import { buildConcepts, defaultTeam } from '../server/generators/project.js';

const team = defaultTeam({
  name: 'Quality Gate FTC',
  budget: 1500,
  experience: 'Intermediate',
  tools: ['hex drivers', '3D printer', 'laptop'],
  priorities: ['reliable autonomous', 'easy maintenance'],
});

const season = {
  seasonName: 'Quality Season',
  scoringSummary: 'Robots score game pieces and may complete autonomous movement tasks.',
  pointValues: 'Point values are available only from uploaded official manuals.',
  robotConstraints: ['Verify starting configuration against the official manual.'],
  fieldFacts: ['Game pieces must be handled safely.'],
};

function completeConcept(overrides = {}) {
  return {
    conceptIntent: 'balanced',
    id: 'balanced-quality-cycle',
    name: 'Balanced Quality Cycle Machine',
    strategyFit: 'Matches the team budget, intermediate skill level, six week build lane, and reliable autonomous priority.',
    difficulty: 'Intermediate',
    estimatedCost: 1200,
    buildTime: '5-6 weeks',
    requiredTools: ['hex drivers', 'laptop'],
    requiredParts: ['Control Hub', 'HD Hex Motors', 'linear motion kit'],
    mainMechanisms: ['mecanum drivetrain', 'active intake', 'single-stage lift', 'encoder autonomous controls'],
    pros: ['good cycle speed', 'maintainable structure'],
    cons: ['needs driver practice'],
    risks: ['slide binding needs current checks'],
    upgradePath: ['add vision after base robot is reliable'],
    ...overrides,
  };
}

test('local fallback concepts pass the same concept quality gate', () => {
  const concepts = buildConcepts(team, season);
  const quality = validateConceptPacket(concepts, team, season);

  assert.equal(quality.ok, true, quality.issues.join('\n'));
});

test('quality gate accepts three complete, distinct robot architectures', () => {
  const packet = normalizeAiConceptPacket([
    completeConcept({
      conceptIntent: 'conservative',
      id: 'safe-tank-scorer',
      name: 'Safe Tank Scoring Robot',
      difficulty: 'Beginner-safe',
      estimatedCost: 850,
      buildTime: '3-4 weeks',
      mainMechanisms: ['tank drivetrain', 'passive guide intake', 'single-stage arm', 'encoder autonomous controls'],
    }),
    completeConcept(),
    completeConcept({
      conceptIntent: 'high-ceiling',
      id: 'high-ceiling-vision-cycle',
      name: 'High Ceiling Vision Cycle Robot',
      difficulty: 'Advanced high-ceiling',
      estimatedCost: 1950,
      buildTime: '7-8 weeks',
      mainMechanisms: ['mecanum drivetrain', 'active roller intake', 'multi-stage lift', 'vision alignment controls'],
      cons: ['over budget without extra fundraising'],
      risks: ['vision and lift integration could consume build time'],
    }),
  ], team, season);

  assert.equal(packet.accepted, true, packet.issues.join('\n'));
});

test('quality gate rejects subsystem-only concept packets', () => {
  const packet = normalizeAiConceptPacket([
    completeConcept({ conceptIntent: 'conservative', name: 'Intake', difficulty: 'Beginner-safe', estimatedCost: 500 }),
    completeConcept({ name: 'Lift', mainMechanisms: ['linear slide'] }),
    completeConcept({ conceptIntent: 'high-ceiling', name: 'Vision', difficulty: 'Advanced', mainMechanisms: ['camera'] }),
  ], team, season);

  assert.equal(packet.accepted, false);
  assert.match(packet.issues.join('\n'), /subsystem|mainMechanisms|drivetrain/i);
});

test('quality gate rejects hallucinated certainty and unsupported scoring values', () => {
  const packet = normalizeAiConceptPacket([
    completeConcept({
      conceptIntent: 'conservative',
      id: 'safe-tank',
      name: 'Safe Tank Legal Winner',
      difficulty: 'Beginner-safe',
      estimatedCost: 850,
      mainMechanisms: ['tank drivetrain', 'passive guide intake', 'single-stage arm', 'encoder autonomous controls'],
      pros: ['fully legal scoring every time', 'scores 40 points in autonomous'],
    }),
    completeConcept(),
    completeConcept({
      conceptIntent: 'high-ceiling',
      id: 'high-vision',
      name: 'High Ceiling Vision Robot',
      difficulty: 'Advanced',
      estimatedCost: 1900,
      buildTime: '7 weeks',
      mainMechanisms: ['mecanum drivetrain', 'active intake', 'multi-stage lift', 'vision alignment controls'],
      cons: ['over budget without sponsor help'],
      risks: ['integration risk is high'],
    }),
  ], team, season);

  assert.equal(packet.accepted, false);
  assert.match(packet.issues.join('\n'), /unsupported certainty|unsupported scoring values/i);
});
