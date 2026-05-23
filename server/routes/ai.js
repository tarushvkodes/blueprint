import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendAuditEntry, listArtifacts, readArtifact, readAuditEntries, writeArtifact } from '../modules/agents/artifacts.js';
import { runReviewAgent } from '../modules/agents/review.js';
import {
  blueprintPacketSchema,
  bomSchema,
  buildGuideSchema,
  chatSchema,
  codeSchema,
  conceptsSchema,
  physicsSchema,
  reviewVerdictSchema,
} from '../modules/agents/schemas/index.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function projectAiPrompt(project, projects) {
  const season = projects.currentSeasonSource(project);
  return [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Return only valid JSON. Make a year-agnostic FTC robot packet from the season/manual facts and team requirements.',
    'Never make definitive legality claims. Include citations when rule-sensitive.',
    'JSON shape: { strategy, concepts, buildGuide, chatSeed }.',
    'strategy: { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility }.',
    'concepts: exactly 3 items with id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath.',
    'buildGuide: 6-10 Lego-like steps with phase, title, parts, tools, time, diagram, instructions, checkpoint, commonMistake, test.',
    `Team: ${JSON.stringify(project.team)}`,
    `Season source: ${JSON.stringify({
      seasonName: season.seasonName,
      manualVersion: season.manualVersion,
      scoringSummary: season.scoringSummary,
      pointValues: season.pointValues,
      robotConstraints: season.robotConstraints,
      fieldFacts: season.fieldFacts,
    })}`,
  ].join('\n\n');
}

function codeArtifactFromMap(code = {}) {
  return {
    files: Object.entries(code).map(([fileName, content]) => ({
      fileName,
      language: fileName.endsWith('.java') ? 'java' : 'markdown',
      content,
    })),
    hardwareConfigurationChecklist: ['left_front', 'right_front', 'left_back', 'right_back', 'lift_motor', 'intake_servo'],
  };
}

function buildPlan(project) {
  return {
    strategy: project.strategy,
    concepts: project.concepts,
    selectedDesign: project.selectedDesign,
    bom: project.bom,
    physics: project.physics,
    cad: project.cad,
    code: codeArtifactFromMap(project.code),
    buildGuide: project.buildGuide,
  };
}

async function auditModelResult({ projectId, type, result }) {
  await appendAuditEntry({
    rootDir,
    projectId,
    entry: {
      type,
      adapterName: result.adapterName,
      model: result.model,
      schemaName: result.schemaName,
      ok: result.ok,
      prompt: result.prompt,
      response: result.data || result.verdict || null,
      error: result.error || result.fallbackReason || null,
    },
  });
}

async function persistArtifact({ projectId, artifactName, payload, prompt, adapterName, model, schemaName, schema }) {
  const parsedPayload = schema.parse(payload);
  const artifact = await writeArtifact({
    rootDir,
    projectId,
    artifactName,
    payload: parsedPayload,
    prompt,
    adapterName,
    model,
    schemaName,
  });
  await appendAuditEntry({
    rootDir,
    projectId,
    entry: {
      type: 'artifact',
      artifactName,
      adapterName,
      model,
      schemaName,
      prompt,
      response: parsedPayload,
      artifactFile: artifact.filename,
    },
  });
  return artifact;
}

function promptForSchema(schemaAwarePrompts, schemaName, fallbackPrompt) {
  return schemaAwarePrompts.agents.find((agent) => agent.schemaName === schemaName)?.prompt || fallbackPrompt;
}

async function loadProjectOrDemo(projects, getDemoProject, id) {
  const loaded = await projects.loadProject(id);
  if (loaded) return loaded;
  if (id === 'demo') {
    const demo = getDemoProject();
    demo.id = 'demo';
    return demo;
  }
  return null;
}

