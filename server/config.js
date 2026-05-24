import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(__dirname, '..');
export const cacheDir = path.join(rootDir, '.cache');
export const uploadDir = path.join(rootDir, 'uploads');

export function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

export const port = process.env.API_PORT || 8787;
const downloadsDir = path.join(process.env.USERPROFILE || process.env.HOME || rootDir, 'Downloads');

export const googleAiStudioConfig = {
  apiKey: process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || '',
  forceFallback: process.env.BLUEPRINT_FORCE_LOCAL_FALLBACK === '1',
  textModel: process.env.GOOGLE_AI_STUDIO_TEXT_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash-lite',
  imageModel: process.env.GOOGLE_AI_STUDIO_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image',
  timeoutMs: Number(process.env.GOOGLE_AI_STUDIO_TIMEOUT_MS || process.env.GEMINI_TIMEOUT_MS || 45000),
};

export const defaultFiles = {
  writeup: process.env.BLUEPRINT_DEFAULT_WRITEUP || path.join(downloadsDir, 'writeup.pdf'),
  manual: process.env.BLUEPRINT_DEFAULT_MANUAL || path.join(downloadsDir, 'DECODE_Competition_Manual_TU32.pdf'),
};

export const seedRevUrls = [
  'https://www.revrobotics.com/rev-45-3529/',
  'https://www.revrobotics.com/rev-31-1595/',
  'https://www.revrobotics.com/rev-31-1596/',
  'https://www.revrobotics.com/rev-41-1301/',
  'https://www.revrobotics.com/rev-41-1600/',
  'https://www.revrobotics.com/rev-45-1655/',
  'https://www.revrobotics.com/rev-41-1267/',
  'https://www.revrobotics.com/rev-41-1432/',
  'https://www.revrobotics.com/rev-31-1302/',
];

export async function ensureRuntimeDirs() {
  await fsp.mkdir(cacheDir, { recursive: true });
  await fsp.mkdir(uploadDir, { recursive: true });
}
