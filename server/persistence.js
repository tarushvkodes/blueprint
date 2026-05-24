import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { cacheDir } from './config.js';
import { nowIso } from './utils.js';

const projectsFile = path.join(cacheDir, 'projects.json');
let writeQueue = Promise.resolve();

function serializableProject(project) {
  return {
    ...project,
    persistedAt: nowIso(),
  };
}

export async function restoreProjectSnapshots(projects) {
  if (!fs.existsSync(projectsFile)) return 0;
  const payload = JSON.parse(await fsp.readFile(projectsFile, 'utf8'));
  const snapshots = Array.isArray(payload.projects) ? payload.projects : [];
  for (const project of snapshots) {
    if (project?.id) projects.set(project.id, project);
  }
  return snapshots.length;
}

export async function saveProjectSnapshots(projects) {
  const payload = {
    savedAt: nowIso(),
    projects: Array.from(projects.values()).filter((project) => !project.transient).map(serializableProject),
  };
  await fsp.writeFile(projectsFile, JSON.stringify(payload, null, 2));
}

export function queueProjectSnapshotSave(projects) {
  writeQueue = writeQueue
    .then(() => saveProjectSnapshots(projects))
    .catch((error) => {
      console.warn('Project persistence skipped:', error.message);
    });
  return writeQueue;
}
