import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(rootDir, 'tools', 'ftc-java-fixture', 'stubs');
const workDir = path.join(rootDir, '.cache', 'java-compile');
const srcDir = path.join(workDir, 'src');
const classesDir = path.join(workDir, 'classes');
const teamCodeDir = path.join(srcDir, 'org', 'firstinspires', 'ftc', 'teamcode');
const externalApiBase = process.env.BLUEPRINT_JAVA_API_BASE;
const apiPort = process.env.BLUEPRINT_JAVA_API_PORT || '8788';
const apiBase = externalApiBase || `http://127.0.0.1:${apiPort}/api`;

let serverProcess = null;
let serverOutput = '';

function assertJavac() {
  const result = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (result.error) {
    throw new Error('javac was not found. Install a JDK locally or run this script in CI with actions/setup-java.');
  }
  if (result.status !== 0) {
    throw new Error(`javac failed to start:\n${result.stderr || result.stdout}`);
  }
  return (result.stderr || result.stdout || '').trim();
}

async function fetchJson(pathname) {
  const response = await fetch(`${apiBase}${pathname}`);
  if (!response.ok) {
    throw new Error(`Blueprint API ${pathname} failed with ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function waitForApi() {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 30_000) {
    try {
      const health = await fetchJson('/health');
      if (health.ok) return health;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error(`Blueprint API did not become ready at ${apiBase}. Last error: ${lastError?.message || 'none'}\n${serverOutput}`);
}

function startApiIfNeeded() {
  if (externalApiBase) return;
  serverProcess = spawn('node', ['server/index.js'], {
    cwd: rootDir,
    env: {
      ...process.env,
      API_PORT: apiPort,
      BLUEPRINT_FORCE_LOCAL_FALLBACK: '1',
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

function stopApi() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
}

async function copyDir(source, target) {
  await fsp.mkdir(target, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else if (entry.isFile()) {
      await fsp.copyFile(from, to);
    }
  }
}

async function writeGeneratedCode(code) {
  await fsp.rm(workDir, { recursive: true, force: true });
  await fsp.mkdir(teamCodeDir, { recursive: true });
  await fsp.mkdir(classesDir, { recursive: true });
  await copyDir(fixtureDir, srcDir);

  for (const [file, content] of Object.entries(code)) {
    if (!file.endsWith('.java')) continue;
    await fsp.writeFile(path.join(teamCodeDir, file), content);
  }
}

async function listJavaFiles(dir) {
  const files = [];
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function compileJava() {
  const javaFiles = await listJavaFiles(srcDir);
  if (javaFiles.length === 0) {
    throw new Error('No Java files were found for compilation.');
  }
  const result = spawnSync('javac', ['-d', classesDir, ...javaFiles], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Generated FTC Java failed to compile.\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}`);
  }
  return javaFiles.length;
}

async function main() {
  const javacVersion = assertJavac();
  startApiIfNeeded();
  try {
    await waitForApi();
    const demoProject = await fetchJson('/project/demo');
    const code = await fetchJson(`/projects/${demoProject.id}/code`);
    const staticValidation = await fetchJson(`/projects/${demoProject.id}/code/validate`);

    if (!staticValidation.ok) {
      throw new Error(`Static generated-code validation failed:\n${JSON.stringify(staticValidation.issues, null, 2)}`);
    }

    await writeGeneratedCode(code);
    const compiledFiles = await compileJava();
    const relativeWorkDir = path.relative(rootDir, workDir);
    console.log(`Generated FTC Java compiled with ${javacVersion}.`);
    console.log(`Compiled ${compiledFiles} Java files using fixture at ${relativeWorkDir}.`);
  } finally {
    stopApi();
  }
}

process.on('exit', stopApi);
process.on('SIGINT', () => {
  stopApi();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopApi();
  process.exit(143);
});

main().catch((error) => {
  console.error(error.message);
  if (serverOutput) {
    console.error('\nBlueprint API output:\n' + serverOutput);
  }
  process.exit(1);
});
