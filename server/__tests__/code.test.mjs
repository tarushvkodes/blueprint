import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import registerCodeRoutes from '../routes/code.js';

function createArchive() {
  return {
    on() {},
    pipe() {},
    append() {},
    finalize() {},
  };
}

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const createdServer = app.listen(0, '127.0.0.1', () => resolve(createdServer));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function createApp(execFile) {
  const app = express();
  app.use(express.json());

  const demoProject = {
    id: 'demo',
    team: { name: 'Demo Team' },
    code: {
      'TeleOpMain.java': 'package org.firstinspires.ftc.teamcode;\npublic class TeleOpMain {}\n',
    },
  };

  registerCodeRoutes(app, {
    projects: {
      loadProject: async () => null,
      saveProject: async () => {},
    },
    code: {
      generateCode: () => demoProject.code,
    },
    archiver: () => createArchive(),
    getDemoProject: () => demoProject,
    execFile,
    fixtureRoot: path.resolve(process.cwd(), 'fixtures', 'ftc-sdk'),
  });

  return app;
}

test('POST /api/projects/:id/code/validate returns success shape', async () => {
  const app = createApp(async () => ({ stdout: 'BUILD SUCCESSFUL', stderr: '' }));

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/demo/code/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(Object.keys(payload).sort(), ['durationMs', 'errors', 'ok', 'stdout']);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.errors, []);
    assert.equal(typeof payload.stdout, 'string');
    assert.equal(typeof payload.durationMs, 'number');
    assert.equal(payload.durationMs >= 0, true);
  });
});

test('POST /api/projects/:id/code/validate parses javac error output', async () => {
  const compileFailure = new Error('compile failed');
  compileFailure.stdout = '/tmp/build/TeamCode/src/main/java/org/firstinspires/ftc/teamcode/TeleOpMain.java:31: error: cannot find symbol';
  compileFailure.stderr = '';

  const app = createApp(async () => {
    throw compileFailure;
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/projects/demo/code/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.ok, false);
    assert.equal(Array.isArray(payload.errors), true);
    assert.deepEqual(payload.errors[0], {
      file: 'TeamCode/src/main/java/org/firstinspires/ftc/teamcode/TeleOpMain.java',
      line: 31,
      message: 'cannot find symbol',
    });
    assert.equal(typeof payload.stdout, 'string');
    assert.equal(typeof payload.durationMs, 'number');
  });
});
