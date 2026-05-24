import { createRequire } from 'node:module';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { aiStatus, callVertexJson, smokeTestVertex } from './ai.js';
import { loadCachedCatalog, searchCatalog, syncRevCatalog } from './catalog.js';
import { ensureRuntimeDirs, port, uploadDir } from './config.js';
import { ingestDefaultReferences, ingestDocument, ingestDocumentFromUrl, quoteRule } from './documents.js';
import { cadAsConceptJson, cadAsStep, cadExportName, generateCadConcept } from './generators/cad.js';
import { generateCode } from './generators/code.js';
import {
  analyzeDriverLogs,
  applyAiPacket,
  buildAgentPrompts,
  buildBom,
  buildConcepts,
  buildGuide,
  buildGuideHtml,
  buildAutonomousPlan,
  buildStrategy,
  calculateMechanisms,
  createProject,
  currentSeasonSource,
  defaultTeam,
  persistProjects,
  projectForResponse,
  reviewProject,
  validateProjectSetup,
  sponsorEmail,
} from './generators/project.js';
import { validateGeneratedJava } from './javaValidation.js';
import { restoreProjectSnapshots } from './persistence.js';
import { registerRoutes } from './routes.js';
import { state } from './state.js';
import { nowIso } from './utils.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

await ensureRuntimeDirs();
await loadCachedCatalog();
await ingestDefaultReferences().catch((error) => console.warn('Reference ingestion skipped:', error.message));
await restoreProjectSnapshots(state.projects).catch((error) => console.warn('Project restore skipped:', error.message));

if (state.catalog.size === 0 && process.env.BLUEPRINT_SKIP_INITIAL_CATALOG_SYNC !== '1') {
  syncRevCatalog({ limit: 12 }).catch((error) => console.warn('Initial REV catalog sync skipped:', error.message));
}

const app = express();
const upload = multer({ dest: uploadDir });
const demoProject = await createProject({}, { transient: true, skipAi: true });

async function refreshDemoProjectWithAi() {
  await applyAiPacket(demoProject);
  demoProject.season = currentSeasonSource(demoProject);
  demoProject.selectedDesign = demoProject.concepts[1] || demoProject.concepts[0];
  demoProject.bom = buildBom(demoProject.team, demoProject.selectedDesign);
  demoProject.physics = calculateMechanisms({ design: demoProject.selectedDesign });
  demoProject.cad = generateCadConcept(demoProject);
  demoProject.code = generateCode(demoProject);
  demoProject.codeValidation = validateGeneratedJava(demoProject.code);
  demoProject.autonomousPlan = buildAutonomousPlan(demoProject);
  demoProject.buildGuide = buildGuide(demoProject);
  demoProject.legalChecklist = reviewProject(demoProject).legalChecklist;
  demoProject.review = reviewProject(demoProject);
  demoProject.updatedAt = nowIso();
}

app.use(cors());
app.use(express.json({ limit: '20mb' }));

registerRoutes(app, {
  aiStatus,
  analyzeDriverLogs,
  applyAiPacket,
  archiver,
  buildAgentPrompts,
  buildBom,
  buildConcepts,
  buildGuide,
  buildGuideHtml,
  buildAutonomousPlan,
  buildStrategy,
  cadAsConceptJson,
  cadAsStep,
  cadExportName,
  callVertexJson,
  calculateMechanisms,
  createProject,
  currentSeasonSource,
  defaultTeam,
  demoProject,
  generateCadConcept,
  generateCode,
  ingestDefaultReferences,
  ingestDocument,
  ingestDocumentFromUrl,
  nowIso,
  persistProjects,
  projectForResponse,
  reviewProject,
  quoteRule,
  searchCatalog,
  sponsorEmail,
  smokeTestVertex,
  state,
  syncRevCatalog,
  upload,
  validateProjectSetup,
  validateGeneratedJava,
});

app.listen(port, () => {
  console.log(`Blueprint API running on http://localhost:${port}`);
  refreshDemoProjectWithAi().catch((error) => {
    demoProject.generatedBy = 'local-fallback';
    demoProject.aiFallbackReason = error.message;
    console.warn('Demo AI refresh skipped:', error.message);
  });
});
