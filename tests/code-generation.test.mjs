import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCode } from '../server/generators/code.js';
import { buildConcepts, defaultTeam } from '../server/generators/project.js';
import { validateGeneratedJava } from '../server/javaValidation.js';

test('generated FTC code includes intake subsystem, battery warning, and hardware checklist', () => {
  const team = defaultTeam({
    name: 'Code Test FTC',
    number: '9001',
    budget: 1800,
    inventory: ['REV Starter Kit'],
  });
  const concepts = buildConcepts(team);
  const project = {
    team,
    concepts,
    selectedDesign: concepts[1],
  };
  const code = generateCode(project);
  const validation = validateGeneratedJava(code);

  assert.equal(validation.ok, true);
  assert.ok(code['IntakeSubsystem.java'].includes('class IntakeSubsystem'));
  assert.ok(code['RobotHardware.java'].includes('VoltageSensor'));
  assert.ok(code['TeleOpMain.java'].includes('LOW_BATTERY_WARNING_VOLTS'));
  assert.ok(code['README.md'].includes('Driver Station hardware checklist'));
});
