export default function register(app, deps) {
  const { catalog, documents, chunksRef } = deps;

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'blueprint-api',
      catalogItems: catalog.size,
      documents: documents.size,
      chunks: chunksRef.value.length,
    });
  });
}
