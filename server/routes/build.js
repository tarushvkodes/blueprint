export default function register(app, deps) {
  const { projects, build } = deps;

  app.post('/api/projects/:id/generate-build-guide', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.buildGuide = build.buildGuide({ ...project, buildInputs: req.body });
      await projects.saveProject(project);
      res.json(project.buildGuide);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/build-guide', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project.buildGuide);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/build-guide/export.html', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-build-guide.html`);
      res.type('html').send(build.buildGuideHtml(project));
    } catch (error) {
      next(error);
    }
  });
}
