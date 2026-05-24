import assert from 'node:assert/strict';
import test from 'node:test';
import { generateCadConcept, cadAsConceptJson } from '../server/generators/cad.js';
import { buildConcepts, defaultTeam } from '../server/generators/project.js';

test('CAD concept includes 2D views, wiring routes, and exploded assembly data', () => {
  const team = defaultTeam({ name: 'CAD Test FTC', number: '9500', budget: 1800 });
  const concepts = buildConcepts(team);
  const project = { team, concepts, selectedDesign: concepts[1], generatedBy: 'test' };
  const cad = generateCadConcept(project);
  const artifact = cadAsConceptJson({ ...project, cad });

  assert.ok(cad.blueprintViews.top.components.length > 0);
  assert.ok(cad.blueprintViews.front.components.length > 0);
  assert.ok(cad.blueprintViews.side.components.length > 0);
  assert.ok(cad.wiringView.runs.some((run) => run.id === 'hub-to-drive'));
  assert.ok(cad.explodedAssembly.steps.length >= 4);
  assert.ok(artifact.extras.blueprintViews.top);
  assert.ok(artifact.extras.wiringView.runs.length > 0);
});
