export default function register(app, deps) {
  const {
    projects,
    build,
    cad,
    code,
    physics,
    nowIso,
    getDemoProject,
  } = deps;

  function findBomItem(project, sku) {
    if (!project?.bom) return null;
    const buckets = ['required', 'optional', 'spareParts', 'alreadyOwned', 'missing'];
    for (const bucket of buckets) {
      const list = project.bom[bucket];
      if (!Array.isArray(list)) continue;
      const hit = list.find((row) => row && row.sku === sku);
      if (hit) return hit;
    }
    return null;
  }

  function enrichResponse(project) {
    const response = projects.projectForResponse(project);
    if (!response) return response;
    if (project?.team?.notes !== undefined) {
      response.team = { ...response.team, notes: project.team.notes };
    }
    if (Array.isArray(response.bom)) {
      response.bom = response.bom.map((item) => {
        const original = findBomItem(project, item.sku) || {};
        const priceOverride = original.priceOverride;
        const effectivePrice = priceOverride !== undefined && priceOverride !== null
          ? Number(priceOverride)
          : Number(original.price ?? item.price);
        return {
          ...item,
          qty: Number(original.qty ?? item.qty),
          price: effectivePrice,
          priceOverride: priceOverride === undefined ? null : priceOverride,
          owned: Boolean(original.owned ?? original.inInventory ?? false),
          note: original.note || '',
        };
      });
    }
    response.substitutions = Array.isArray(project?.bom?.substitutions)
      ? project.bom.substitutions
      : [];
    return response;
  }

  app.get('/api/project/demo', (_req, res) => {
    res.json(enrichResponse(getDemoProject()));
  });

  app.post('/api/projects', async (req, res, next) => {
    try {
      const project = await projects.createProject(req.body);
      res.status(201).json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/projects/:id', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const incoming = req.body.team || req.body || {};
      const mergedTeam = { ...project.team, ...incoming };
      const sanitized = projects.defaultTeam(mergedTeam);
      sanitized.notes = mergedTeam.notes ?? project.team.notes ?? '';
      Object.assign(project.team, sanitized);
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/intake', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const incoming = req.body.team || req.body || {};
      const mergedTeam = { ...project.team, ...incoming };
      const sanitized = projects.defaultTeam(mergedTeam);
      sanitized.notes = mergedTeam.notes ?? project.team.notes ?? '';
      project.team = sanitized;
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-blueprint', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const incoming = req.body.team || {};
      const mergedTeam = { ...project.team, ...incoming };
      const sanitized = projects.defaultTeam(mergedTeam);
      sanitized.notes = mergedTeam.notes ?? project.team.notes ?? '';
      project.team = sanitized;
      project.season = projects.currentSeasonSource(project);
      project.strategy = projects.buildStrategy(project.team, project.season);
      project.concepts = projects.buildConcepts(project.team, project.season);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      await projects.applyAiPacket(project);
      project.selectedDesign = project.concepts[1] || project.concepts[0];
      const priorBom = project.bom;
      project.bom = projects.buildBom(project.team, project.selectedDesign.id);
      if (priorBom && Array.isArray(priorBom.substitutions)) {
        project.bom.substitutions = priorBom.substitutions;
      }
      project.physics = physics.calculateMechanisms();
      project.cad = cad.generateCadConcept(project);
      project.code = code.generateCode(project);
      project.buildGuide = project.buildGuide || build.buildGuide(project);
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-strategies', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.strategy = projects.buildStrategy({ ...project.team, ...(req.body || {}) });
      await projects.saveProject(project);
      res.json(project.strategy);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-designs', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.concepts = projects.buildConcepts({ ...project.team, ...(req.body || {}) });
      await projects.saveProject(project);
      res.json(project.concepts);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/select-design', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      project.selectedDesign = project.concepts.find((concept) => concept.id === req.body.designId) || project.concepts[1];
      const priorSubs = project.bom?.substitutions;
      project.bom = projects.buildBom(project.team, project.selectedDesign.id);
      if (Array.isArray(priorSubs)) project.bom.substitutions = priorSubs;
      project.cad = cad.generateCadConcept(project);
      project.code = code.generateCode(project);
      project.buildGuide = build.buildGuide(project);
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/generate-bom', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const priorSubs = project.bom?.substitutions;
      project.bom = projects.buildBom({ ...project.team, ...(req.body.team || {}) }, req.body.designId || project.selectedDesign?.id);
      if (Array.isArray(priorSubs)) project.bom.substitutions = priorSubs;
      await projects.saveProject(project);
      res.json(project.bom);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/bom/update', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      if (!project.bom) {
        return res.status(409).json({ error: 'Project has no BOM yet. Generate the blueprint first.' });
      }

      const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
      for (const patch of updates) {
        if (!patch || typeof patch.sku !== 'string') continue;
        const target = findBomItem(project, patch.sku);
        if (!target) continue;
        if (patch.qty !== undefined && patch.qty !== null) {
          const nextQty = Math.max(0, Math.floor(Number(patch.qty)));
          if (!Number.isNaN(nextQty)) target.qty = nextQty;
        }
        if (patch.price !== undefined && patch.price !== null) {
          const nextPrice = Math.max(0, Number(patch.price));
          if (!Number.isNaN(nextPrice)) target.price = nextPrice;
        }
        if (patch.priceOverride === null) {
          target.priceOverride = null;
        } else if (patch.priceOverride !== undefined) {
          const nextOverride = Math.max(0, Number(patch.priceOverride));
          if (!Number.isNaN(nextOverride)) target.priceOverride = nextOverride;
        }
        if (patch.owned !== undefined) {
          target.owned = Boolean(patch.owned);
          target.inInventory = Boolean(patch.owned);
        }
        if (patch.note !== undefined) {
          target.note = String(patch.note || '').slice(0, 600);
        }
        const effectivePrice = target.priceOverride !== undefined && target.priceOverride !== null
          ? Number(target.priceOverride)
          : Number(target.price);
        target.total = effectivePrice * Number(target.qty || 0);
      }

      const subs = req.body?.substitutions;
      if (Array.isArray(subs)) {
        project.bom.substitutions = subs.map((sub) => ({
          sku: String(sub?.sku || ''),
          originalPart: sub?.originalPart ? String(sub.originalPart) : undefined,
          replacement: String(sub?.replacement || ''),
          note: sub?.note ? String(sub.note).slice(0, 600) : '',
          createdAt: sub?.createdAt || nowIso(),
        })).filter((sub) => sub.sku && sub.replacement);
      } else if (req.body?.addSubstitution) {
        const sub = req.body.addSubstitution;
        if (sub?.sku && sub?.replacement) {
          const existing = Array.isArray(project.bom.substitutions) ? project.bom.substitutions : [];
          project.bom.substitutions = [
            ...existing.filter((entry) => entry.sku !== sub.sku),
            {
              sku: String(sub.sku),
              originalPart: sub.originalPart ? String(sub.originalPart) : undefined,
              replacement: String(sub.replacement),
              note: sub.note ? String(sub.note).slice(0, 600) : '',
              createdAt: nowIso(),
            },
          ];
        }
      } else if (req.body?.removeSubstitution) {
        const sku = String(req.body.removeSubstitution);
        if (Array.isArray(project.bom.substitutions)) {
          project.bom.substitutions = project.bom.substitutions.filter((entry) => entry.sku !== sku);
        }
      }

      const allItems = [
        ...(project.bom.required || []),
        ...(project.bom.optional || []),
      ];
      const subtotal = allItems.reduce((sum, item) => {
        const effectivePrice = item.priceOverride !== undefined && item.priceOverride !== null
          ? Number(item.priceOverride)
          : Number(item.price || 0);
        return sum + effectivePrice * Number(item.qty || 0);
      }, 0);
      project.bom.subtotal = subtotal;
      project.bom.budgetRemaining = (project.team?.budget || 0) - subtotal;

      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/notes', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const text = String(req.body?.text || req.body?.note || '').slice(0, 2000);
      const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
      const currentNotes = project.team?.notes || '';
      if (mode === 'replace' || !currentNotes) {
        project.team.notes = text;
      } else {
        project.team.notes = `${currentNotes.trim()}\n\n${text.trim()}`.trim();
      }
      project.updatedAt = nowIso();
      await projects.saveProject(project);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/export.json', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-blueprint.json`);
      res.json(enrichResponse(project));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/projects/:id/prompts', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id) || getDemoProject();
      res.json(projects.buildAgentPrompts(project));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/projects/:id/agents/review-plan', async (req, res, next) => {
    try {
      const project = await projects.loadProject(req.params.id) || getDemoProject();
      const prompts = projects.buildAgentPrompts(project);
      res.json({
        projectContext: prompts.context,
        executionOrder: prompts.agents.map((agent) => agent.name),
        reviewGates: [
          'Rules Agent must cite official manual chunks before legality claims.',
          'Physics Agent must produce assumptions and safety factor for every motorized mechanism.',
          'Parts Agent must include SKU, product URL, lastChecked, and budget effect.',
          'Review Agent must block final output if code hardware names do not match generated hardware guide.',
        ],
        modelAdapterPayload: {
          system: prompts.system,
          messages: prompts.agents.map((agent) => ({ role: 'user', content: agent.prompt })),
          structuredOutput: true,
          note: 'This endpoint prepares prompts for the app model adapter; it does not call a hosted LLM in local MVP mode.',
        },
        requestedTask: req.body?.task || 'Generate complete project plan',
      });
    } catch (error) {
      next(error);
    }
  });
}
