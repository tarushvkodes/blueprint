export default function register(app, deps) {
  const { projects, physics } = deps;

  app.post('/api/projects/:id/calculate/mechanism', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.physics = physics.calculateMechanisms(req.body);
      await projects.saveProject(project);
      res.json(project.physics);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/calculations', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project.physics);
    } catch (error) {
      next(error);
    }
  });
}
