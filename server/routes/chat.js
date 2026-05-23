export default function register(app, deps) {
  const {
    projects,
    rules,
    catalogApi,
    ai,
    chat,
    getDemoProject,
  } = deps;

  app.post('/api/projects/:id/chat', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id) || getDemoProject();
      const message = String(req.body?.message || '');
      const citations = rules.quoteRule(message);
      const catalogHits = catalogApi.searchCatalog(message, 3);
      const aiResult = await ai.callVertexJson({
        prompt: [
          'Return JSON: { "answer": string, "suggestedActions": string[] }.',
          'You are Blueprint. Answer using the project context. Do not make legality claims without citations.',
          `Question: ${message}`,
          `Team: ${JSON.stringify(project.team)}`,
          `Season: ${JSON.stringify(project.season || projects.currentSeasonSource(project))}`,
          `Citations available: ${JSON.stringify(citations)}`,
        ].join('\n\n'),
      });
      res.json({
        answer: aiResult.ok
          ? aiResult.data.answer
          : chat.buildFallbackChatAnswer({ project, message }),
        citations,
        catalogHits,
        generatedBy: aiResult.generatedBy,
        suggestedActions: aiResult.ok ? aiResult.data.suggestedActions || [] : ['search rules', 'recalculate mechanism', 'regenerate BOM', 'update code artifact'],
      });
    } catch (error) {
      next(error);
    }
  });
}
