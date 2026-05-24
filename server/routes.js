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
  nowIso,
  persistProjects,
  projectForResponse,
  quoteRule,
  searchCatalog,
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

  app.get('/api/project/demo', (_req, res) => {
    res.json(projectForResponse(demoProject));
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
      project.buildGuide = project.buildGuide || buildGuide(project);
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
      });
      const project = state.projects.get(req.params.id);
      if (project) {
        project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
        project.season = currentSeasonSource(project);
        project.team.manual = doc.seasonSource?.title || doc.title;
        project.updatedAt = nowIso();
        persistProjects();
      }
      res.status(201).json({ document: doc, project: project ? projectForResponse(project) : null });
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
    project.buildGuide = buildGuide(project);
    project.updatedAt = nowIso();
    persistProjects();
    res.json(projectForResponse(project));
  });

  app.post('/api/projects/:id/generate-bom', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.bom = buildBom({ ...project.team, ...(req.body.team || {}) }, req.body.designId ? req.body.designId : project.selectedDesign);
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.bom);
  });

  app.post('/api/projects/:id/calculate/mechanism', (req, res) => {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.physics = calculateMechanisms(req.body);
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
    project.updatedAt = nowIso();
    persistProjects();
    res.json(project.code);
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
        suggestedActions: ['Generate blueprint', 'Review strategy', 'Ask follow-up'],
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
      suggestedActions: ai.ok ? ai.data.suggestedActions || [] : ['search rules', 'recalculate mechanism', 'regenerate BOM', 'update code artifact'],
    });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  });
}
