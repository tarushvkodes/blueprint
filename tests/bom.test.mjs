import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildBom, buildConcepts, defaultTeam } from '../server/generators/project.js';

const season = {
  seasonName: 'BOM Test Season',
  scoringSummary: 'Robots score game pieces with teleop and autonomous actions.',
  pointValues: '',
  robotConstraints: [],
};

test('BOM is generated from selected mechanism specs and carries mechanism ids', () => {
  const team = defaultTeam({ budget: 1500, inventory: [] });
  const concepts = buildConcepts(team, season);
  const tankBom = buildBom(team, concepts[0]);
  const mecanumBom = buildBom(team, concepts[1]);
  const tankMotor = tankBom.required.find((item) => /HD Hex Motor/i.test(item.part));
  const mecanumMotor = mecanumBom.required.find((item) => /HD Hex Motor/i.test(item.part));

  assert.ok(tankBom.required.every((item) => Array.isArray(item.mechanismIds) && item.mechanismIds.length > 0));
  assert.equal(tankMotor.qty, 2);
  assert.equal(mecanumMotor.qty, 4);
  assert.notEqual(tankBom.subtotal, mecanumBom.subtotal);
  assert.ok(mecanumBom.subsystemTotals.some((row) => row.subsystem === 'Drivetrain'));
});

test('BOM accounts for owned inventory quantities before checkout budget', () => {
  const team = defaultTeam({
    budget: 1500,
    inventory: ['REV-31-1595', 'HD Hex Motor x2', 'REV-31-1302 x4'],
  });
  const concept = buildConcepts(team, season)[1];
  const bom = buildBom(team, concept);
  const controlHub = bom.required.find((item) => item.sku === 'REV-31-1595');
  const driveMotor = bom.required.find((item) => /HD Hex Motor/i.test(item.part));

  assert.equal(controlHub.ownedQty, 1);
  assert.equal(controlHub.missingQty, 0);
  assert.equal(driveMotor.ownedQty, 2);
  assert.equal(driveMotor.missingQty, 2);
  assert.ok(bom.ownedValue > 0);
  assert.ok(bom.missingSubtotal < bom.subtotal);
  assert.equal(bom.budgetRemaining, Number((team.budget - bom.estimatedCheckoutTotal).toFixed(2)));
});

test('BOM suggests substitutions for expensive optional or advanced mechanisms', () => {
  const team = defaultTeam({ budget: 850, inventory: [] });
  const concept = buildConcepts(team, season)[2];
  const bom = buildBom(team, concept);

  assert.ok(bom.substitutions.length > 0);
  assert.ok(bom.buyFirst.length > 0);
  assert.ok(bom.missing.every((item) => item.needsPurchase));
});
