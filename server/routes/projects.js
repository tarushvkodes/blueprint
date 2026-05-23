export default function register(app, deps) {
  const {
    projects,
    build,
    cad,
    code,
    physics,
    nowIso,
    getDemoProject,
  } = deps;

  app.get('/api/project/demo', (_req, res) => {
    res.json(projects.projectForResponse(getDemoProject()));
  });

  app.post('/api/projects', async (req, res, next) => {
    try {
      const project = await projects.createProject(req.body);
      res.status(201).json(projects.projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      Object.assign(project.team, projects.defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) }));
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(projects.projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/intake', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.team = projects.defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) });
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(projects.projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-blueprint', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.team = projects.defaultTeam({ ...project.team, ...(req.body.team || {}) });
      project.season = projects.currentSeasonSource(project);
      project.strategy = projects.buildStrategy(project.team, project.season);
      project.concepts = projects.buildConcepts(project.team, project.season);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      await projects.applyAiPacket(project);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      project.bom = projects.buildBom(project.team, project.selectedDesign.id);
      project.physics = physics.calculateMechanisms();
      project.cad = cad.generateCadConcept(project);
      project.code = code.generateCode(project);
      project.buildGuide = project.buildGuide || build.buildGuide(project);
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(projects.projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-strategies', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.strategy = projects.buildStrategy({ ...project.team, ...(req.body || {}) });
      await projects.saveProject(project);
      res.json(project.strategy);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-designs', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.concepts = projects.buildConcepts({ ...project.team, ...(req.body || {}) });
      await projects.saveProject(project);
      res.json(project.concepts);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/select-design', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.selectedDesign = project.concepts.find((concept) => concept.id === req.body.designId) || project.concepts[1];
      project.bom = projects.buildBom(project.team, project.selectedDesign.id);
      project.cad = cad.generateCadConcept(project);
      project.code = code.generateCode(project);
      project.buildGuide = build.buildGuide(project);
      await projects.saveProject(project);
      res.json(project);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-bom', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.bom = projects.buildBom({ ...project.team, ...(req.body.team || {}) }, req.body.designId || project.selectedDesign?.id);
      await projects.saveProject(project);
      res.json(project.bom);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/export.json', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-blueprint.json`);
      res.json(projects.projectForResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/prompts', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id) || getDemoProject();
      res.json(projects.buildAgentPrompts(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/agents/review-plan', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id) || getDemoProject();
      const prompts = projects.buildAgentPrompts(project);
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
          note: 'This endpoint prepares prompts for the app model adapter; it does not call a hosted LLM in local MVP mode.',
        },
        requestedTask: req.body?.task || 'Generate complete project plan',
      });
    } catch (error) {
      next(error);
    }
  });
}
