import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { projectArtifactsDirFor, projectAuditLogPathFor } from '../persistence.js';

function safeFilePart(value) {
  return String(value || 'artifact').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'artifact';
}

function timestampPart(date = new Date()) {
  return date.toISOString().replace(/[^0-9T]/g, '');
}

export function redactSecrets(value) {
  const secrets = [process.env.VERTEX_AI_API_KEY].filter(Boolean);
  const redactString = (input) => {
    let output = input;
    for (const secret of secrets) {
      output = output.split(secret).join('[REDACTED]');
    }
    return output
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      .replace(/([?&](?:api_?key|key)=)[^&\s"']+/gi, '$1[REDACTED]')
      .replace(/((?:api_?key|token|secret)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[REDACTED]');
  };

  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /api_?key|token|secret/i.test(key) ? '[REDACTED]' : redactSecrets(item),
    ]));
  }
  return value;
}

export async function writeArtifact({ rootDir, projectId, artifactName, payload, prompt, adapterName, model, schemaName, generatedAt = new Date() }) {
  const dir = projectArtifactsDirFor(rootDir, projectId);
  await fsp.mkdir(dir, { recursive: true });
  const filename = `${safeFilePart(artifactName)}-${timestampPart(generatedAt)}-${Math.random().toString(36).slice(2, 8)}.json`;
  const record = {
    artifactName,
    generatedAt: generatedAt.toISOString(),
    adapterName,
    model,
    schemaName,
    prompt,
    payload,
  };
  await fsp.writeFile(path.join(dir, filename), JSON.stringify(redactSecrets(record), null, 2));
  return { filename, ...record };
}

export async function listArtifacts({ rootDir, projectId }) {
  const dir = projectArtifactsDirFor(rootDir, projectId);
  if (!fs.existsSync(dir)) return [];
  const files = (await fsp.readdir(dir)).filter((file) => file.endsWith('.json')).sort();
  const artifacts = [];
  for (const filename of files) {
    try {
      const record = JSON.parse(await fsp.readFile(path.join(dir, filename), 'utf8'));
      artifacts.push({
        filename,
        artifactName: record.artifactName,
        generatedAt: record.generatedAt,
        adapterName: record.adapterName,
        model: record.model,
        schemaName: record.schemaName,
      });
    } catch {
      artifacts.push({ filename });
    }
  }
  return artifacts;
}

export async function readArtifact({ rootDir, projectId, filename }) {
  const safeName = path.basename(filename);
  if (safeName !== filename || !safeName.endsWith('.json')) return null;
  const filePath = path.join(projectArtifactsDirFor(rootDir, projectId), safeName);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(await fsp.readFile(filePath, 'utf8'));
}

export async function appendAuditEntry({ rootDir, projectId, entry }) {
  const filePath = projectAuditLogPathFor(rootDir, projectId);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.appendFile(filePath, `${JSON.stringify(redactSecrets({ ...entry, loggedAt: new Date().toISOString() }))}\n`);
}

export async function readAuditEntries({ rootDir, projectId, limit = 50 }) {
  const filePath = projectAuditLogPathFor(rootDir, projectId);
  if (!fs.existsSync(filePath)) return [];
  const lines = (await fsp.readFile(filePath, 'utf8')).split(/\r?\n/).filter(Boolean);
  return lines.slice(-Math.max(1, Math.min(Number(limit) || 50, 500))).map((line) => JSON.parse(line));
}

