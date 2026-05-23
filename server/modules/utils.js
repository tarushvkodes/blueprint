export function nowIso() {
  return new Date().toISOString();
}

export function slugId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

export function tokenize(text) {
  return normalizeWhitespace(text).toLowerCase().match(/[a-z0-9#.-]+/g) || [];
}

export function scoreText(text, query) {
  const haystack = new Set(tokenize(text));
  const terms = tokenize(query);
  return terms.reduce((score, term) => score + (haystack.has(term) ? 3 : normalizeWhitespace(text).toLowerCase().includes(term) ? 1 : 0), 0);
}
