import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCadConcept } from '../server/generators/cad.js';
import { generateCode } from '../server/generators/code.js';
import {
  buildBom,
  buildConcepts,
  buildGuide,
  buildLegalChecklist,
  calculateMechanisms,
  defaultTeam,
  reviewProject,
} from '../server/generators/project.js';
import { validateGeneratedJava } from '../server/javaValidation.js';
import { chunkText } from '../server/documents.js';
import { state } from '../server/state.js';

function reviewableProject() {
  const team = defaultTeam({
    name: 'Review Gate FTC',
    budget: 1600,
    experience: 'Intermediate',
    priorities: ['Reliable autonomous', 'Easy maintenance'],
  });
  const season = {
    seasonName: 'Review Season',
    manualVersion: 'V1',
    scoringSummary: 'Robots score game pieces and complete autonomous movement tasks.',
    pointValues: 'Official point values are available in the uploaded manual.',
    robotConstraints: ['Verify construction and starting configuration rules.'],
    fieldFacts: [],
    isSample: false,
  };
  const concepts = buildConcepts(team, season);
  const project = {
    id: 'review-test',
    team,
    season,
    concepts,
    selectedDesign: concepts[1],
    generatedBy: 'test',
  };
  project.bom = buildBom(team, project.selectedDesign);
  project.physics = calculateMechanisms({ design: project.selectedDesign });
  project.cad = generateCadConcept(project);
  project.code = generateCode(project);
  project.codeValidation = validateGeneratedJava(project.code);
  project.buildGuide = buildGuide(project);
  return project;
}

test('legal checklist maps selected mechanisms to citations or unresolved blockers', () => {
  const previousChunks = state.chunks;
  state.chunks = chunkText([
    '9 ROBOT Construction Rules',
    '',
    '<R101> ROBOT construction, drivetrain, wheels, frame perimeter, mechanisms, control system, and starting configuration must be inspected against this manual.',
    '',
    '<R105> Extensions, manipulators, intakes, arms, lifts, sensors, vision cameras, and game piece control must remain within legal constraints.',
  ].join('\n'), {
    documentId: 'review_manual',
    title: 'Review Season Competition Manual',
    sourceUrl: 'official-review-manual.pdf',
    type: 'manual',
    version: 'V1',
    sourceDate: '2026-02-02',
    page: 9,
  });

  try {
    const project = reviewableProject();
    const checklist = buildLegalChecklist(project);
    assert.ok(checklist.length >= project.selectedDesign.mechanismSpecs.length);
    assert.equal(checklist.every((item) => item.status === 'citation-available'), true);

    const review = reviewProject(project);
    assert.equal(review.pass, true, review.blockers.join('\n'));
    assert.deepEqual(review.blockers, []);
  } finally {
    state.chunks = previousChunks;
  }
});

test('review agent blocks contradictory or incomplete artifact packets', () => {
  const previousChunks = state.chunks;
  state.chunks = [];

  try {
    const project = reviewableProject();
    project.physics = project.physics.filter((item) => item.mechanismId !== project.selectedDesign.mechanismSpecs[0].id);
    project.code = {
      ...project.code,
      'RobotHardware.java': project.code['RobotHardware.java'].replace('"left_front"', '"wrong_left_front"'),
    };
    project.codeValidation = validateGeneratedJava(project.code);

    const review = reviewProject(project);
    assert.equal(review.pass, false);
    assert.match(review.blockers.join('\n'), /legal checklist|requires a physics calculation|left_front/i);
    assert.ok(review.fixes.length > 0);
  } finally {
    state.chunks = previousChunks;
  }
});
