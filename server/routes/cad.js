export default function register(app, deps) {
  const { projects, cad, nowIso } = deps;

  app.post('/api/projects/:id/generate-cad', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.cad = cad.generateCadConcept({ ...project, cadInputs: req.body });
      await projects.saveProject(project);
      res.json(project.cad);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/cad', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project.cad);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/cad/export', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.type('text/plain').send(JSON.stringify(project.cad, null, 2));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/cad/export.glb', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(cad.cadExportName(project, 'glb'));
      res.type('model/gltf+json').send(JSON.stringify(cad.cadAsGltf(project), null, 2));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/cad/export.step', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(cad.cadExportName(project, 'step'));
      res.type('model/step').send(cad.cadAsStep(project, nowIso));
    } catch (error) {
      next(error);
    }
  });
}
