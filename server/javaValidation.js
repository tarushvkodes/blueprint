import { nowIso } from './utils.js';

const requiredFiles = [
  'Constants.java',
  'RobotHardware.java',
  'DriveSubsystem.java',
  'LiftSubsystem.java',
  'TeleOpMain.java',
  'AutoMain.java',
  'README.md',
];

const expectedClasses = {
  'Constants.java': 'Constants',
  'RobotHardware.java': 'RobotHardware',
  'DriveSubsystem.java': 'DriveSubsystem',
  'LiftSubsystem.java': 'LiftSubsystem',
  'TeleOpMain.java': 'TeleOpMain',
  'AutoMain.java': 'AutoMain',
};

export function validateGeneratedJava(code = {}) {
  const issues = [];
  const warnings = [];
  const javaFiles = Object.entries(code).filter(([file]) => file.endsWith('.java'));

  for (const file of requiredFiles) {
    if (!code[file]) issues.push(`${file} is missing from the generated code package.`);
  }

  for (const [file, className] of Object.entries(expectedClasses)) {
    const content = code[file] || '';
    if (!content.includes('package org.firstinspires.ftc.teamcode;')) {
      issues.push(`${file} must use package org.firstinspires.ftc.teamcode.`);
    }
    if (!new RegExp(`\\bclass\\s+${className}\\b`).test(content) && !new RegExp(`\\bfinal\\s+class\\s+${className}\\b`).test(content)) {
      issues.push(`${file} must declare class ${className}.`);
    }
  }

  const robotHardware = code['RobotHardware.java'] || '';
  const hardwareNames = Array.from(robotHardware.matchAll(/hardwareMap\.get\([^,]+,\s*"([^"]+)"\)/g)).map((match) => match[1]);
  if (hardwareNames.length < 6) {
    issues.push('RobotHardware.java should configure all drivetrain, lift, and intake devices.');
  }
  for (const name of hardwareNames) {
    if (!/^[a-z0-9_]+$/.test(name)) {
      warnings.push(`Hardware name "${name}" should stay lowercase snake_case to reduce Driver Station config mistakes.`);
    }
  }

  const teleOp = code['TeleOpMain.java'] || '';
  if (!teleOp.includes('@TeleOp')) issues.push('TeleOpMain.java needs an @TeleOp annotation.');
  if (!teleOp.includes('waitForStart()')) issues.push('TeleOpMain.java must wait for start before driving.');
  if (!teleOp.includes('opModeIsActive()')) issues.push('TeleOpMain.java should loop only while opModeIsActive().');

  const auto = code['AutoMain.java'] || '';
  if (!auto.includes('@Autonomous')) issues.push('AutoMain.java needs an @Autonomous annotation.');
  if (!auto.includes('waitForStart()')) issues.push('AutoMain.java must wait for start before autonomous motion.');

  const drive = code['DriveSubsystem.java'] || '';
  if (!drive.includes('Range.clip')) warnings.push('DriveSubsystem.java should clip drive power before setting motor output.');

  if (!code['README.md']?.includes('Hardware configuration names')) {
    warnings.push('Generated README should list the Driver Station hardware names.');
  }

  return {
    ok: issues.length === 0,
    checkedAt: nowIso(),
    checkedFiles: javaFiles.map(([file]) => file),
    requiredFiles,
    hardwareNames,
    issues,
    warnings,
    note: 'Static validation only. Compile inside a real FTC SDK project before robot use.',
  };
}
