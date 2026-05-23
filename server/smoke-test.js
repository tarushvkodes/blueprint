import { spawn } from 'node:child_process';

function randomPort() {
  return 20000 + Math.floor(Math.random() * 20000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(port, child) {
  const startedAt = Date.now();
  const timeoutMs = 30000;
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`API exited early with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Server may still be starting.
    }
    await sleep(250);
  }
  throw new Error('Timed out waiting for API startup');
}

async function assertStatus200(url) {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw new Error(`Expected 200 for ${url}, received ${response.status}`);
  }
}

const port = randomPort();
const child = spawn('node', ['server/index.js'], {
  env: { ...process.env, API_PORT: String(port) },
  stdio: 'inherit',
});

try {
  await waitForServer(port, child);
  await assertStatus200(`http://127.0.0.1:${port}/api/health`);
  await assertStatus200(`http://127.0.0.1:${port}/api/project/demo`);
  await assertStatus200(`http://127.0.0.1:${port}/api/ai/status`);
  console.log('Smoke test passed.');
} finally {
  if (child.exitCode === null) {
    child.kill('SIGTERM');
    await sleep(250);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}
