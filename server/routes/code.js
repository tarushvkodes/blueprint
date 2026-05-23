export default function register(app, deps) {
  const { projects, code, archiver } = deps;

  app.post('/api/projects/:id/generate-code', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.code = code.generateCode({ ...project, codeInputs: req.body });
      await projects.saveProject(project);
      res.json(project.code);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/code', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(project.code);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/code/export.zip', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-FTC-code.zip`);
      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', next);
      archive.pipe(res);
      for (const [file, content] of Object.entries(project.code || {})) {
        archive.append(content, { name: `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/${file}` });
      }
      archive.finalize();
    } catch (error) {
      next(error);
    }
  });
}