export default function register(app, deps) {
  const {
    ai,
    build,
    cad,
    chat,
    code,
    physics,
    projects,
    rules,
    catalogApi,
    nowIso,
    getDemoProject,
  } = deps;

  app.get('/api/ai/status', (_req, res) => {
    res.json(ai.aiStatus());
  });

  app.post('/api/projects/:id/generate-blueprint', async (req, res, next) => {
    try {
      const project = await loadProjectOrDemo(projects, getDemoProject, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      project.id = req.params.id;
      project.team = projects.defaultTeam({ ...project.team, ...(req.body.team || {}) });
      project.season = projects.currentSeasonSource(project);
      project.strategy = projects.buildStrategy(project.team, project.season);
      project.concepts = projects.buildConcepts(project.team, project.season);
      project.selectedDesign = project.concepts[1] || project.concepts[0];

      const prompt = projectAiPrompt(project, projects);
      const packetResult = await ai.generateJsonWithMetadata(prompt, blueprintPacketSchema, {
        schemaName: 'BlueprintPacket',
        projectId: project.id,
        context: { team: project.team },
      });
      await auditModelResult({ projectId: project.id, type: 'adapter.generateJson', result: packetResult });

      if (packetResult.ok) {
        project.strategy = packetResult.data.strategy;
        project.concepts = packetResult.data.concepts;
        project.buildGuide = packetResult.data.buildGuide.map((step) => ({ ...step, generatedBy: packetResult.generatedBy }));
        project.generatedBy = packetResult.generatedBy;
        project.aiFallbackReason = packetResult.fallbackReason || null;
      } else {
        project.generatedBy = 'local-fallback';
        project.aiFallbackReason = packetResult.error;
      }

      project.selectedDesign = project.concepts[1] || project.concepts[0];
      project.bom = projects.buildBom(project.team, project.selectedDesign.id);
      project.physics = physics.calculateMechanisms();
      project.cad = cad.generateCadConcept(project);
      project.code = code.generateCode(project);
      project.buildGuide = project.buildGuide || build.buildGuide(project);

      const projectContext = projects.buildAgentPrompts(project).context;
      const review = await runReviewAgent({
        ai,
        plan: buildPlan(project),
        projectContext,
        projectId: project.id,
      });
      await auditModelResult({ projectId: project.id, type: 'review.generateJson', result: review });

      project.reviewVerdict = review.verdict;
      if (packetResult.adapterName === 'vertex-express') {
        project.generatedBy = review.verdict?.passed ? 'vertex-express' : 'vertex-with-review-issues';
      } else {
        project.generatedBy = 'local-fallback';
      }
      project.reviewIssues = review.verdict?.issues || [];
      project.updatedAt = nowIso();
      await projects.saveProject(project);

      const schemaAwarePrompts = ai.buildSchemaAwarePrompts(projects.buildAgentPrompts(project));
      const adapterName = packetResult.adapterName || project.generatedBy;
      const model = packetResult.model || ai.adapterInfo().model;
      await persistArtifact({
        projectId: project.id,
        artifactName: 'concepts',
        payload: { concepts: project.concepts },
        prompt: promptForSchema(schemaAwarePrompts, 'Concepts', packetResult.prompt),
        adapterName,
        model,
        schemaName: 'Concepts',
        schema: conceptsSchema,
      });
      await persistArtifact({
        projectId: project.id,
        artifactName: 'bom',
        payload: project.bom,
        prompt: promptForSchema(schemaAwarePrompts, 'Bom', 'Generate BOM from selected concept.'),
        adapterName,
        model,
        schemaName: 'Bom',
        schema: bomSchema,
      });
      await persistArtifact({
        projectId: project.id,
        artifactName: 'physics',
        payload: { calculations: project.physics },
        prompt: promptForSchema(schemaAwarePrompts, 'Physics', 'Generate mechanism physics calculations.'),
        adapterName,
        model,
        schemaName: 'Physics',
        schema: physicsSchema,
      });
      await persistArtifact({
        projectId: project.id,
        artifactName: 'build-guide',
        payload: { buildSteps: project.buildGuide },
        prompt: promptForSchema(schemaAwarePrompts, 'BuildGuide', 'Generate build guide steps.'),
        adapterName,
        model,
        schemaName: 'BuildGuide',
        schema: buildGuideSchema,
      });
      await persistArtifact({
        projectId: project.id,
        artifactName: 'code',
        payload: codeArtifactFromMap(project.code),
        prompt: promptForSchema(schemaAwarePrompts, 'Code', 'Generate FTC SDK Java code.'),
        adapterName,
        model,
        schemaName: 'Code',
        schema: codeSchema,
      });
      await persistArtifact({
        projectId: project.id,
        artifactName: 'review',
        payload: review.verdict,
        prompt: review.prompt,
        adapterName: review.adapterName,
        model: review.model,
        schemaName: 'ReviewVerdict',
        schema: reviewVerdictSchema,
      });

      const response = projects.projectForResponse(project);
      if (!review.verdict?.passed) response.issues = review.verdict?.issues || [];
      res.json(response);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/prompts', async (req, res, next) => {
    try {
      const project = await loadProjectOrDemo(projects, getDemoProject, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(ai.buildSchemaAwarePrompts(projects.buildAgentPrompts(project)));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/artifacts', async (req, res, next) => {
    try {
      const artifacts = await listArtifacts({ rootDir, projectId: req.params.id });
      res.json({ projectId: req.params.id, artifacts });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/artifacts/:filename', async (req, res, next) => {
    try {
      const artifact = await readArtifact({ rootDir, projectId: req.params.id, filename: req.params.filename });
      if (!artifact) return res.status(404).json({ error: 'Artifact not found' });
      res.json(artifact);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/audit', async (req, res, next) => {
    try {
      const entries = await readAuditEntries({ rootDir, projectId: req.params.id, limit: req.query.limit });
      res.json({ projectId: req.params.id, entries });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/chat', async (req, res, next) => {
    try {
      const project = await loadProjectOrDemo(projects, getDemoProject, req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const message = String(req.body?.message || '');
      const citations = rules.quoteRule(message);
      const catalogHits = catalogApi.searchCatalog(message, 3);
      const prompt = [
        'Return JSON: { "answer": string, "suggestedActions": string[] }.',
        'You are Blueprint. Answer using the project context. Do not make legality claims without citations.',
        `Question: ${message}`,
        `Team: ${JSON.stringify(project.team)}`,
        `Season: ${JSON.stringify(project.season || projects.currentSeasonSource(project))}`,
        `Citations available: ${JSON.stringify(citations)}`,
      ].join('\n\n');
      const result = await ai.generateJsonWithMetadata(prompt, chatSchema, {
        schemaName: 'Chat',
        projectId: project.id,
        context: { project, message, citations },
      });
      await auditModelResult({ projectId: project.id, type: 'chat.generateJson', result });

      const payload = result.ok
        ? result.data
        : {
            answer: chat.buildFallbackChatAnswer({ project, message }),
            suggestedActions: ['search rules', 'recalculate mechanism', 'regenerate BOM', 'update code artifact'],
          };
      await persistArtifact({
        projectId: project.id,
        artifactName: 'chat',
        payload,
        prompt: result.prompt,
        adapterName: result.adapterName,
        model: result.model,
        schemaName: 'Chat',
        schema: chatSchema,
      });
      res.json({
        answer: payload.answer,
        citations,
        catalogHits,
        generatedBy: result.generatedBy,
        suggestedActions: payload.suggestedActions,
      });
    } catch (error) {
      next(error);
    }
  });
}
