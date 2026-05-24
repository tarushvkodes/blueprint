import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeDriverLogs } from '../server/generators/project.js';

test('driver log analyzer parses CSV timestamps and repeated control sequences', () => {
  const csv = [
    'timestamp,phase,driver,button,value',
    '0.10,autonomous,driver1,left_bumper,1',
    '31.00,teleop,driver2,a,1',
    '31.40,teleop,driver2,right_trigger,1',
    '38.00,teleop,driver2,a,1',
    '38.35,teleop,driver2,right_trigger,1',
    '120.00,endgame,driver1,dpad_up,1',
  ].join('\n');
  const analysis = analyzeDriverLogs(csv);

  assert.equal(analysis.eventCount, 6);
  assert.ok(analysis.buttonUsage.some((item) => item.button === 'a' && item.count === 2));
  assert.ok(analysis.repeatedSequences.some((item) => item.sequence.join(' -> ') === 'a -> right_trigger'));
  assert.ok(analysis.timingGaps.maxSeconds > 1);
  assert.ok(analysis.phaseBreakdown.some((item) => item.phase === 'teleop' && item.count >= 4));
});

test('driver log analyzer parses JSON events and returns heatmap data', () => {
  const analysis = analyzeDriverLogs(JSON.stringify({
    events: [
      { time: 32, gamepad: 'gamepad1', control: 'left_bumper', value: 1 },
      { time: 33, gamepad: 'gamepad1', control: 'left_bumper', value: 0 },
      { time: 34, gamepad: 'gamepad2', control: 'y', value: 1 },
    ],
  }));

  assert.equal(analysis.eventCount, 3);
  assert.ok(analysis.heatmap.some((item) => item.control === 'left_bumper' && item.intensity === 1));
  assert.equal(analysis.recommendedMap.driver1.leftBumper, 'slow mode');
});
