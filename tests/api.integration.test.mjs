import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';

const port = process.env.BLUEPRINT_TEST_PORT || '8799';
const apiBase = `http://127.0.0.1:${port}/api`;

let serverProcess;
let serverOutput = '';

function startServer() {
  if (serverProcess) return;
  serverProcess = spawn('node', ['server/index.js'], {
    env: {
      ...process.env,
      API_PORT: port,
      BLUEPRINT_FORCE_LOCAL_FALLBACK: '1',
      BLUEPRINT_SKIP_INITIAL_CATALOG_SYNC: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on('data', (chunk) => {
    serverOutput += chunk.toString();
  });
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  serverProcess = null;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed with ${response.status}: ${text}`);
  }
  return payload;
}

async function waitForApi() {
  startServer();
  const started = Date.now();
  let lastError;
  while (Date.now() - started < 30_000) {
    try {
      const health = await requestJson('/health');
      if (health.ok) return health;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
  }
  throw new Error(`API did not become ready. Last error: ${lastError?.message || 'none'}\n${serverOutput}`);
}

async function createProject(overrides = {}) {
  return requestJson('/projects', {
    method: 'POST',
    body: JSON.stringify({
      team: {
        name: `Integration Team ${Date.now()}`,
        number: `T${Math.floor(Math.random() * 100000)}`,
        budget: 1400,
        experience: 'Beginner',
        ...overrides,
      },
    }),
  });
}

function assertMechanismPacket(project) {
  assert.ok(Array.isArray(project.concepts));
  for (const concept of project.concepts) {
    assert.ok(Array.isArray(concept.mechanismSpecs), `${concept.name} should expose mechanism specs`);
    const types = new Set(concept.mechanismSpecs.map((spec) => spec.type));
    assert.ok(types.has('drivetrain'), `${concept.name} should have a drivetrain spec`);
    assert.ok(types.has('intake'), `${concept.name} should have an intake spec`);
    assert.ok(types.has('manipulator'), `${concept.name} should have a manipulator spec`);
    assert.ok(types.has('control'), `${concept.name} should have a control spec`);
    for (const spec of concept.mechanismSpecs) {
      assert.ok(spec.id, 'mechanism spec should have a stable id');
      assert.ok(spec.name, 'mechanism spec should have a name');
      assert.ok(Array.isArray(spec.hardware), `${spec.id} should list hardware`);
      assert.ok(spec.hardware.length > 0, `${spec.id} should list at least one hardware item`);
      assert.ok(spec.cad?.placement, `${spec.id} should expose CAD placement`);
      assert.ok(spec.code?.subsystem, `${spec.id} should expose code subsystem`);
      assert.ok(spec.validation, `${spec.id} should expose validation flags`);
    }
  }
}

test('Blueprint API integration', async (t) => {
  await waitForApi();

  t.after(async () => {
    stopServer();
  });

  await t.test('health, demo project, and generated code validation respond', async () => {
    const health = await requestJson('/health');
    assert.equal(health.ok, true);
    assert.equal(health.service, 'blueprint-api');

    const demo = await requestJson('/project/demo');
    assert.ok(demo.id);
    assert.equal(demo.conceptQuality.accepted, true);
    assert.ok(Array.isArray(demo.concepts));
    assert.ok(demo.concepts.length >= 3);
    assertMechanismPacket(demo);

    const selectedMechanismIds = demo.concepts[1].mechanismSpecs.map((spec) => spec.id);
    assert.ok(demo.bom.some((item) => (item.mechanismIds || [item.mechanismId]).some((id) => selectedMechanismIds.includes(id))));
    assert.ok(demo.physics.some((item) => selectedMechanismIds.includes(item.mechanismId)));
    assert.ok(demo.buildGuide.some((step) => selectedMechanismIds.includes(step.mechanismId)));

    const code = await requestJson(`/projects/${demo.id}/code`);
    assert.match(code['README.md'], new RegExp(selectedMechanismIds[0]));

    const cadResponse = await fetch(`${apiBase}/projects/${demo.id}/cad/export.concept.json`);
    assert.equal(cadResponse.status, 200);
    const cad = await cadResponse.json();
    assert.deepEqual(cad.extras.mechanismIds, selectedMechanismIds);

    const validation = await requestJson(`/projects/${demo.id}/code/validate`);
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.issues, []);
    assert.ok(validation.hardwareNames.includes('left_front'));
  });

  await t.test('project create, update, list, and delete round trip', async () => {
    const created = await createProject({ name: 'Integration Persistence Team', budget: 1234 });
    assert.ok(created.id);
    assert.equal(created.team.name, 'Integration Persistence Team');
    assert.equal(created.setupValidation.ready, true);

    const updated = await requestJson(`/projects/${created.id}/intake`, {
      method: 'POST',
      body: JSON.stringify({
        team: {
          ...created.team,
          budget: 1500,
          priorities: ['Reliable autonomous', 'Easy maintenance'],
        },
      }),
    });
    assert.equal(updated.team.budget, 1500);
    assert.deepEqual(updated.team.priorities, ['Reliable autonomous', 'Easy maintenance']);

    const listed = await requestJson('/projects');
    assert.ok(listed.projects.some((project) => project.id === created.id));

    const deleted = await requestJson(`/projects/${created.id}`, { method: 'DELETE' });
    assert.deepEqual(deleted, { deleted: true, id: created.id });

    const listedAfterDelete = await requestJson('/projects');
    assert.equal(listedAfterDelete.projects.some((project) => project.id === created.id), false);
  });

  await t.test('setup validation blocks unsafe project generation', async () => {
    const response = await fetch(`${apiBase}/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        team: {
          name: '',
          number: '',
          location: '',
          budget: 0,
          timelineWeeks: 0,
          students: 0,
          mentors: -1,
          tools: [],
          priorities: [],
          goals: '',
          strategyMode: '',
        },
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 400);
    assert.equal(payload.error, 'Setup validation failed');
    assert.equal(payload.setupValidation.ready, false);
    assert.ok(payload.setupValidation.blockers.some((blocker) => /team name/i.test(blocker)));
  });

  await t.test('team intake cleanup dedupes inventory and reports setup status', async () => {
    const project = await createProject({ name: 'Integration Cleanup Team' });
    t.after(async () => {
      await requestJson(`/projects/${project.id}`, { method: 'DELETE' }).catch(() => {});
    });

    const updated = await requestJson(`/projects/${project.id}/intake`, {
      method: 'POST',
      body: JSON.stringify({
        team: {
          ...project.team,
          inventory: ['sku', 'REV-31-1595', 'rev-31-1595', 'HD Hex Motor', '  HD Hex Motor  '],
          priorities: ['Reliable autonomous', 'Reliable autonomous', 'Easy maintenance'],
        },
      }),
    });

    assert.deepEqual(updated.team.inventory, ['REV-31-1595', 'HD Hex Motor']);
    assert.deepEqual(updated.team.priorities, ['Reliable autonomous', 'Easy maintenance']);
    assert.equal(updated.setupValidation.ready, true);
  });

  await t.test('CAD, build-guide, catalog, and chat fallbacks stay usable', async () => {
    const project = await createProject({ name: 'Integration Artifact Team' });
    t.after(async () => {
      await requestJson(`/projects/${project.id}`, { method: 'DELETE' }).catch(() => {});
    });

    const cadResponse = await fetch(`${apiBase}/projects/${project.id}/cad/export.concept.json`);
    assert.equal(cadResponse.status, 200);
    assert.match(cadResponse.headers.get('content-type') || '', /application\/json/);
    const cad = await cadResponse.json();
    assert.equal(cad.asset.version, '2.0');
    assert.ok(cad.extras.disclaimer.includes('Conceptual CAD starter'));

    const buildGuideResponse = await fetch(`${apiBase}/projects/${project.id}/build-guide/export.html`);
    assert.equal(buildGuideResponse.status, 200);
    assert.match(buildGuideResponse.headers.get('content-type') || '', /text\/html/);
    assert.match(await buildGuideResponse.text(), /Build Guide/);

    const catalog = await requestJson('/catalog/search?q=control&limit=3');
    assert.equal(catalog.query, 'control');
    assert.ok(Array.isArray(catalog.products));

    const chat = await requestJson(`/projects/${project.id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: 'Can we make this cheaper and legal?' }),
    });
    assert.equal(chat.generatedBy, 'local-fallback');
    assert.match(chat.answer, /cited manual section/i);
    assert.ok(Array.isArray(chat.citations));

    const goal = await requestJson(`/projects/${project.id}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message: '/goal Build the lowest-risk autonomous parking robot' }),
    });
    assert.equal(goal.generatedBy, 'local-command');
    assert.equal(goal.command, 'goal');
    assert.equal(goal.project.team.goals, 'Build the lowest-risk autonomous parking robot');
  });
});
