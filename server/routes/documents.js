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

  function documentForResponse(doc) {
    return {
      ...doc,
      checksum: doc.checksum || null,
      outdated: Boolean(doc.outdated),
    };
  }

  async function attachDocumentToProject(projectId, doc) {
    const project = await projects.loadProject(projectId);
    if (!project) return null;
    project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
    project.season = projects.currentSeasonSource(project);
    project.team.manual = doc.seasonSource?.title || doc.title;
    project.updatedAt = nowIso();
    await projects.saveProject(project);
    return project;
  }

  function handleRouteError(error, res, next) {
    if (error.status) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    next(error);
  }

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
      const { document: doc, replacedDocumentId } = await deps.rules.ingestDocument({
        filePath: req.file.path,
        title: req.body.title || req.file.originalname,
        type: req.body.type || 'manual',
        sourceUrl: req.body.sourceUrl || `upload:${req.file.originalname}`,
        version: req.body.version || null,
        documents,
        nowIso,
      });
      const project = await attachDocumentToProject(req.params.id, doc);
      res.status(201).json({
        document: documentForResponse(doc),
        project: project ? projects.projectForResponse(project) : null,
        replacedDocumentId,
      });
    } catch (error) {
      handleRouteError(error, res, next);
    }
  });

  app.post('/api/projects/:id/documents/ingest-url', async (req, res, next) => {
    try {
      const url = String(req.body?.url || '').trim();
      if (!url) return res.status(400).json({ error: 'A PDF url is required.' });
      const { document: doc, replacedDocumentId } = await deps.rules.ingestOfficialUrl({
        url,
        title: req.body?.title || '',
        type: req.body?.type || 'manual',
        version: req.body?.version || null,
        documents,
        nowIso,
      });
      const project = await attachDocumentToProject(req.params.id, doc);
      res.status(201).json({
        document: documentForResponse(doc),
        project: project ? projects.projectForResponse(project) : null,
        replacedDocumentId,
      });
    } catch (error) {
      handleRouteError(error, res, next);
    }
  });

  app.get('/api/projects/:id/documents', async (req, res) => {
    const project = await projects.loadProject(req.params.id);
    const projectDocuments = project?.documents?.length
      ? project.documents.map((docId) => documents.get(docId)).filter(Boolean)
      : Array.from(documents.values());
    res.json(projectDocuments.map(documentForResponse));
  });

  app.get('/api/projects/:id/rules/search', async (req, res) => {
    const project = await projects.loadProject(req.params.id);
    const documentIds = project?.documents?.length ? project.documents : null;
    const query = String(req.query.q || 'robot construction');
    res.json({ query, citations: deps.rules.quoteRule(query, { documentIds }) });
  });
}
