export function createRulesModule({ chunksRef, normalizeWhitespace, scoreText }) {
  function quoteRule(query, { preferManual = true } = {}) {
    const matches = chunksRef.value
      .map((chunk) => {
        const manualBoost = preferManual && chunk.type === 'manual' ? 8 : 0;
        const requirementsPenalty = preferManual && chunk.type === 'requirements' ? -4 : 0;
        const ruleBoost = chunk.ruleNumber ? 4 : 0;
        return {
          chunk,
          score: scoreText(`${chunk.ruleNumber || ''} ${chunk.section} ${chunk.text}`, query) + manualBoost + requirementsPenalty + ruleBoost,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ chunk }) => ({
        ruleNumber: chunk.ruleNumber || 'Unnumbered',
        manualSection: chunk.section || chunk.title,
        sourceDocument: chunk.title,
        version: chunk.version,
        sourceUrl: chunk.sourceUrl,
        explanation: normalizeWhitespace(chunk.text).slice(0, 260),
        confidence: chunk.ruleNumber ? 'Medium' : 'Low',
      }));
    return matches.length ? matches : [{
      ruleNumber: 'Citation required',
      manualSection: 'Not found in indexed chunks',
      sourceDocument: 'Indexed documents',
      version: null,
      explanation: 'The app should refuse a definitive rule claim until the current manual section is indexed and reviewed.',
      confidence: 'Low',
    }];
  }

  return { quoteRule };
}
