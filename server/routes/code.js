import { execFile as execFileCallback } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { cp, mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const VALIDATION_TIMEOUT_MS = 90_000;
const TEAMCODE_RELATIVE_PATH = path.join('TeamCode', 'src', 'main', 'java', 'org', 'firstinspires', 'ftc', 'teamcode');

function isJavaSourceFile(fileName) {
  return typeof fileName === 'string' && fileName.endsWith('.java') && !fileName.includes(path.sep) && !fileName.includes('/');
}

async function clearGeneratedJavaFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.java'))
    .map((entry) => rm(path.join(directory, entry.name), { force: true })));
}

function normalizeErrorFilePath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const teamCodeIndex = normalized.indexOf('TeamCode/');
  if (teamCodeIndex >= 0) {
    return normalized.slice(teamCodeIndex);
  }
  return normalized;
}

export function parseCompileErrors(output) {
  const text = String(output || '');
  const matches = text.matchAll(/^(.+?\.java):(\d+):\s+error:\s+(.+)$/gm);
  const deduped = new Map();
  for (const match of matches) {
    const file = normalizeErrorFilePath(match[1].trim());
    const line = Number(match[2]);
    const message = match[3].trim();
    const key = `${file}:${line}:${message}`;
    if (!deduped.has(key)) {
      deduped.set(key, { file, line, message });
    }
  }
  return Array.from(deduped.values());
}

const defaultRunCommand = (command, args, options) => execFile(command, args, options);

export async function validateGeneratedCode({
  codeFiles,
  fixtureRoot,
  runCommand = defaultRunCommand,
  timeoutMs = VALIDATION_TIMEOUT_MS,
}) {
  const startTime = Date.now();
  let tempRoot = null;

  try {
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'ftc-sdk-validate-'));
    const workingFixture = path.join(tempRoot, 'ftc-sdk');
    await cp(fixtureRoot, workingFixture, { recursive: true });

    const teamCodeDir = path.join(workingFixture, TEAMCODE_RELATIVE_PATH);
    await mkdir(teamCodeDir, { recursive: true });
    await clearGeneratedJavaFiles(teamCodeDir);

    for (const [fileName, content] of Object.entries(codeFiles || {})) {
      if (!isJavaSourceFile(fileName)) continue;
      await writeFile(path.join(teamCodeDir, fileName), String(content), 'utf8');
    }

    const commandResult = await runCommand('./gradlew', ['compileJava'], {
      cwd: workingFixture,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
    });
    const stdout = [commandResult?.stdout || '', commandResult?.stderr || ''].filter(Boolean).join('\n');

    return {
      ok: true,
      errors: [],
      stdout,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const stdout = [error?.stdout || '', error?.stderr || '', error?.message || ''].filter(Boolean).join('\n');
    const errors = parseCompileErrors(stdout);
    if (errors.length === 0) {
      const timeoutMessage = error?.killed || error?.signal === 'SIGTERM'
        ? `Compilation timed out after ${timeoutMs}ms`
        : (error?.message || 'Compilation failed');
      errors.push({ file: 'TeamCode/src/main/java', line: 0, message: timeoutMessage });
    }
    return {
      ok: false,
      errors,
      stdout,
      durationMs: Date.now() - startTime,
    };
  } finally {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
}

async function loadProjectOrDemo(id, projects, getDemoProject) {
  const loadedProject = await projects.loadProject(id);
  if (loadedProject) {
    return { project: loadedProject, isDemo: false };
  }
  if (id === 'demo' && typeof getDemoProject === 'function') {
    return { project: getDemoProject(), isDemo: true };
  }
  return { project: null, isDemo: false };
}

export default function register(app, deps) {
  const { projects, code, archiver, getDemoProject } = deps;
  const fixtureRoot = deps.fixtureRoot || path.resolve(process.cwd(), 'fixtures', 'ftc-sdk');
  const runCommand = deps.execFile || defaultRunCommand;

  app.post('/api/projects/:id/generate-code', async (req, res, next) => {
    try {
      const { project, isDemo } = await loadProjectOrDemo(req.params.id, projects, getDemoProject);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.code = code.generateCode({ ...project, codeInputs: req.body });
      if (!isDemo) {
        await projects.saveProject(project);
      }
      res.json(project.code);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/code/validate', async (req, res, next) => {
    try {
      const { project, isDemo } = await loadProjectOrDemo(req.params.id, projects, getDemoProject);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.code || Object.keys(project.code).length === 0) {
        project.code = code.generateCode(project);
        if (!isDemo) {
          await projects.saveProject(project);
        }
      }

      const result = await validateGeneratedCode({
        codeFiles: project.code,
        fixtureRoot,
        runCommand,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/code', async (req, res, next) => {
    try {
      const { project } = await loadProjectOrDemo(req.params.id, projects, getDemoProject);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project.code || {});
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/code/export.zip', async (req, res, next) => {
    try {
      const { project } = await loadProjectOrDemo(req.params.id, projects, getDemoProject);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-FTC-code.zip`);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', next);
      archive.pipe(res);
      for (const [file, content] of Object.entries(project.code || {})) {
        archive.append(content, { name: `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/${file}` });
      }
      archive.finalize();
    } catch (error) {
      next(error);
    }
  });
}
