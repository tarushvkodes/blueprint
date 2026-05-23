export function calculateMechanisms({ design = {}, robot = {} } = {}) {
  const wheelDiameter = Number(robot.wheelDiameterMeters || 0.096);
  const motorRpm = Number(robot.motorRpm || 312);
  const gearRatio = Number(robot.gearRatio || 1);
  const motorTorque = Number(robot.motorTorqueNm || 0.8);
  const efficiency = Number(robot.efficiency || 0.82);
  const loadMass = Number(design.loadMassKg || 4.2);
  const pulleyRadius = Number(design.pulleyRadiusMeters || 0.018);
  const armLength = Number(design.armLengthMeters || 0.16);
  const safetyFactor = Number(design.safetyFactor || 2);
  const wheelRpm = motorRpm / gearRatio;
  const wheelCircumference = Math.PI * wheelDiameter;
  const linearSpeed = (wheelRpm * wheelCircumference) / 60 * efficiency;
  const wheelTorque = motorTorque * gearRatio * efficiency;
  const forceAtWheel = wheelTorque / (wheelDiameter / 2);
  const liftForce = loadMass * 9.81;
  const pulleyTorque = liftForce * pulleyRadius;
  const recommendedLiftTorque = pulleyTorque * safetyFactor;
  const availableLiftTorque = motorTorque * 20 * efficiency;
  const liftSafetyMargin = availableLiftTorque / recommendedLiftTorque;
  const armTorque = loadMass * 9.81 * armLength;
  return [
    {
      mechanism: 'Wheel speed',
      assumptions: { motorRpm, gearRatio, wheelDiameter, efficiency },
      formula: 'linear_speed = (motor_rpm / gear_ratio) * (pi * wheel_diameter) / 60 * efficiency',
      calculation: `${wheelRpm.toFixed(1)} rpm * ${wheelCircumference.toFixed(3)} m / 60 * ${efficiency}`,
      result: `${linearSpeed.toFixed(2)} m/s`,
      safetyFactor: 'Use driver cap if team is beginner',
      recommendation: linearSpeed > 1.6 ? 'Add slow mode and current limits.' : 'Conservative enough for early driver practice.',
      warning: linearSpeed > 2 ? 'High top speed may be difficult for new drivers.' : null,
    },
    {
      mechanism: 'Wheel torque',
      assumptions: { motorTorque, gearRatio, efficiency, wheelDiameter },
      formula: 'force = (motor_torque * gear_ratio * efficiency) / wheel_radius',
      calculation: `${wheelTorque.toFixed(2)} Nm / ${(wheelDiameter / 2).toFixed(3)} m`,
      result: `${forceAtWheel.toFixed(1)} N per motor`,
      safetyFactor: 'Traction and carpet conditions dominate final result',
      recommendation: 'Use current limiting if wheels brown out during pushing.',
      warning: null,
    },
    {
      mechanism: 'Linear lift',
      assumptions: { loadMass, pulleyRadius, safetyFactor, availableLiftTorque: Number(availableLiftTorque.toFixed(2)) },
      formula: 'recommended_torque = mass * gravity * pulley_radius * safety_factor',
      calculation: `${loadMass} kg * 9.81 * ${pulleyRadius} m * ${safetyFactor}`,
      result: `${recommendedLiftTorque.toFixed(2)} Nm required, ${liftSafetyMargin.toFixed(2)}x margin estimated`,
      safetyFactor: safetyFactor.toFixed(1),
      recommendation: liftSafetyMargin > 1.5 ? 'Acceptable starter margin; verify slide friction.' : 'Increase gear ratio or reduce load.',
      warning: liftSafetyMargin < 1.5 ? 'Margin is too low for a binding FTC slide.' : null,
    },
    {
      mechanism: 'Arm torque',
      assumptions: { loadMass, armLength, safetyFactor },
      formula: 'required_torque = load_weight * arm_length',
      calculation: `${loadMass} kg * 9.81 * ${armLength} m`,
      result: `${(armTorque * safetyFactor).toFixed(2)} Nm recommended after safety factor`,
      safetyFactor: safetyFactor.toFixed(1),
      recommendation: 'Limit servo travel and avoid hard stops.',
      warning: null,
    },
  ];
}
