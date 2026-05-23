import path from 'node:path';

export default function register(app, deps) {
  const {
    documentsApi,
    documents,
    chunksRef,
    projects,
    nowIso,
    upload,
  } = deps;

  app.post('/api/projects/:id/documents/ingest-defaults', async (req, res, next) => {
    try {
      const docs = await documentsApi.ingestDefaultReferences();
      const project = await projects.loadProject(req.params.id);
      if (project) {
        project.documents = docs.map((doc) => doc.id);
        await projects.saveProject(project);
      }
      res.json({ documents: docs, chunks: chunksRef.value.length });
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
      const doc = await documentsApi.ingestDocument({
        filePath: req.file.path,
        title: req.body.title || req.file.originalname,
        type: req.body.type || 'season-resource',
        sourceUrl: req.file.originalname,
        version: req.body.version || null,
      });
      const project = await projects.loadProject(req.params.id);
      if (project) {
        project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
        project.season = projects.currentSeasonSource(project);
        project.team.manual = doc.seasonSource?.title || doc.title;
        project.updatedAt = nowIso();
        await projects.saveProject(project);
      }
      res.status(201).json({ document: doc, project: project ? projects.projectForResponse(project) : null });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/documents', (_req, res) => {
    res.json(Array.from(documents.values()));
  });

  app.get('/api/projects/:id/rules/search', (req, res) => {
    res.json({ query: req.query.q || '', citations: deps.rules.quoteRule(String(req.query.q || 'robot construction')) });
  });
}
