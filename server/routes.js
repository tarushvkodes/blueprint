import path from 'node:path';

export function registerRoutes(app, {
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
  quoteRule,
  reviewProject,
  searchCatalog,
  smokeTestVertex,
  sponsorEmail,
  state,
  syncRevCatalog,
  upload,
  validateProjectSetup,
  validateGeneratedJava,
}) {
  function projectSummary(project) {
    return {
      id: project.id,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      team: {
        name: project.team?.name,
        number: project.team?.number,
        budget: project.team?.budget,
        experience: project.team?.experience,
      },
      season: project.season?.seasonName || project.season?.title || 'Season pending',
      selectedDesign: project.selectedDesign?.name || null,
      generatedBy: project.generatedBy || 'local-fallback',
      setupValidation: project.setupValidation || null,
    };
  }

  function setupFailure(res, setupValidation) {
    return res.status(400).json({
      error: 'Setup validation failed',
      setupValidation,
    });
  }

  function demoTeamProfile() {
    return defaultTeam({
      name: 'Blue Orbit Demo FTC',
      number: '9026',
      location: 'Ashburn, Virginia',
      experience: 'Intermediate',
      students: 11,
      mentors: 3,
      budget: 1850,
      supplier: 'REV Robotics',
      manual: 'Current FTC manual',
      tools: ['REV Driver Hub', 'basic hand tools', '3D printer', 'calipers', 'soldering kit', 'laptop with FTC SDK'],
      priorities: ['reliable autonomous', 'low cost', 'simple driver control', 'easy maintenance', 'fast inspection'],
      inventory: [
        'REV Starter Kit V3.1',
        'Control Hub',
        'Expansion Hub',
        'HD Hex Motor',
        'UltraPlanetary Gearbox',
        'GoBILDA mecanum wheels',
        'REV 15mm extrusion',
      ],
      timelineWeeks: 6,
      goals: 'Create a demo-ready FTC robot plan that proves strategy, CAD layout, wiring, physics, BOM, budget, Java starter code, autonomous pathing, driver practice, and sponsor materials in one walkthrough.',
      constraints: 'Keep manufacturing approachable for students, stay under budget, avoid legality claims without citations, and keep every generated artifact inspectable during a live demo.',
      strategyMode: 'hybrid',
      strategyNotes: 'Balanced scoring and reliability: prefer a repeatable autonomous preload/park path, conservative scoring cycle, easy field repair, and a BOM that marks owned versus missing hardware.',
      cadExperience: 'Beginner',
      programmingExperience: 'Intermediate',
      buildSpace: 'School makerspace with shared storage and two evening build sessions each week',
    });
  }

  function demoDriverEvents() {
    return [
      { time: 0.2, phase: 'autonomous', gamepad: 'driver1', button: 'right_bumper' },
      { time: 1.1, phase: 'autonomous', gamepad: 'driver1', button: 'right_trigger' },
      { time: 2.0, phase: 'autonomous', gamepad: 'driver1', button: 'a' },
      { time: 31.2, phase: 'teleop', gamepad: 'driver1', button: 'left_bumper' },
      { time: 32.0, phase: 'teleop', gamepad: 'driver2', button: 'a' },
      { time: 32.6, phase: 'teleop', gamepad: 'driver2', button: 'y' },
      { time: 34.0, phase: 'teleop', gamepad: 'driver2', button: 'a' },
      { time: 34.5, phase: 'teleop', gamepad: 'driver2', button: 'y' },
      { time: 36.1, phase: 'teleop', gamepad: 'driver1', button: 'right_bumper' },
      { time: 121.3, phase: 'endgame', gamepad: 'driver2', button: 'x' },
      { time: 122.0, phase: 'endgame', gamepad: 'driver2', button: 'b' },
    ];
  }

  function chatSuggestionsFor(message, project) {
    const text = String(message || '').toLowerCase();
    const suggestions = [];
    if (/cheap|budget|cost|bom|price|parts/.test(text)) {
      suggestions.push({
        id: 'regen-bom',
        label: 'Recalculate BOM',
        description: 'Refresh missing/owned parts, substitutions, and budget totals for the selected design.',
        action: 'regenerate-bom',
      });
      suggestions.push({
        id: 'priority-low-cost',
        label: 'Prioritize low cost',
        description: 'Add low cost to team priorities and rebuild the strategy.',
        action: 'add-priority',
        payload: { priority: 'Low cost' },
      });
    }
    if (/auto|autonomous|park|path/.test(text)) {
      suggestions.push({
        id: 'regen-auto',
        label: 'Regenerate autonomous',
        description: 'Create a fresh drivetrain-matched autonomous plan with current selected design assumptions.',
        action: 'regenerate-autonomous',
      });
    }
    if (/goal|strategy|focus|priority/.test(text)) {
      suggestions.push({
        id: 'set-goal-from-chat',
        label: 'Use as project goal',
        description: 'Save this chat request as the team goal and rebuild strategy guidance.',
        action: 'set-goal',
        payload: { goal: String(message || project.team.goals || '').slice(0, 220) },
      });
    }
    if (/cad|wiring|blueprint|assembly/.test(text)) {
      suggestions.push({
        id: 'open-cad',
        label: 'Open CAD tab',
        description: 'Review 2D views, wiring routes, and conceptual assembly data.',
        action: 'open-tab',
        payload: { tab: 'CAD' },
      });
    }
    return suggestions.length ? suggestions.slice(0, 4) : [
      {
        id: 'regen-bom',
        label: 'Recalculate BOM',
        description: 'Refresh budget and substitutions from the selected mechanism packet.',
        action: 'regenerate-bom',
      },
      {
        id: 'regen-auto',
        label: 'Regenerate autonomous',
        description: 'Refresh autonomous path and tuning constants for the selected drivetrain.',
        action: 'regenerate-autonomous',
      },
      {
        id: 'open-chat-strategy',
        label: 'Review strategy',
        description: 'Open the strategy tab and inspect match-phase recommendations.',
        action: 'open-tab',
        payload: { tab: 'Strategy' },
      },
    ];
  }

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'blueprint-api',
      catalogItems: state.catalog.size,
      documents: state.documents.size,
      chunks: state.chunks.length,
    });
  });

  app.get('/api/ai/status', (_req, res) => {
    res.json(aiStatus());
  });

  app.post('/api/ai/smoke-test', async (_req, res, next) => {
    try {
      res.json(await smokeTestVertex());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/project/demo', (_req, res) => {
    res.json(projectForResponse(demoProject));
  });

  app.post('/api/projects/demo-run', async (_req, res, next) => {
    try {
      const status = aiStatus();
      const useVerifiedVertex = status.ready && Boolean(status.lastOkAt);
      const project = await createProject({ team: demoTeamProfile() }, { skipAi: !useVerifiedVertex });
      if (!useVerifiedVertex && status.ready) {
        project.generatedBy = 'local-fallback';
        project.aiFallbackReason = 'Demo run used the deterministic local generator because Vertex has not passed a smoke test in this server session.';
      }
      project.driverInsight = analyzeDriverLogs(demoDriverEvents());
      project.driverAnalysis = project.driverInsight;
      project.sponsorDraft = sponsorEmail({
        team: project.team,
        contactName: 'Alex Rivera',
        companyName: 'Demo Manufacturing',
        amount: 1000,
      });
      project.sponsorDesk = project.sponsorDraft;
      project.demoScript = [
        'Start on Dashboard and confirm the AI provider, setup readiness, selected concept, and budget.',
        'Open Strategy, Design, BOM, Physics, CAD, Code, Autonomous, Build, Driver Logs, Grants, and Chat in that order.',
        'Use the chat prompt "Make this cheaper and explain what changes" to show actionable suggestions.',
      ];
      project.status = 'demo-ready';
      project.updatedAt = nowIso();
      await persistProjects();
      res.status(201).json(projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects', async (req, res, next) => {
    try {
      const team = defaultTeam(req.body.team || req.body || {});
      const setupValidation = validateProjectSetup(team, currentSeasonSource(), { requireSeason: false });
      if (!setupValidation.ready) return setupFailure(res, setupValidation);
      const project = await createProject(req.body);
      res.status(201).json(projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects', (_req, res) => {
    const projects = Array.from(state.projects.values())
      .filter((project) => !project.transient)
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
      .map(projectSummary);
    res.json({ projects });
  });

  app.get('/api/projects/:id', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(projectForResponse(project));
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.transient) return res.status(400).json({ error: 'Cannot delete the transient demo project.' });
    state.projects.delete(req.params.id);
    await persistProjects();
    res.json({ deleted: true, id: req.params.id });
  });

  app.patch('/api/projects/:id', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.team = defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) });
    project.setupValidation = validateProjectSetup(project.team, project.season || currentSeasonSource(project), { requireSeason: false });
    project.updatedAt = nowIso();
    persistProjects();
    res.json(projectForResponse(project));
  });

  app.post('/api/projects/:id/intake', async (req, res, next) => {
    try {
      const project = state.projects.get(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.team = defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) });
      project.setupValidation = validateProjectSetup(project.team, project.season || currentSeasonSource(project), { requireSeason: false });
      project.updatedAt = nowIso();
      persistProjects();
      res.json(projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-blueprint', async (req, res, next) => {
    try {
      const project = state.projects.get(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.team = defaultTeam({ ...project.team, ...(req.body.team || {}) });
      project.season = currentSeasonSource(project);
      project.setupValidation = validateProjectSetup(project.team, project.season, { requireSeason: false });
      if (!project.setupValidation.ready) return setupFailure(res, project.setupValidation);
      project.strategy = buildStrategy(project.team, project.season);
      project.concepts = buildConcepts(project.team, project.season);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      await applyAiPacket(project);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      project.bom = buildBom(project.team, project.selectedDesign);
      project.physics = calculateMechanisms({ design: project.selectedDesign });
      project.cad = generateCadConcept(project);
      project.code = generateCode(project);
      project.codeValidation = validateGeneratedJava(project.code);
      project.autonomousPlan = buildAutonomousPlan(project);
      project.buildGuide = project.buildGuide || buildGuide(project);
      project.legalChecklist = reviewProject(project).legalChecklist;
      project.review = reviewProject(project);
      project.updatedAt = nowIso();
      persistProjects();
      res.json(projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/documents/ingest-defaults', async (req, res, next) => {
    try {
      const docs = await ingestDefaultReferences();
      const project = state.projects.get(req.params.id);
      if (project) {
        project.documents = docs.map((doc) => doc.id);
        project.updatedAt = nowIso();
        persistProjects();
      }
      res.json({ documents: docs, chunks: state.chunks.length });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/documents/upload', upload.single('file'), async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.pdf') {
        return res.status(400).json({ error: 'Only PDF season/manual resources are supported in this MVP.' });
      }
      const doc = await ingestDocument({
        filePath: req.file.path,
        title: req.body.title || req.file.originalname,
        type: req.body.type || 'season-resource',
        sourceUrl: req.file.originalname,
        version: req.body.version || null,
        sourceDate: req.body.sourceDate || null,
      });
      const project = state.projects.get(req.params.id);
      if (project) {
        project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
        project.season = currentSeasonSource(project);
        project.team.manual = doc.seasonSource?.title || doc.title;
        project.review = reviewProject(project);
        project.legalChecklist = project.review.legalChecklist;
        project.updatedAt = nowIso();
        persistProjects();
      }
      res.status(201).json({ document: doc, project: project ? projectForResponse(project) : null });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/documents/ingest-url', async (req, res, next) => {
    try {
      const project = state.projects.get(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const url = String(req.body?.url || '').trim();
      if (!url) return res.status(400).json({ error: 'Document URL is required.' });
      const doc = await ingestDocumentFromUrl({
        url,
        title: req.body?.title || null,
        type: req.body?.type || null,
        version: req.body?.version || null,
        sourceDate: req.body?.sourceDate || null,
      });
      project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
      project.season = currentSeasonSource(project);
      if (doc.seasonSource) project.team.manual = doc.seasonSource.title || doc.title;
      project.review = reviewProject(project);
      project.legalChecklist = project.review.legalChecklist;
      project.updatedAt = nowIso();
      persistProjects();
      res.status(201).json({ document: doc, project: projectForResponse(project) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/documents', (_req, res) => {
    res.json(Array.from(state.documents.values()));
  });

  app.get('/api/projects/:id/rules/search', (req, res) => {
    res.json({ query: req.query.q || '', citations: quoteRule(String(req.query.q || 'robot construction')) });
  });

  app.post('/api/catalog/sync', async (req, res, next) => {
    try {
      const products = await syncRevCatalog({ query: req.body?.query || 'ftc', limit: Number(req.body?.limit || 30) });
      res.json({ synced: products.filter((product) => !product.error).length, products, errors: products.filter((product) => product.error) });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/catalog/search', (req, res) => {
    res.json({ query: req.query.q || '', products: searchCatalog(String(req.query.q || ''), Number(req.query.limit || 20)) });
  });

  app.get('/api/catalog/products/:sku', (req, res) => {
    const product = state.catalog.get(req.params.sku.toUpperCase());
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  });

  app.post('/api/projects/:id/generate-strategies', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.strategy = buildStrategy({ ...project.team, ...(req.body || {}) });
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.strategy);
  });

  app.post('/api/projects/:id/generate-designs', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.concepts = buildConcepts({ ...project.team, ...(req.body || {}) });
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.concepts);
  });

  app.post('/api/projects/:id/select-design', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.selectedDesign = project.concepts.find((concept) => concept.id === req.body.designId) || project.concepts[1];
    project.bom = buildBom(project.team, project.selectedDesign);
    project.physics = calculateMechanisms({ design: project.selectedDesign });
    project.cad = generateCadConcept(project);
    project.code = generateCode(project);
    project.codeValidation = validateGeneratedJava(project.code);
    project.autonomousPlan = buildAutonomousPlan(project);
    project.buildGuide = buildGuide(project);
    project.legalChecklist = reviewProject(project).legalChecklist;
    project.review = reviewProject(project);
    project.updatedAt = nowIso();
    persistProjects();
    res.json(projectForResponse(project));
  });

  app.post('/api/projects/:id/generate-bom', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.bom = buildBom({ ...project.team, ...(req.body.team || {}) }, req.body.designId ? req.body.designId : project.selectedDesign);
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.bom);
  });

  app.patch('/api/projects/:id/bom/overrides', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const key = String(req.body?.key || '').trim();
    if (!key) return res.status(400).json({ error: 'BOM override key is required.' });
    const override = req.body?.override || {};
    project.team = defaultTeam({
      ...project.team,
      bomOverrides: {
        ...(project.team.bomOverrides || {}),
        [key]: override,
      },
    });
    project.bom = buildBom(project.team, project.selectedDesign);
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(projectForResponse(project));
  });

  app.post('/api/projects/:id/calculate/mechanism', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.physics = calculateMechanisms(req.body);
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.physics);
  });

  app.get('/api/projects/:id/calculations', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.physics);
  });

  app.post('/api/projects/:id/generate-cad', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.cad = generateCadConcept({ ...project, cadInputs: req.body });
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.cad);
  });

  app.get('/api/projects/:id/cad', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.cad);
  });

  app.get('/api/projects/:id/cad/export', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.type('text/plain').send(JSON.stringify(project.cad, null, 2));
  });

  app.get('/api/projects/:id/cad/export.concept.json', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.attachment(cadExportName(project, 'concept.json'));
    res.type('application/json').send(JSON.stringify(cadAsConceptJson(project), null, 2));
  });

  app.get('/api/projects/:id/cad/export.concept.step', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.attachment(cadExportName(project, 'concept.step'));
    res.type('text/plain').send(cadAsStep(project));
  });

  app.get('/api/projects/:id/cad/export.glb', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.set('X-Blueprint-Artifact-Notice', 'Concept JSON artifact; real GLB mesh export is not implemented in the MVP.');
    res.attachment(cadExportName(project, 'concept.json'));
    res.type('application/json').send(JSON.stringify(cadAsConceptJson(project), null, 2));
  });

  app.get('/api/projects/:id/cad/export.step', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.set('X-Blueprint-Artifact-Notice', 'Concept STEP-like note; manufacturing-ready STEP export is not implemented in the MVP.');
    res.attachment(cadExportName(project, 'concept.step'));
    res.type('text/plain').send(cadAsStep(project));
  });

  app.post('/api/projects/:id/generate-code', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.code = generateCode({ ...project, codeInputs: req.body });
    project.codeValidation = validateGeneratedJava(project.code);
    project.autonomousPlan = buildAutonomousPlan(project, req.body?.autonomous || {});
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.code);
  });

  app.post('/api/projects/:id/autonomous-plan', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.autonomousPlan = buildAutonomousPlan(project, req.body || {});
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.autonomousPlan);
  });

  app.get('/api/projects/:id/autonomous-plan', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.autonomousPlan = project.autonomousPlan || buildAutonomousPlan(project);
    res.json(project.autonomousPlan);
  });

  app.get('/api/projects/:id/code', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.code);
  });

  app.get('/api/projects/:id/code/validate', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.codeValidation = validateGeneratedJava(project.code || {});
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.codeValidation);
  });

  app.get('/api/projects/:id/code/export.zip', (req, res, next) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-FTC-code.zip`);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', next);
    archive.pipe(res);
    for (const [file, content] of Object.entries(project.code || {})) {
      archive.append(content, { name: `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/${file}` });
    }
    archive.finalize();
  });

  app.post('/api/projects/:id/generate-build-guide', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.buildGuide = buildGuide({ ...project, buildInputs: req.body });
    project.review = reviewProject(project);
    project.legalChecklist = project.review.legalChecklist;
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.buildGuide);
  });

  app.get('/api/projects/:id/build-guide', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project.buildGuide);
  });

  app.get('/api/projects/:id/build-guide/export.html', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-build-guide.html`);
    res.type('html').send(buildGuideHtml(project));
  });

  app.get('/api/projects/:id/export.json', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-blueprint.json`);
    res.json(projectForResponse(project));
  });

  app.get('/api/projects/:id/prompts', (req, res) => {
    const project = state.projects.get(req.params.id) || demoProject;
    res.json(buildAgentPrompts(project));
  });

  app.post('/api/projects/:id/agents/review-plan', (req, res) => {
    const project = state.projects.get(req.params.id) || demoProject;
    const prompts = buildAgentPrompts(project);
    res.json({
      projectContext: prompts.context,
      executionOrder: prompts.agents.map((agent) => agent.name),
      reviewGates: [
        'Rules Agent must cite official manual chunks before legality claims.',
        'Physics Agent must produce assumptions and safety factor for every motorized mechanism.',
        'Parts Agent must include SKU, product URL, lastChecked, and budget effect.',
        'Review Agent must block final output if code hardware names do not match generated hardware guide.',
      ],
      modelAdapterPayload: {
        system: prompts.system,
        messages: prompts.agents.map((agent) => ({ role: 'user', content: agent.prompt })),
        structuredOutput: true,
        note: 'This endpoint prepares prompts for the model adapter and review workflow. Live generation uses the configured Vertex provider when available.',
      },
      requestedTask: req.body?.task || 'Generate complete project plan',
    });
  });

  app.post('/api/projects/:id/driver-logs/analyze', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.driverInsight = analyzeDriverLogs(req.body.logs || req.body.events || req.body.csv || []);
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.driverInsight);
  });

  app.post('/api/teams/:id/sponsor-email', (req, res) => {
    const project = Array.from(state.projects.values()).find((candidate) => candidate.team.number === req.params.id || candidate.team.name === req.params.id) || demoProject;
    res.json(sponsorEmail({ team: project.team, ...req.body }));
  });

  app.post('/api/teams/:id/grant-draft', (req, res) => {
    const project = Array.from(state.projects.values()).find((candidate) => candidate.team.number === req.params.id || candidate.team.name === req.params.id) || demoProject;
    res.json({
      title: `${project.team.name} FTC Robotics Grant Request`,
      requestedAmount: req.body.amount || 1000,
      needStatement: `${project.team.name} needs funding for competition registration, REV Robotics parts, spare components, and outreach materials.`,
      budgetJustification: project.bom,
      impact: 'Funding reduces the burden on students and helps the team build a safe, legal, well-documented robot while learning engineering fundamentals.',
    });
  });

  app.post('/api/projects/:id/chat', async (req, res) => {
    const project = state.projects.get(req.params.id) || demoProject;
    const message = String(req.body?.message || '');
    const goalMatch = message.trim().match(/^\/goal(?:\s+([\s\S]+))?$/i);
    if (goalMatch) {
      const goal = goalMatch[1]?.trim();
      if (!goal) {
        return res.status(400).json({
          answer: 'Add the goal after /goal.',
          generatedBy: 'local-command',
          command: 'goal',
          suggestedActions: ['/goal Build a reliable low-cost robot with simple autonomous'],
        });
      }

      project.team.goals = goal;
      project.updatedAt = nowIso();
      project.strategy = buildStrategy(project.team, project.season || currentSeasonSource(project));
      if (!project.transient) persistProjects();

      return res.json({
        answer: `Goal updated: ${goal}`,
        generatedBy: 'local-command',
        command: 'goal',
        project: projectForResponse(project),
        suggestedActions: chatSuggestionsFor(goal, project),
      });
    }

    const citations = quoteRule(message);
    const catalogHits = searchCatalog(message, 3);
    const ai = await callVertexJson({
      prompt: [
        'Return JSON: { "answer": string, "suggestedActions": string[] }.',
        'You are Blueprint. Answer using the project context. Do not make legality claims without citations.',
        `Question: ${message}`,
        `Team: ${JSON.stringify(project.team)}`,
        `Season: ${JSON.stringify(project.season || currentSeasonSource(project))}`,
        `Citations available: ${JSON.stringify(citations)}`,
      ].join('\n\n'),
    });
    res.json({
      answer: ai.ok
        ? ai.data.answer
        : `For ${project.team.name}: ${message ? `I would handle "${message}" by checking indexed rules first, then updating the relevant BOM, calculation, code, CAD, or build-guide artifact.` : 'Ask about strategy, legality, parts, torque, code, CAD, grants, or driver logs.'} I will not make a definitive legality claim without the cited manual section and version.`,
      citations,
      catalogHits,
      generatedBy: ai.generatedBy,
      suggestedActions: chatSuggestionsFor(message, project),
    });
  });

  app.post('/api/projects/:id/chat/apply', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const suggestion = req.body?.suggestion || {};
    const action = suggestion.action;
    if (action === 'set-goal') {
      project.team.goals = String(suggestion.payload?.goal || project.team.goals || '').slice(0, 240);
      project.strategy = buildStrategy(project.team, project.season || currentSeasonSource(project));
    } else if (action === 'add-priority') {
      const priority = String(suggestion.payload?.priority || '').trim();
      project.team.priorities = Array.from(new Set([...(project.team.priorities || []), priority].filter(Boolean)));
      project.strategy = buildStrategy(project.team, project.season || currentSeasonSource(project));
    } else if (action === 'regenerate-bom') {
      project.bom = buildBom(project.team, project.selectedDesign);
      project.review = reviewProject(project);
      project.legalChecklist = project.review.legalChecklist;
    } else if (action === 'regenerate-autonomous') {
      project.autonomousPlan = buildAutonomousPlan(project);
    } else {
      return res.status(400).json({ error: 'Unsupported chat suggestion action.' });
    }
    project.updatedAt = nowIso();
    persistProjects();
    res.json({ applied: true, message: `${suggestion.label || 'Suggestion'} applied`, project: projectForResponse(project) });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  });
}
