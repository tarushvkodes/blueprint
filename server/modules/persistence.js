import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function projectCacheDirFor(rootDir, id) {
  return path.join(rootDir, '.cache', 'projects', String(id));
}

export function projectArtifactsDirFor(rootDir, id) {
  return path.join(projectCacheDirFor(rootDir, id), 'artifacts');
}

export function projectAuditLogPathFor(rootDir, id) {
  return path.join(projectCacheDirFor(rootDir, id), 'audit.log.jsonl');
}

export function createProjectStore({ rootDir }) {
  const projectsDir = path.join(rootDir, '.cache', 'projects');
  const projects = new Map();

  async function ensureStore() {
    await fsp.mkdir(projectsDir, { recursive: true });
  }

  function filePathFor(id) {
    return path.join(projectsDir, `${id}.json`);
  }

  async function saveProject(project) {
    await ensureStore();
    const filePath = filePathFor(project.id);
    const payload = cloneJson(project);
    projects.set(project.id, payload);
    await fsp.writeFile(filePath, JSON.stringify(payload, null, 2));
    return payload;
  }

  async function loadProject(id) {
    if (projects.has(id)) return cloneJson(projects.get(id));
    const filePath = filePathFor(id);
    if (!fs.existsSync(filePath)) return null;
    const project = JSON.parse(await fsp.readFile(filePath, 'utf8'));
    projects.set(id, project);
    return cloneJson(project);
  }

  async function listProjects() {
    await ensureStore();
    const files = await fsp.readdir(projectsDir);
    const loaded = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      const project = JSON.parse(await fsp.readFile(path.join(projectsDir, file), 'utf8'));
      projects.set(id, project);
      loaded.push(cloneJson(project));
    }
    return loaded;
  }

  async function updateProject(id, updater) {
    const current = await loadProject(id);
    if (!current) return null;
    const updated = await updater(cloneJson(current));
    if (!updated) return null;
    return saveProject(updated);
  }

  return {
    projectsDir,
    projectCacheDirFor: (id) => projectCacheDirFor(rootDir, id),
    projectArtifactsDirFor: (id) => projectArtifactsDirFor(rootDir, id),
    projectAuditLogPathFor: (id) => projectAuditLogPathFor(rootDir, id),
    saveProject,
    loadProject,
    listProjects,
    updateProject,
  };
}
