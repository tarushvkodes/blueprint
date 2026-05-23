export function createProjectModule({
  documents,
  getCatalogSize,
  findCatalogPart,
  quoteRule,
  callVertexJson,
  aiStatus,
  generateCadConcept,
  generateCode,
  buildGuide,
  calculateMechanisms,
  analyzeDriverLogs,
  sponsorEmail,
  projectStore,
  nowIso,
  slugId,
}) {
  const projects = new Map();

  function defaultTeam(body = {}) {
    const parseList = (value, fallback = []) => {
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
      return fallback;
    };

    return {
      name: body.name || body.teamName || 'Metal Magic FTC',
      number: body.number || body.teamNumber || 'Prototype',
      location: body.location || 'Virginia',
      experience: body.experience || body.experienceLevel || 'Intermediate',
      students: Number(body.students || body.numberOfStudents || 9),
      mentors: Number(body.mentors || body.availableMentors || 2),
      budget: Number(body.budget || 1500),
      supplier: body.supplier || 'REV Robotics',
      manual: body.manual || 'DECODE Competition Manual TU32',
      tools: parseList(body.tools, ['basic hand tools', '3D printer']),
      priorities: parseList(body.priorities, ['reliable autonomous', 'easy maintenance', 'simple driver control']),
      inventory: parseList(body.inventory, ['REV Starter Kit V3.1']),
      timelineWeeks: Number(body.timelineWeeks || 6),
      goals: body.goals || 'Build a reliable, legal FTC robot that students can understand, assemble, and iterate.',
      constraints: body.constraints || '',
      strategyMode: body.strategyMode || 'hybrid',
      cadExperience: body.cadExperience || 'Beginner',
      programmingExperience: body.programmingExperience || 'Beginner',
      buildSpace: body.buildSpace || 'Classroom or garage build space',
    };
  }

  function currentSeasonSource(project = null) {
    const docs = (project?.documents || [])
      .map((id) => documents.get(id))
      .filter(Boolean);
    const projectSeason = docs.find((doc) => doc.seasonSource)?.seasonSource;
    if (projectSeason) return projectSeason;
    return Array.from(documents.values()).find((doc) => doc.seasonSource)?.seasonSource || {
      seasonName: 'Uploaded season',
      manualVersion: null,
      scoringSummary: 'No official season manual has been uploaded yet.',
      pointValues: '',
      robotConstraints: [],
      fieldFacts: [],
      citations: [],
      isSample: true,
    };
  }

  function buildConcepts(team, season = currentSeasonSource()) {
    const rookie = /rookie|beginner/i.test(team.experience);
    const budget = team.budget;
    const seasonLabel = season.seasonName || 'Season';
    const scoringWords = `${season.scoringSummary || ''} ${season.pointValues || ''}`.toLowerCase();
    const scoreObject = /artifact/.test(scoringWords) ? 'artifact' : /sample|pixel|element/.test(scoringWords) ? 'game piece' : 'scoring element';
    const scoringMechanism = /goal|ramp|classifier|launch/.test(scoringWords) ? 'controlled scorer' : 'simple scoring mechanism';
    return [
      {
        id: 'simple-reliable-scorer',
        name: `Simple ${seasonLabel} Scorer`,
        strategyFit: 'Scores repeatable low-risk tasks, parks reliably in autonomous, and stays easy to inspect.',
        difficulty: rookie ? 'Beginner' : 'Beginner-safe',
        estimatedCost: Math.min(940, Math.round(budget * 0.72)),
        buildTime: '3-4 weeks',
        requiredTools: ['hex drivers', 'wrenches', 'wire strippers', 'laptop'],
        requiredParts: ['Control Hub', 'HD Hex Motors', 'FTC Starter Kit V3.1', 'servo wrist'],
        mainMechanisms: ['tank drivetrain', `passive ${scoreObject} guide`, 'single-stage arm/lift', 'basic autonomous movement'],
        pros: ['lowest mechanical risk', 'fastest to assemble', 'best for limited mentor support'],
        cons: ['lower scoring ceiling', 'less maneuverable than mecanum'],
        risks: ['driver practice matters more than mechanism count'],
        ruleConcerns: quoteRule('robot construction size control system parts'),
        upgradePath: ['add mecanum wheels', 'add preset lift positions', 'add active intake'],
      },
      {
        id: 'balanced-cycle-machine',
        name: `Balanced ${seasonLabel} Cycle Machine`,
        strategyFit: 'Balances scoring potential with maintainability using mecanum drive, lift presets, and a REV-first BOM.',
        difficulty: 'Intermediate',
        estimatedCost: Math.min(1280, Math.round(budget * 0.9)),
        buildTime: '5-6 weeks',
        requiredTools: ['hex drivers', 'wrenches', '3D printer optional', 'CAD viewer'],
        requiredParts: ['Mecanum wheel set', 'Control Hub', 'UltraPlanetary gearbox', 'linear motion kit'],
        mainMechanisms: ['mecanum drivetrain', 'linear slide', 'active intake', scoringMechanism],
        pros: ['higher cycle speed', 'good autonomous base', 'clean driver-control upgrade path'],
        cons: ['more tuning', 'requires square chassis and cable management'],
        risks: ['slide binding can cause current draw spikes'],
        ruleConcerns: quoteRule('autonomous teleop penalties robot construction'),
        upgradePath: ['add vision', 'add scoring macro', 'add spare slide carriage'],
      },
      {
        id: 'high-ceiling-vision-rig',
        name: `High Ceiling ${seasonLabel} Vision Rig`,
        strategyFit: 'Targets aggressive autonomous and fast teleop cycles for teams with enough programming and CAD bandwidth.',
        difficulty: 'Advanced',
        estimatedCost: Math.max(1600, Math.round(budget * 1.14)),
        buildTime: '7+ weeks',
        requiredTools: ['CAD', '3D printer', 'precision assembly', 'driver practice field'],
        requiredParts: ['mecanum drivetrain', 'multi-stage lift', 'camera/vision module', 'spares'],
        mainMechanisms: ['mecanum drivetrain', 'multi-stage lift', 'vision alignment', 'macro controls'],
        pros: ['highest scoring ceiling', 'strong autonomous potential'],
        cons: ['over budget for many teams', 'harder to debug'],
        risks: ['code and mechanism integration can consume the season'],
        ruleConcerns: quoteRule('vision control system autonomous rule penalties'),
        upgradePath: ['requires review before build; not recommended as first robot for rookies'],
      },
    ];
  }

  function buildStrategy(team, season = currentSeasonSource()) {
    const beginner = /rookie|beginner/i.test(team.experience);
    const hasAutoScoring = /auto|autonomous/i.test(season.scoringSummary || season.pointValues || '');
    const hasEndgame = /base|endgame|return|park|climb|hang/i.test(season.scoringSummary || season.pointValues || '');
    return {
      recommendation: beginner
        ? `Build drivetrain and one repeatable ${season.seasonName || 'game'} scoring path first; ignore high-complexity tasks until the robot can drive, score, and pass inspection consistently.`
        : `Prioritize a maintainable ${season.seasonName || 'season'} scoring robot with reliable teleop cycles${hasAutoScoring ? ', autonomous scoring support' : ''}, then add driver macros after logs show repeated sequences.`,
      scoringPriorities: ['repeatable teleop scoring', hasAutoScoring ? 'reliable autonomous action' : 'reliable autonomous movement', 'low penalty exposure', 'fast reset between cycles'],
      whatToIgnore: beginner ? ['multi-stage lift until the first mechanism works', 'fragile endgame gambits'] : ['unproven mechanisms that do not increase cycle reliability'],
      autonomous: ['encoder-based drive/park', hasAutoScoring ? 'score preload if mechanism is stable' : 'complete a reliable movement objective', 'time-based fallback'],
      teleOp: ['driver 1 owns drivetrain', 'driver 2 owns manipulator', 'slow mode for alignment', 'preset scoring positions'],
      endgame: [hasEndgame ? 'practice return/endgame task only after scoring is stable' : 'attempt only if build time remains after drivetrain and scoring validation'],
      driverPracticeGoals: ['five clean cycles in a row', 'zero cable snags', 'consistent button sequence under time pressure'],
      allianceCompatibility: 'Prefer a robot that can park, avoid traffic, and score one task reliably instead of blocking partners.',
      citations: quoteRule('scoring autonomous teleop endgame penalties'),
      generatedBy: 'local-fallback',
    };
  }

  function buildBom(team, conceptId = 'balanced-cycle-machine') {
    const concept = buildConcepts(team).find((item) => item.id === conceptId) || buildConcepts(team)[1];
    const wantsMecanum = /mecanum|balanced|high/i.test(`${concept.name} ${concept.mainMechanisms.join(' ')}`);
    const parts = [
      { subsystem: 'Control', query: 'REV-31-1595 Control Hub', qty: 1, required: true, buyFirst: 1 },
      { subsystem: 'Drivetrain', query: 'HD Hex Motor REV-41-1301', qty: wantsMecanum ? 4 : 2, required: true, buyFirst: 2 },
      { subsystem: 'Drivetrain', query: wantsMecanum ? 'Mecanum Wheel Set REV-45-1655' : 'FTC Starter Kit V3.1 REV-45-3529', qty: 1, required: true, buyFirst: 3 },
      { subsystem: 'Scoring', query: 'UltraPlanetary Gearbox Kit REV-41-1600', qty: 2, required: true, buyFirst: 4 },
      { subsystem: 'Scoring', query: 'Linear Motion Kit REV-41-1432', qty: /slide|lift/i.test(concept.mainMechanisms.join(' ')) ? 1 : 0, required: false, buyFirst: 5 },
      { subsystem: 'Electrical', query: 'XT30 Cable REV-31-1302', qty: 4, required: true, buyFirst: 6 },
    ].filter((item) => item.qty > 0);
    const items = parts.map((line) => {
      const product = findCatalogPart(line.query) || {};
      const price = Number(product.price || (line.subsystem === 'Control' ? 285 : line.subsystem === 'Drivetrain' ? 45 : 30));
      return {
        ...line,
        supplier: 'REV Robotics',
        sku: product.sku || line.query.match(/REV-\d{2}-\d{4}/)?.[0] || 'SKU pending',
        part: product.name || line.query,
        price,
        total: price * line.qty,
        productUrl: product.productUrl || null,
        cadUrl: product.cadUrl || null,
        stock: product.stockStatus || 'Availability not checked',
        lastChecked: product.lastChecked || null,
        inInventory: team.inventory.some((owned) => line.query.toLowerCase().includes(String(owned).toLowerCase())),
        substitutionSuggestions: [],
      };
    });
    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    return {
      conceptId,
      required: items.filter((item) => item.required),
      optional: items.filter((item) => !item.required),
      spareParts: items.filter((item) => /motor|cable|wheel/i.test(item.part)).map((item) => ({ ...item, qty: 1, total: item.price })),
      alreadyOwned: items.filter((item) => item.inInventory),
      missing: items.filter((item) => !item.inInventory),
      subtotal,
      shippingEstimatePlaceholder: Math.max(35, Math.round(subtotal * 0.06)),
      budgetRemaining: team.budget - subtotal,
      buyFirst: items.sort((a, b) => a.buyFirst - b.buyFirst).slice(0, 4),
      budgetMode: team.budget < 1000 ? 'Ultra-Low Budget' : team.budget < 1800 ? 'Balanced Budget' : 'Competitive Budget',
    };
  }

  function projectContextForPrompts(project) {
    const seasonSource = project.season || currentSeasonSource(project);
    return {
      team: project.team,
      season: {
        name: seasonSource.seasonName,
        manualVersion: seasonSource.manualVersion,
        scoringSummary: seasonSource.scoringSummary,
        robotConstraints: seasonSource.robotConstraints,
        indexedDocuments: Array.from(documents.values()).map((doc) => ({
          id: doc.id,
          title: doc.title,
          type: doc.type,
          version: doc.version,
        })),
      },
      strategy: project.strategy,
      selectedDesign: project.selectedDesign,
      budget: project.bom ? {
        subtotal: project.bom.subtotal,
        shippingEstimatePlaceholder: project.bom.shippingEstimatePlaceholder,
        budgetRemaining: project.bom.budgetRemaining,
        budgetMode: project.bom.budgetMode,
      } : null,
      catalog: {
        supplier: 'REV Robotics',
        itemCount: getCatalogSize(),
        accessMethod: 'Public REV Robotics BigCommerce product pages parsed server-side for SKU, title, price, stock-ish purchasability, docs, CAD URLs, and lastChecked.',
      },
    };
  }

  function buildAgentPrompts(project) {
    const context = projectContextForPrompts(project);
    const system = [
      'You are Blueprint, an FTC engineering workspace assistant.',
      'Prioritize student learning, FTC legality, conservative engineering assumptions, budget limits, and editable outputs.',
      'Never make a definitive rule-sensitive claim without citations from indexed official documents.',
      'When evidence is missing, say what must be checked and produce a safe next step instead of guessing.',
      'Show formulas, assumptions, inputs, calculations, result, safety factor, and warning thresholds for mechanism advice.',
      'Generate FTC SDK Java using only selected libraries and case-sensitive hardware names from the project.',
    ].join('\n');
    const citationRule = 'Return rule-sensitive statements with ruleNumber, manualSection, sourceDocument, version, explanation, and confidence.';
    return {
      system,
      context,
      agents: [
        {
          name: 'Intake Agent',
          purpose: 'Normalize team profile, constraints, inventory, timeline, skill level, and priorities.',
          prompt: `${system}\n\nUse the project context to identify missing onboarding fields. Ask only questions that materially affect strategy, legality, BOM, physics, CAD, or code outputs.\n\nReturn JSON: { missingFields, inferredConstraints, riskFlags, nextQuestions }.`,
        },
        {
          name: 'Rules Agent',
          purpose: 'Ground legal/rules checks in the indexed manual and updates.',
          prompt: `${system}\n\nSearch the indexed manual chunks for the proposed design and strategy. ${citationRule} Refuse uncited legality claims.\n\nReturn JSON: { likelyAllowed, blockers, inspectionChecklist, citations, unresolvedQuestions }.`,
        },
        {
          name: 'Strategy Agent',
          purpose: 'Turn game scoring, skill level, budget, and timeline into priorities.',
          prompt: `${system}\n\nRecommend what to score, what to ignore, autonomous plan, teleop plan, endgame stance, alliance fit, and driver practice goals. Cite game-sensitive claims.\n\nReturn JSON: { recommendation, scoringPriorities, ignoreList, autonomous, teleop, endgame, allianceCompatibility, citations }.`,
        },
        {
          name: 'Mechanical Design Agent',
          purpose: 'Generate three feasible robot concepts and merge options.',
          prompt: `${system}\n\nCreate exactly three robot concepts: conservative, balanced, and high-ceiling. Include difficulty, cost, build time, tools, mechanisms, pros, cons, risks, rule concerns, and upgrade path.\n\nReturn JSON: { concepts: [...] }.`,
        },
        {
          name: 'Parts Agent',
          purpose: 'Build REV-first BOMs from the parsed catalog.',
          prompt: `${system}\n\nUse only catalog parts with SKU/productUrl when possible. Mark unknown availability as lastChecked. Split required, optional, spares, alreadyOwned, missing, substitutions, and buyFirst priorities.\n\nReturn JSON: { required, optional, spareParts, alreadyOwned, missing, subtotal, budgetRemaining, substitutions }.`,
        },
        {
          name: 'Physics Agent',
          purpose: 'Verify mechanisms with math before recommendation.',
          prompt: `${system}\n\nFor each mechanism calculate torque, RPM, speed, force, safety margin, current/battery risk if possible, and warning thresholds. Use conservative defaults when inputs are missing and label assumptions.\n\nReturn JSON: { calculations: [{ mechanism, assumptions, formula, calculation, result, safetyFactor, recommendation, warning }] }.`,
        },
        {
          name: 'CAD Agent',
          purpose: 'Create conceptual CAD starter specs, not manufacturing promises.',
          prompt: `${system}\n\nGenerate a parametric CAD plan for browser preview and future CadQuery export. Include robot envelope, subsystem placement, mounting points, views, wiring view, and verification notes. Label it conceptual.\n\nReturn JSON: { disclaimer, robotDimensionsMm, subsystemLayout, mountingPoints, views, exportPlan }.`,
        },
        {
          name: 'Code Agent',
          purpose: 'Generate FTC SDK Java starter code aligned to selected hardware.',
          prompt: `${system}\n\nGenerate Java files for RobotHardware, DriveSubsystem, LiftSubsystem, TeleOpMain, AutoMain, Constants, and README. Use FTC SDK imports, safe power clipping, telemetry, hardware init errors, and case-sensitive names.\n\nReturn JSON: { files: [{ fileName, language, content }], hardwareConfigurationChecklist }.`,
        },
        {
          name: 'Build Guide Agent',
          purpose: 'Create LEGO-style assembly steps with tests.',
          prompt: `${system}\n\nCreate build phases with step number, title, parts, tools, estimated time, instruction, safety warning, checkpoint, common mistake, and test before continuing.\n\nReturn JSON: { buildSteps }.`,
        },
        {
          name: 'Driver Optimization Agent',
          purpose: 'Analyze gamepad logs and propose better control layout.',
          prompt: `${system}\n\nAnalyze button/stick usage, repeated sequences, timing gaps, failed actions, and phase context. Recommend remaps, macros, toggles vs holds, deadzones, slow mode, presets, and driver1/driver2 ownership.\n\nReturn JSON: { buttonUsage, repeatedSequences, suggestions, recommendedMap }.`,
        },
        {
          name: 'Grant Agent',
          purpose: 'Draft sponsor/grant materials from team and budget context.',
          prompt: `${system}\n\nDraft sponsor email, grant narrative, budget justification, donation tiers, follow-up email, thank-you email, and outreach tracker fields. Keep claims truthful and editable.\n\nReturn JSON: { sponsorEmail, grantDraft, budgetJustification, tiers, followUp, thankYou }.`,
        },
        {
          name: 'Review Agent',
          purpose: 'Catch contradictions and unsafe overclaims before output.',
          prompt: `${system}\n\nReview the whole plan for uncited rules, impossible parts, budget mismatch, missing physics, code/CAD mismatch, unsafe build advice, and overpromised CAD. Return required fixes before final output.\n\nReturn JSON: { pass, blockers, warnings, fixes, finalCaveats }.`,
        },
      ],
    };
  }

  function projectAiPrompt(project) {
    const season = currentSeasonSource(project);
    return [
      'You are Blueprint, an FTC engineering workspace assistant.',
      'Return only valid JSON. Make a year-agnostic FTC robot packet from the season/manual facts and team requirements.',
      'Never make definitive legality claims. Include citations when rule-sensitive.',
      'JSON shape: { strategy, concepts, buildGuide, chatSeed }.',
      'strategy: { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility }.',
      'concepts: exactly 3 items with id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath.',
      'buildGuide: 6-10 Lego-like steps with phase, title, parts, tools, time, diagram, instructions, checkpoint, commonMistake, test.',
      `Team: ${JSON.stringify(project.team)}`,
      `Season source: ${JSON.stringify({
        seasonName: season.seasonName,
        manualVersion: season.manualVersion,
        scoringSummary: season.scoringSummary,
        pointValues: season.pointValues,
        robotConstraints: season.robotConstraints,
        fieldFacts: season.fieldFacts,
      })}`,
    ].join('\n\n');
  }

  function normalizeAiConcepts(concepts, team, season) {
    if (!Array.isArray(concepts) || concepts.length < 3) return buildConcepts(team, season);
    return concepts.slice(0, 3).map((concept, index) => ({
      id: concept.id || `ai-concept-${index + 1}`,
      name: concept.name || `Concept ${index + 1}`,
      strategyFit: concept.strategyFit || concept.fit || 'Generated from season constraints and team requirements.',
      difficulty: concept.difficulty || ['Beginner-safe', 'Intermediate', 'Advanced'][index],
      estimatedCost: Number(concept.estimatedCost || concept.cost || Math.round(team.budget * [0.7, 0.9, 1.1][index])),
      buildTime: concept.buildTime || ['3-4 weeks', '5-6 weeks', '7+ weeks'][index],
      requiredTools: concept.requiredTools || team.tools || [],
      requiredParts: concept.requiredParts || [],
      mainMechanisms: concept.mainMechanisms || concept.mechanisms || [],
      pros: concept.pros || [],
      cons: concept.cons || [],
      risks: concept.risks || [],
      upgradePath: concept.upgradePath || [],
      ruleConcerns: quoteRule(`${concept.name || ''} robot construction scoring`),
    }));
  }

  function normalizeAiBuildGuide(steps, project) {
    if (!Array.isArray(steps) || steps.length === 0) return buildGuide(project);
    return steps.map((step, index) => ({
      phase: step.phase || `Step ${index + 1}`,
      title: step.title || step.phase || `Build step ${index + 1}`,
      parts: Array.isArray(step.parts) ? step.parts : [],
      tools: Array.isArray(step.tools) ? step.tools : project.team.tools || [],
      time: step.time || step.estimatedTime || '30-60 min',
      diagram: step.diagram || `Diagram ${index + 1}`,
      instructions: step.instructions || step.instruction || '',
      checkpoint: step.checkpoint || 'Review before continuing.',
      commonMistake: step.commonMistake || 'Skipping fit checks.',
      test: step.test || step.testBeforeContinuing || 'Verify the subsystem is safe and repeatable.',
      generatedBy: project.generatedBy || 'vertex-express',
    }));
  }

  async function applyAiPacket(project) {
    const ai = await callVertexJson({ prompt: projectAiPrompt(project) });
    if (!ai.ok) {
      project.generatedBy = 'local-fallback';
      project.aiFallbackReason = ai.error;
      return project;
    }

    const season = currentSeasonSource(project);
    project.generatedBy = 'vertex-express';
    project.strategy = ai.data.strategy || project.strategy;
    project.concepts = normalizeAiConcepts(ai.data.concepts, project.team, season);
    project.selectedDesign = project.concepts[1] || project.concepts[0];
    project.buildGuide = normalizeAiBuildGuide(ai.data.buildGuide, project);
    return project;
  }

  async function saveProject(project) {
    projects.set(project.id, project);
    await projectStore.saveProject(project);
    return project;
  }

  async function loadProject(id) {
    if (projects.has(id)) return projects.get(id);
    const loaded = await projectStore.loadProject(id);
    if (!loaded) return null;
    projects.set(id, loaded);
    return loaded;
  }

  async function listProjects() {
    const loaded = await projectStore.listProjects();
    for (const project of loaded) {
      projects.set(project.id, project);
    }
    return Array.from(projects.values());
  }

  async function updateProject(id, updater) {
    const project = await loadProject(id);
    if (!project) return null;
    const updated = await updater(project);
    if (!updated) return null;
    await saveProject(updated);
    return updated;
  }

  async function createProject(body = {}, options = {}) {
    const team = defaultTeam(body.team || body);
    const id = slugId('project');
    const project = {
      id,
      status: 'draft',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      team,
      documents: Array.from(documents.values()).map((doc) => doc.id),
      season: currentSeasonSource(),
      generatedBy: 'local-fallback',
      aiFallbackReason: null,
      strategy: buildStrategy(team, currentSeasonSource()),
      concepts: buildConcepts(team, currentSeasonSource()),
      selectedDesign: null,
      bom: null,
      physics: calculateMechanisms(),
      cad: null,
      code: null,
      buildGuide: null,
      warnings: [
        'Rule-sensitive claims require citations from the indexed manual.',
        'CAD is conceptual until dimensions and clearances are verified.',
        'Generated FTC SDK code must be compiled in a real FTC project before robot use.',
      ],
    };
    await applyAiPacket(project);
    project.season = currentSeasonSource(project);
    project.selectedDesign = project.concepts[1];
    project.bom = buildBom(team, project.selectedDesign.id);
    project.cad = generateCadConcept(project);
    project.code = generateCode(project);
    project.buildGuide = buildGuide(project);
    project.driverInsight = analyzeDriverLogs([]);
    project.sponsorDraft = sponsorEmail({ team });
    if (options.persist !== false) {
      await saveProject(project);
    }
    return project;
  }

  function projectForResponse(project) {
    if (!project) return null;
    const bomItems = [...(project.bom?.required || []), ...(project.bom?.optional || [])];
    const id = project.id || 'demo';
    return {
      ...project,
      team: { ...project.team, manual: project.team.manual },
      season: project.season || currentSeasonSource(project),
      generatedBy: project.generatedBy || 'local-fallback',
      aiFallbackReason: project.aiFallbackReason || null,
      aiStatus: aiStatus(),
      sourceDocuments: (project.documents || []).map((docId) => documents.get(docId)).filter(Boolean).map((doc) => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        version: doc.version,
        pages: doc.pages,
        ingestedAt: doc.ingestedAt,
        seasonSource: doc.seasonSource,
      })),
      artifactUrls: {
        projectJson: `/api/projects/${id}/export.json`,
        codeZip: `/api/projects/${id}/code/export.zip`,
        cadGltf: `/api/projects/${id}/cad/export.glb`,
        cadStep: `/api/projects/${id}/cad/export.step`,
        buildGuideHtml: `/api/projects/${id}/build-guide/export.html`,
      },
      concepts: project.concepts.map((concept) => ({
        ...concept,
        cost: concept.estimatedCost ?? concept.cost ?? 0,
        fit: concept.strategyFit ?? concept.fit ?? '',
        buildTime: concept.buildTime,
        mechanisms: concept.mainMechanisms ?? concept.mechanisms ?? [],
        risks: concept.risks,
      })),
      rules: quoteRule('robot construction control system autonomous teleop penalties').map((citation) => ({
        rule: citation.ruleNumber,
        section: citation.manualSection,
        status: citation.confidence === 'Low' ? 'Needs citation verification' : 'Indexed citation available',
        confidence: citation.confidence,
        note: citation.explanation,
        sourceDocument: citation.sourceDocument,
      })),
      bom: bomItems.map((item) => ({
        subsystem: item.subsystem,
        sku: item.sku,
        part: item.part,
        qty: item.qty,
        price: item.price,
        stock: item.stock,
        productUrl: item.productUrl,
        lastChecked: item.lastChecked,
      })),
      physics: project.physics.map((item) => ({
        mechanism: item.mechanism,
        formula: item.formula,
        inputs: Object.entries(item.assumptions || {}).map(([key, value]) => `${key}: ${value}`).join(', '),
        result: item.result,
        recommendation: item.recommendation,
        margin: item.safetyFactor,
        warning: item.warning,
      })),
      buildSteps: project.buildGuide?.map((step) => `${step.phase}: ${step.instructions}`) || [],
      buildGuide: project.buildGuide || [],
      codeFiles: Object.keys(project.code || {}),
      driverInsight: project.driverInsight?.suggestions?.join(' ') || '',
      sponsorDraft: project.sponsorDraft?.subject || '',
    };
  }

  function findTeamProject(teamId, fallbackProject) {
    return Array.from(projects.values()).find((candidate) => candidate.team.number === teamId || candidate.team.name === teamId) || fallbackProject;
  }

  function getProjectSync(id) {
    return projects.get(id) || null;
  }

  return {
    defaultTeam,
    currentSeasonSource,
    buildConcepts,
    buildStrategy,
    buildBom,
    buildAgentPrompts,
    applyAiPacket,
    createProject,
    projectForResponse,
    saveProject,
    loadProject,
    listProjects,
    updateProject,
    findTeamProject,
    getProjectSync,
  };
}
