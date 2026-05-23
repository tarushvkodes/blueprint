export default function register(app, deps) {
  const { projects, drivers } = deps;

  app.post('/api/projects/:id/driver-logs/analyze', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.driverInsight = drivers.analyzeDriverLogs(req.body.logs || req.body.events || req.body.csv || []);
      await projects.saveProject(project);
      res.json(project.driverInsight);
    } catch (error) {
      next(error);
    }
  });
}
