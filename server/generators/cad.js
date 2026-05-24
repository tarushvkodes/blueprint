import { nowIso } from '../utils.js';
import { getMechanismSpecs, mechanismIds } from './mechanisms.js';

export function generateCadConcept(project) {
  const concept = project.selectedDesign || project.concepts?.[1];
  const specs = getMechanismSpecs(concept, project.team, project.season);
  const drivetrain = specs.find((spec) => spec.type === 'drivetrain');
  const manipulator = specs.find((spec) => spec.type === 'manipulator');
  const intake = specs.find((spec) => spec.type === 'intake');
  const control = specs.find((spec) => spec.type === 'control');
  const wantsMecanum = drivetrain?.architecture === 'mecanum';
  const hasTallLift = /multi-stage|linear-slide/.test(manipulator?.architecture || '');
  const dimensions = { length: 455, width: 455, height: hasTallLift ? 455 : 430 };
  const components = [
    { mechanismId: drivetrain?.id, id: 'base-frame', name: '18 in legal starting frame', shape: 'box', positionMm: { x: 0, y: 0, z: 45 }, sizeMm: { x: dimensions.length, y: dimensions.width, z: 90 }, material: 'REV extrusion/channel' },
    { mechanismId: control?.id, id: 'control-hub', name: 'Control Hub bay', shape: 'box', positionMm: { x: -120, y: 115, z: 125 }, sizeMm: { x: 145, y: 95, z: 35 }, material: 'electronics' },
    { mechanismId: control?.id, id: 'battery', name: 'Battery bay', shape: 'box', positionMm: { x: 120, y: 125, z: 120 }, sizeMm: { x: 145, y: 75, z: 50 }, material: 'electronics' },
    { mechanismId: manipulator?.id, id: 'lift-tower', name: manipulator?.name || 'Scoring lift/arm tower', shape: 'box', positionMm: { x: 55, y: 0, z: 250 }, sizeMm: { x: 80, y: 120, z: hasTallLift ? 330 : 260 }, material: 'linear motion' },
    { mechanismId: intake?.id, id: 'intake', name: intake?.name || 'Front intake/scoring wrist', shape: 'box', positionMm: { x: 0, y: -165, z: 125 }, sizeMm: intake?.cad?.envelopeMm || { x: 220, y: 80, z: 75 }, material: 'mechanism' },
  ];
  const wheelPositions = wantsMecanum
    ? [[-180, -170], [180, -170], [-180, 170], [180, 170]]
    : [[-180, -170], [180, -170], [-180, 170], [180, 170]];
  wheelPositions.forEach(([x, y], index) => {
    components.push({
      id: `wheel-${index + 1}`,
      name: wantsMecanum ? `Mecanum wheel ${index + 1}` : `Traction wheel ${index + 1}`,
      mechanismId: drivetrain?.id,
      shape: 'cylinder',
      positionMm: { x, y, z: 45 },
      sizeMm: { radius: 48, depth: 34 },
      material: 'wheel',
    });
  });

  return {
    disclaimer: 'Conceptual CAD starter. Verify dimensions, clearances, fasteners, and legality before manufacturing.',
    sourceReference: 'Generated from team constraints, selected architecture, REV part metadata, and parametric layout rules.',
    generatedBy: project.generatedBy || 'local-fallback',
    mechanismIds: mechanismIds(specs),
    mechanismSpecs: specs.map((spec) => ({
      id: spec.id,
      type: spec.type,
      name: spec.name,
      architecture: spec.architecture,
      cad: spec.cad,
    })),
    formatTargets: ['browser Three.js preview', 'downloadable concept JSON artifact', 'downloadable STEP-like concept note'],
    robotDimensionsMm: dimensions,
    parametricLayout: {
      units: 'mm',
      startingConstraint: 'Must fit inside 18 in x 18 in x 18 in starting configuration unless current manual says otherwise.',
      components,
      mountingPoints: [
        { id: 'hub-mount', componentId: 'control-hub', note: 'Mount with service access and strain relief.' },
        { id: 'battery-strap', componentId: 'battery', note: 'Battery must be secure and reachable for inspection.' },
        { id: 'tower-brace', componentId: 'lift-tower', note: 'Brace tower to base frame before lift testing.' },
      ],
    },
    subsystemLayout: [
      { name: 'Drivetrain', placement: 'base rectangle, motors inside frame perimeter', dimensionsMm: { x: 455, y: 455, z: 90 } },
      { name: 'Control Hub', placement: 'rear-left protected electronics bay', dimensionsMm: { x: 145, y: 95, z: 35 } },
      { name: 'Battery', placement: 'rear-right low center of gravity bay', dimensionsMm: { x: 145, y: 75, z: 50 } },
      { name: manipulator?.name || 'Lift/arm', placement: manipulator?.cad?.placement || 'centerline tower with service access', dimensionsMm: manipulator?.cad?.envelopeMm || { x: 80, y: 120, z: 430 } },
      { name: intake?.name || 'Intake/scoring wrist', placement: intake?.cad?.placement || 'front-right, inside starting configuration', dimensionsMm: intake?.cad?.envelopeMm || { x: 180, y: 120, z: 80 } },
    ],
    views: ['top', 'front', 'side', 'isometric', 'exploded', 'wiring', 'subsystem closeups'],
    selectedConcept: concept?.name,
  };
}

export function cadExportName(project, ext) {
  return `${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-${project.season?.seasonName || 'season'}-blueprint.${ext}`.toLowerCase();
}

export function cadAsConceptJson(project) {
  const cad = project.cad || generateCadConcept(project);
  const nodes = cad.parametricLayout.components.map((component) => ({
    name: component.name,
    translation: [
      Number(((component.positionMm.x || 0) / 1000).toFixed(4)),
      Number(((component.positionMm.z || 0) / 1000).toFixed(4)),
      Number(((component.positionMm.y || 0) / 1000).toFixed(4)),
    ],
    extras: component,
  }));
  return {
    asset: {
      version: '2.0',
      generator: 'Blueprint conceptual CAD exporter',
      copyright: 'Conceptual FTC robot layout; verify before manufacturing.',
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    extras: {
      disclaimer: cad.disclaimer,
      units: cad.parametricLayout.units,
      robotDimensionsMm: cad.robotDimensionsMm,
      mechanismIds: cad.mechanismIds || [],
      mechanismSpecs: cad.mechanismSpecs || [],
      note: 'This MVP concept artifact stores parametric CAD components for browser/tool import. Mesh export can be swapped for a full glTF pipeline later.',
    },
  };
}

export function cadAsStep(project) {
  const cad = project.cad || generateCadConcept(project);
  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Blueprint conceptual FTC robot layout note, not manufacturing-ready CAD'),'2;1');`,
    `FILE_NAME('${cadExportName(project, 'step')}', '${nowIso()}', ('Blueprint'), ('Blueprint'), 'Blueprint MVP', 'Blueprint', '');`,
    "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
    'ENDSEC;',
    'DATA;',
  ];
  cad.parametricLayout.components.forEach((component, index) => {
    lines.push(`#${index + 1}=PRODUCT('${component.id}','${component.name}','${component.material}',());`);
    lines.push(`#${index + 101}=CARTESIAN_POINT('',(${component.positionMm.x || 0},${component.positionMm.y || 0},${component.positionMm.z || 0}));`);
  });
  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return lines.join('\n');
}
