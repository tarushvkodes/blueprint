import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import cors from 'cors';
import multer from 'multer';

import { createAiModule } from './modules/ai.js';
import { createCatalogModule } from './modules/catalog.js';
import { generateCode } from './modules/code.js';
import { createDocumentModule } from './modules/documents.js';
import { createProjectModule } from './modules/generators.js';
import { calculateMechanisms } from './modules/physics.js';
import { createProjectStore } from './modules/persistence.js';
import { createRulesModule } from './modules/rules.js';
import { buildGuide, buildGuideHtml } from './modules/build.js';
import { cadAsGltf, cadAsStep, cadExportName, generateCadConcept } from './modules/cad.js';
import { analyzeDriverLogs } from './modules/drivers.js';
import { grantDraft, sponsorEmail } from './modules/grants.js';
import { buildFallbackChatAnswer } from './modules/chat.js';
import { normalizeWhitespace, nowIso, scoreText, slugId } from './modules/utils.js';

import registerHealthRoutes from './routes/health.js';
import registerAiRoutes from './routes/ai.js';
import registerProjectsRoutes from './routes/projects.js';
import registerDocumentsRoutes from './routes/documents.js';
import registerCatalogRoutes from './routes/catalog.js';
import registerCodeRoutes from './routes/code.js';
import registerCadRoutes from './routes/cad.js';
import registerBuildRoutes from './routes/build.js';
import registerPhysicsRoutes from './routes/physics.js';
import registerChatRoutes from './routes/chat.js';
import registerDriversRoutes from './routes/drivers.js';
import registerGrantsRoutes from './routes/grants.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, '.cache');
const uploadDir = path.join(rootDir, 'uploads');

function loadEnvFile() {
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

const DEFAULT_FILES = {
  writeup: '/Users/tarushvkosgi/Downloads/writeup.pdf',
  manual: '/Users/tarushvkosgi/Downloads/DECODE_Competition_Manual_TU32.pdf',
};

const seedRevUrls = [
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

const app = express();
const port = process.env.API_PORT || 8787;

await fsp.mkdir(cacheDir, { recursive: true });
await fsp.mkdir(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const upload = multer({ dest: uploadDir });
const documents = new Map();
const chunksRef = { value: [] };
const catalog = new Map();
const aiState = { lastError: null };

const vertexConfig = {
  apiKey: process.env.VERTEX_AI_API_KEY || '',
  textModel: process.env.VERTEX_TEXT_MODEL || 'gemini-2.5-flash',
  imageModel: process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image',
};

const projectStore = createProjectStore({ rootDir });
const ai = createAiModule({ vertexConfig, aiState });
const rules = createRulesModule({ chunksRef, normalizeWhitespace, scoreText });
const documentsApi = createDocumentModule({
  defaultFiles: DEFAULT_FILES,
  documents,
  chunksRef,
  normalizeWhitespace,
  nowIso,
  slugId,
});
const catalogApi = createCatalogModule({
  seedRevUrls,
  cacheDir,
  catalog,
  nowIso,
  normalizeWhitespace,
  scoreText,
});
const projects = createProjectModule({
  documents,
  getCatalogSize: () => catalog.size,
  findCatalogPart: (...queries) => catalogApi.findCatalogPart(...queries),
  quoteRule: rules.quoteRule,
  callVertexJson: ai.callVertexJson,
  aiStatus: ai.aiStatus,
  generateCadConcept,
  generateCode,
  buildGuide,
  calculateMechanisms,
  analyzeDriverLogs,
  sponsorEmail,
  projectStore,
  nowIso,
  slugId,
});

await projects.listProjects();
await catalogApi.loadCachedCatalog();
await documentsApi.ingestDefaultReferences().catch((error) => console.warn('Reference ingestion skipped:', error.message));
if (catalog.size === 0) {
  catalogApi.syncRevCatalog({ limit: 12 }).catch((error) => console.warn('Initial REV catalog sync skipped:', error.message));
}
const demoProject = await projects.createProject({}, { persist: false });

const deps = {
  nowIso,
  upload,
  archiver,
  documents,
  chunksRef,
  catalog,
  ai,
  rules,
  documentsApi,
  catalogApi,
  projects,
  physics: { calculateMechanisms },
  build: { buildGuide, buildGuideHtml },
  code: { generateCode },
  cad: { generateCadConcept, cadExportName, cadAsGltf, cadAsStep },
  drivers: { analyzeDriverLogs },
  grants: { sponsorEmail, grantDraft },
  chat: { buildFallbackChatAnswer },
  getDemoProject: () => demoProject,
};

registerHealthRoutes(app, deps);
registerAiRoutes(app, deps);
registerProjectsRoutes(app, deps);
registerDocumentsRoutes(app, deps);
registerCatalogRoutes(app, deps);
registerCodeRoutes(app, deps);
registerCadRoutes(app, deps);
registerBuildRoutes(app, deps);
registerPhysicsRoutes(app, deps);
registerChatRoutes(app, deps);
registerDriversRoutes(app, deps);
registerGrantsRoutes(app, deps);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Blueprint API running on http://localhost:${port}`);
});
