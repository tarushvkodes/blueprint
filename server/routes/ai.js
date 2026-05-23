export default function register(app, deps) {
  app.get('/api/ai/status', (_req, res) => {
    res.json(deps.ai.aiStatus());
  });
}
