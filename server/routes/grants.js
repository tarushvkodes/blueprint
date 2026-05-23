export default function register(app, deps) {
  const { projects, grants, getDemoProject } = deps;

  app.post('/api/teams/:id/sponsor-email', async (req, res, next) => {
    try {
      await projects.listProjects();
      const project = projects.findTeamProject(req.params.id, getDemoProject());
      res.json(grants.sponsorEmail({ team: project.team, ...req.body }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/teams/:id/grant-draft', async (req, res, next) => {
    try {
      await projects.listProjects();
      const project = projects.findTeamProject(req.params.id, getDemoProject());
      res.json(grants.grantDraft({ project, amount: req.body.amount }));
    } catch (error) {
      next(error);
    }
  });
}
