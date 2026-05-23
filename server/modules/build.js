export function buildGuide(project) {
  const selected = project.selectedDesign || project.concepts?.[1];
  return [
    { phase: 'Prepare parts', title: 'Confirm manual, BOM, and inventory', parts: [], tools: ['laptop'], time: '30 min', diagram: 'BOM -> bins -> legal checklist', instructions: 'Open the current manual, confirm team inventory, mark already-owned REV parts, and print the legal/rules checklist.', checkpoint: 'Budget remaining is non-negative or substitutions are chosen.', commonMistake: 'Ordering mechanisms before confirming control system parts.', test: 'A student can point to the manual version and every buy-first part.' },
    { phase: 'Build drivetrain', title: `Assemble ${selected?.name || 'selected'} drivetrain`, parts: ['motors', 'wheels', 'channel', 'fasteners'], tools: ['hex drivers', 'wrenches'], time: '2-4 hr', diagram: 'Top view: square base, four wheels, motors inside frame', instructions: 'Build the chassis square on a flat surface, tighten gradually, and verify wheels spin freely.', checkpoint: 'Robot rolls straight with no binding.', commonMistake: 'Mirroring mecanum wheels incorrectly.', test: 'Push the robot by hand; each wheel spins freely and the frame does not rack.' },
    { phase: 'Wire drivetrain', title: 'Mount Control Hub and battery safely', parts: ['Control Hub', 'battery', 'switch', 'XT30 cables'], tools: ['wire clips', 'zip ties'], time: '1 hr', diagram: 'Rear electronics bay with strain-relieved cables', instructions: 'Route wires away from moving parts, strain-relieve connectors, and label each motor cable.', checkpoint: 'Robot can be disabled quickly and no wires drag.', commonMistake: 'Leaving battery unsecured.', test: 'Lift and gently shake the robot; battery and hub remain fixed.' },
    { phase: 'Build scoring mechanism', title: 'Bench-test lift/intake before mounting', parts: ['gearbox', 'slide', 'servo'], tools: ['hex drivers'], time: '3-6 hr', diagram: 'Side view: scoring tower braced to base', instructions: 'Assemble the mechanism outside the robot, check current draw, then mount with accessible fasteners.', checkpoint: 'Mechanism moves through full range without binding.', commonMistake: 'Ignoring cable path through the lift travel.', test: 'Run the mechanism at low power for 10 cycles and check for heat or binding.' },
    { phase: 'Upload code', title: 'Configure hardware map and run TeleOp', parts: [], tools: ['Android Studio', 'Driver Station'], time: '45 min', diagram: 'Laptop -> Robot Controller -> Driver Station', instructions: 'Use generated case-sensitive config names, run TeleOp on blocks, and reverse motors only after checking wiring.', checkpoint: 'Forward stick drives forward and slow mode works.', commonMistake: 'Changing config names without updating code.', test: 'Forward stick drives forward, turn stick turns, and stop disables all motors.' },
    { phase: 'Tune autonomous', title: 'Tune constants and run repeatability tests', parts: [], tools: ['field tiles', 'tape measure'], time: '2 hr', diagram: 'Field tile path with start, score, park markers', instructions: 'Measure wheel diameter, tune encoder constants, and run 10 consecutive autonomous trials.', checkpoint: 'Robot succeeds at least 8 of 10 times before adding complexity.', commonMistake: 'Testing only on a full battery.', test: 'Record 10 runs and keep the simplest path that succeeds reliably.' },
  ].map((step) => ({ ...step, generatedBy: project.generatedBy || 'local-fallback' }));
}

export function buildGuideHtml(project) {
  const steps = project.buildGuide || [];
  const rows = steps.map((step, index) => `
    <section class="step">
      <div class="diagram">${step.diagram || `Step ${index + 1}`}</div>
      <div>
        <p class="kicker">Step ${index + 1} · ${step.phase}</p>
        <h2>${step.title || step.phase}</h2>
        <p>${step.instructions}</p>
        <p><strong>Parts:</strong> ${(step.parts || []).join(', ') || 'Project BOM items'}</p>
        <p><strong>Tools:</strong> ${(step.tools || []).join(', ') || 'Basic FTC tools'}</p>
        <p><strong>Checkpoint:</strong> ${step.checkpoint || 'Mentor/student review before continuing.'}</p>
        <p><strong>Common mistake:</strong> ${step.commonMistake || 'Skipping fit checks before tightening hardware.'}</p>
        <p><strong>Test before continuing:</strong> ${step.test || 'Confirm the subsystem moves freely and remains inside legal limits.'}</p>
      </div>
    </section>`).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${project.team.name} Blueprint Build Guide</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #17211c; }
    h1 { font-size: 42px; margin-bottom: 4px; }
    .meta { color: #5b6b61; margin-bottom: 28px; }
    .step { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 22px 0; border-top: 1px solid #d8e2dc; page-break-inside: avoid; }
    .diagram { display: grid; min-height: 160px; place-items: center; border: 2px solid #9bb8aa; border-radius: 8px; background: #f3f8f5; font-weight: 800; text-align: center; }
    .kicker { color: #1f755f; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  </style>
</head>
<body>
  <h1>${project.team.name} Build Guide</h1>
  <p class="meta">${project.season?.seasonName || 'FTC season'} · Conceptual instructions generated by Blueprint. Verify rules, dimensions, and safety before manufacturing.</p>
  ${rows}
</body>
</html>`;
}
