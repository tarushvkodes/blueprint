export function analyzeDriverLogs(logs = []) {
  const events = Array.isArray(logs) ? logs : String(logs).split(/\n/).map((line) => line.split(','));
  const counts = new Map();
  for (const event of events) {
    const text = Array.isArray(event) ? event.join(' ') : JSON.stringify(event);
    for (const token of text.match(/\b(gamepad[12]\.)?[abxy]|left_bumper|right_bumper|left_trigger|right_trigger|dpad_[a-z]+\b/gi) || []) {
      counts.set(token.toLowerCase(), (counts.get(token.toLowerCase()) || 0) + 1);
    }
  }
  const hot = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  return {
    eventCount: events.length,
    buttonUsage: hot.map(([button, count]) => ({ button, count })),
    suggestions: [
      hot.some(([button]) => /a|right_trigger/.test(button)) ? 'Repeated scoring inputs detected; consider a single right bumper score macro.' : 'No obvious repeated score macro found yet.',
      'Keep slow mode on left bumper for alignment tasks.',
      'Use lift preset buttons instead of manual stick-only control once the lift is reliable.',
    ],
    recommendedMap: {
      driver1: { leftStick: 'drive/strafe', rightStickX: 'turn', leftBumper: 'slow mode', rightBumper: 'align/score assist' },
      driver2: { a: 'intake close', b: 'intake open', y: 'high preset', x: 'low preset' },
    },
  };
}
