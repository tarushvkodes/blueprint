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
  const viewComponents = components.map((component) => ({
    id: component.id,
    mechanismId: component.mechanismId,
    label: component.name,
    positionMm: component.positionMm,
    sizeMm: component.sizeMm,
  }));
  const wiringRuns = [
    { id: 'battery-to-switch', from: 'battery', to: 'power-switch', pathMm: [{ x: 120, y: 125, z: 120 }, { x: 0, y: 135, z: 120 }], note: 'Keep main power switch reachable from outside the robot.' },
    { id: 'switch-to-hub', from: 'power-switch', to: 'control-hub', pathMm: [{ x: 0, y: 135, z: 120 }, { x: -120, y: 115, z: 125 }], note: 'Strain-relieve XT30 leads and keep them away from lift travel.' },
    { id: 'hub-to-drive', from: 'control-hub', to: 'drive-motors', pathMm: [{ x: -120, y: 115, z: 125 }, { x: -180, y: 0, z: 75 }, { x: 180, y: 0, z: 75 }], note: 'Label every motor cable with the generated hardware name.' },
    { id: 'hub-to-intake', from: 'control-hub', to: 'intake', pathMm: [{ x: -120, y: 115, z: 125 }, { x: 0, y: -165, z: 125 }], note: 'Leave service loop so the intake can be removed.' },
    { id: 'hub-to-lift', from: 'control-hub', to: 'lift-tower', pathMm: [{ x: -120, y: 115, z: 125 }, { x: 55, y: 0, z: 250 }], note: 'Route through a strain-relieved cable chain or tied bundle.' },
  ];
  const explodedSteps = [
    { order: 1, componentIds: ['base-frame', 'wheel-1', 'wheel-2', 'wheel-3', 'wheel-4'], offsetMm: { x: 0, y: 0, z: 0 }, instruction: 'Build and square drivetrain before adding vertical mechanisms.' },
    { order: 2, componentIds: ['control-hub', 'battery'], offsetMm: { x: 0, y: 80, z: 45 }, instruction: 'Mount low electronics bay with battery access and strain relief.' },
    { order: 3, componentIds: ['lift-tower'], offsetMm: { x: 0, y: 0, z: 120 }, instruction: 'Brace scoring tower back into drivetrain rails before powered tests.' },
    { order: 4, componentIds: ['intake'], offsetMm: { x: 0, y: -120, z: 35 }, instruction: 'Attach intake as a removable front module with visible jam access.' },
  ];

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
        { id: 'intake-service-fasteners', componentId: 'intake', note: 'Use two accessible fastener groups so students can remove the intake quickly.' },
      ],
    },
    blueprintViews: {
      top: {
        projection: 'XY',
        scale: '1 mm = 1 layout unit',
        callouts: ['starting frame perimeter', 'wheel handedness', 'electronics service bay', 'front intake envelope'],
        components: viewComponents.map((component) => ({
          ...component,
          drawing: {
            x: component.positionMm.x,
            y: component.positionMm.y,
            width: component.sizeMm.x || (component.sizeMm.radius || 20) * 2,
            height: component.sizeMm.y || component.sizeMm.depth || (component.sizeMm.radius || 20) * 2,
          },
        })),
      },
      front: {
        projection: 'XZ',
        callouts: ['lift height envelope', 'intake vertical clearance', 'wheel contact line'],
        components: viewComponents.map((component) => ({
          ...component,
          drawing: {
            x: component.positionMm.x,
            y: component.positionMm.z,
            width: component.sizeMm.x || (component.sizeMm.radius || 20) * 2,
            height: component.sizeMm.z || component.sizeMm.depth || (component.sizeMm.radius || 20) * 2,
          },
        })),
      },
      side: {
        projection: 'YZ',
        callouts: ['center of gravity stays low', 'battery access', 'cable path through lift travel'],
        components: viewComponents.map((component) => ({
          ...component,
          drawing: {
            x: component.positionMm.y,
            y: component.positionMm.z,
            width: component.sizeMm.y || component.sizeMm.depth || (component.sizeMm.radius || 20) * 2,
            height: component.sizeMm.z || component.sizeMm.x || (component.sizeMm.radius || 20) * 2,
          },
        })),
      },
      isometric: {
        projection: 'conceptual 3D',
        camera: { positionMm: { x: 720, y: -760, z: 560 }, targetMm: { x: 0, y: 0, z: 170 } },
        callouts: ['concept only', 'verify dimensions and fasteners', 'export richer geometry later through CadQuery/OpenCascade'],
      },
    },
    wiringView: {
      disclaimer: 'Conceptual wiring route. Verify wire gauge, strain relief, legal control system layout, and inspection requirements.',
      runs: wiringRuns,
      checklist: [
        'Battery is strapped and reachable.',
        'Power switch is externally reachable.',
        'Motor and sensor wires are labeled with generated hardware names.',
        'No wire crosses wheel, intake, or lift pinch paths.',
      ],
    },
    explodedAssembly: {
      disclaimer: 'Exploded view shows build order, not final manufacturing geometry.',
      steps: explodedSteps,
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
      blueprintViews: cad.blueprintViews || {},
      wiringView: cad.wiringView || {},
      explodedAssembly: cad.explodedAssembly || {},
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
