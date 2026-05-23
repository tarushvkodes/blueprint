import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

export const RULES_REFUSAL_MESSAGE = "Based on what is indexed, I can't cite this safely — please upload or link the current FTC manual and ask again.";

const RULE_NUMBER_PATTERN = /\b[RGQ]\d{3}\b/i;
const ALL_RULE_NUMBERS_PATTERN = /\b[RGQ]\d{3}\b/gi;
const ALLOWED_FIRST_HOSTS = new Set([
  'firstinspires.org',
  'www.firstinspires.org',
  'ftc-resources.firstinspires.org',
  'cdn.firstinspires.org',
]);

function fallbackNormalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isLikelyPdf(buffer) {
  return Buffer.from(buffer).subarray(0, 5).toString('utf8') === '%PDF-';
}

function statusError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function firstMatch(text, regex, fallback = '') {
  return String(text || '').match(regex)?.[1]?.trim() || fallback;
}

function normalizeRuleNumber(value) {
  return value ? value.toUpperCase() : null;
}

function extractRuleNumber(text) {
  return normalizeRuleNumber(String(text || '').match(RULE_NUMBER_PATTERN)?.[0] || null);
}

function extractRuleNumbers(text) {
  return Array.from(new Set((String(text || '').match(ALL_RULE_NUMBERS_PATTERN) || []).map((rule) => rule.toUpperCase())));
}

function parsePdfDate(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^D:?(\d{4})(\d{2})?(\d{2})?/);
  if (!match) return null;
  const [, year, month = '01', day = '01'] = match;
  return `${year}-${month}-${day}`;
}

function extractVersionValue(value) {
  const source = String(value || '');
  if (!source) return null;
  const teamUpdate = source.match(/(?:^|[^A-Za-z0-9])(?:TU|Team Update)\s*#?\s*(\d{1,3})(?:$|[^A-Za-z0-9])/i);
  if (teamUpdate) return `TU${teamUpdate[1]}`;
  const version = source.match(/\b(?:version|revision|rev)\s*[:#-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{0,24})\b/i);
  if (version) return version[1];
  const compactVersion = source.match(/\bv(\d+(?:\.\d+){0,3})\b/i);
  if (compactVersion) return `v${compactVersion[1]}`;
  const season = source.match(/\b(20\d{2}-20\d{2})\b/);
  if (season) return season[1];
  return null;
}

function extractVersion({ provided, metadata = {}, fileName = '', text = '', modifiedAt = null }) {
  if (provided) return provided;
  const candidates = [
    fileName,
    metadata.Title,
    metadata.Subject,
    metadata.Keywords,
    text.slice(0, 2400),
  ];
  for (const candidate of candidates) {
    const version = extractVersionValue(candidate);
    if (version) return version;
  }
  const modifiedDate = parsePdfDate(metadata.ModDate) || (modifiedAt instanceof Date ? modifiedAt.toISOString().slice(0, 10) : null);
  return modifiedDate ? `modified-${modifiedDate}` : 'unknown';
}

function titleFromSource(source, fallback = 'Uploaded FTC manual') {
  if (!source) return fallback;
  try {
    const url = new URL(source);
    const last = url.pathname.split('/').filter(Boolean).pop();
    if (last) return decodeURIComponent(last).replace(/[_-]+/g, ' ');
  } catch {
    const base = path.basename(source);
    if (base) return base;
  }
  return fallback;
}

function extractSeasonName(text, title, normalizeWhitespace) {
  const seasonName = firstMatch(
    text,
    /Competition Manual\s+([A-Z0-9][A-Z0-9™\s-]{2,80}?)\s+Presented by/i,
    firstMatch(text, /\b([A-Z][A-Z0-9™\s-]{2,80})\s+Presented by/i, ''),
  );
  if (seasonName) return normalizeWhitespace(seasonName).replace(/™/g, '').trim();
  const titleSeason = String(title || '').match(/\b(20\d{2}-20\d{2})\b/)?.[1];
  if (titleSeason) return titleSeason;
  return normalizeWhitespace(String(title || '').replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ')) || 'Uploaded season';
}

function snippetAround(text, pattern, radius, normalizeWhitespace) {
  const source = String(text || '');
  const index = source.toLowerCase().indexOf(String(pattern).toLowerCase());
  if (index < 0) return '';
  return normalizeWhitespace(source.slice(Math.max(0, index - radius), index + radius));
}

function buildSeasonSource({ text, title, type, version, pages, sourceUrl, checksum, normalizeWhitespace, nowIso }) {
  const normalized = normalizeWhitespace(text);
  const manualTitle = firstMatch(
    text,
    /(20\d{2}-20\d{2}\s+FIRST[^]+?Competition Manual\s+[A-Z0-9™\s-]+Presented by [A-Za-z0-9 ]+)/,
    title,
  );
  const seasonName = extractSeasonName(text, title, normalizeWhitespace);
  const scoringSummary = snippetAround(text, 'Game Overview', 520, normalizeWhitespace) || normalized.slice(0, 600);
  const pointValues = snippetAround(text, 'Point Values', 520, normalizeWhitespace) || snippetAround(text, 'Scoring', 520, normalizeWhitespace);
  const robotConstraints = [
    snippetAround(text, 'R101', 520, normalizeWhitespace),
    snippetAround(text, 'R401', 520, normalizeWhitespace),
    snippetAround(text, 'ROBOT Construction Rules', 520, normalizeWhitespace),
  ].filter(Boolean);
  const citations = extractRuleNumbers(text).slice(0, 8).map((rule) => ({
    rule,
    query: rule,
    note: snippetAround(text, rule, 520, normalizeWhitespace),
  })).filter((citation) => citation.note);
  return {
    sourceDocument: title,
    sourceUrl,
    type,
    title: manualTitle,
    seasonName,
    manualVersion: version,
    version,
    pages,
    checksum,
    extractedAt: nowIso(),
    isSample: false,
    scoringSummary,
    pointValues,
    robotConstraints,
    fieldFacts: [],
    citations,
  };
}

function isSectionHeading(line) {
  const text = String(line || '').trim();
  if (text.length < 4 || text.length > 140) return false;
  if (RULE_NUMBER_PATTERN.test(text)) return false;
  if (/[.!?]$/.test(text)) return false;
  if (/^(table|figure)\s+\d+/i.test(text)) return false;
  if (/^(section|appendix)\s+[A-Z0-9]+(?:\s*[-:]\s*)?.{2,120}$/i.test(text)) return true;
  if (/^\d+(?:\.\d+){0,4}\s+[A-Z][A-Za-z0-9™ /&().,'-]{3,120}$/.test(text)) return true;
  if (/^(game overview|robot construction rules|game rules|scoring|inspection|control system|team updates|field setup|game manual|competition manual|definitions|tournament rules)$/i.test(text)) return true;
  const words = text.split(/\s+/);
  const titleCaseWords = words.filter((word) => /^[A-Z][a-z0-9/&().,'-]*$/.test(word));
  return words.length >= 2 && words.length <= 9 && titleCaseWords.length / words.length >= 0.7;
}

function splitPageUnits(pageText, initialSection, normalizeWhitespace) {
  const units = [];
  let section = initialSection;
  let paragraph = [];

  function flushParagraph() {
    const text = normalizeWhitespace(paragraph.join(' '));
    if (text) units.push({ text, section });
    paragraph = [];
  }

  for (const rawLine of String(pageText || '').split(/\r?\n/)) {
    const line = normalizeWhitespace(rawLine);
    if (!line) {
      flushParagraph();
      continue;
    }
    if (isSectionHeading(line)) {
      flushParagraph();
      section = line;
      units.push({ text: line, section });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return { units, section };
}

export function chunkDocumentPages(pages, {
  documentId,
  title,
  sourceUrl,
  type,
  version,
  pageSize = 1200,
  normalizeWhitespace = fallbackNormalizeWhitespace,
}) {
  const chunks = [];
  let currentSection = title;
  let chunkIndex = 0;

  for (const page of pages || []) {
    const pageNumber = Number(page.num || page.page || page.pageNumber || chunks.length + 1);
    const { units, section } = splitPageUnits(page.text, currentSection, normalizeWhitespace);
    currentSection = section || currentSection;
    let buffer = '';
    let bufferSection = currentSection;

    function flushBuffer() {
      const text = buffer.trim();
      if (!text) return;
      chunkIndex += 1;
      chunks.push({
        id: `${documentId}_chunk_${chunkIndex}`,
        documentId,
        title,
        sourceDocument: title,
        sourceUrl,
        type,
        version,
        section: bufferSection || title,
        page: pageNumber,
        ruleNumber: extractRuleNumber(text),
        text,
        outdated: false,
      });
      buffer = '';
    }

    for (const unit of units) {
      if (unit.section !== bufferSection && buffer) flushBuffer();
      bufferSection = unit.section || bufferSection || title;
      if ((buffer + unit.text).length > pageSize && buffer) flushBuffer();
      buffer += `${unit.text}\n\n`;
    }
    flushBuffer();
  }

  return chunks;
}

async function parsePdfBuffer(buffer) {
  const parser = new PDFParse({ data: Buffer.from(buffer) });
  try {
    const info = await parser.getInfo().catch(() => null);
    const result = await parser.getText({ lineEnforce: true, pageJoiner: '' });
    return {
      text: result.text || '',
      pages: (result.pages || []).map((page) => ({ num: page.num, text: page.text || '' })),
      total: result.total || result.pages?.length || null,
      metadata: info?.info || {},
    };
  } finally {
    await parser.destroy();
  }
}

function markReplacedDocuments({ documents, chunksRef, newDocument }) {
  let replacedDocumentId = null;
  const seasonName = newDocument.seasonName || newDocument.seasonSource?.seasonName;
  if (!seasonName) return replacedDocumentId;

  for (const existing of documents.values()) {
    const existingSeason = existing.seasonName || existing.seasonSource?.seasonName;
    if (!existingSeason || existing.id === newDocument.id) continue;
    if (existingSeason.toLowerCase() !== seasonName.toLowerCase()) continue;
    if (existing.version === newDocument.version && existing.checksum === newDocument.checksum) continue;

    existing.outdated = true;
    existing.replacedByDocumentId = newDocument.id;
    replacedDocumentId = existing.id;
    chunksRef.value = chunksRef.value.map((chunk) => (
      chunk.documentId === existing.id ? { ...chunk, outdated: true } : chunk
    ));
  }

  return replacedDocumentId;
}

function citationConfidence({ chunk, score, query }) {
  const queryRules = extractRuleNumbers(query);
  if (chunk.ruleNumber && queryRules.includes(chunk.ruleNumber)) return 'high';
  if (chunk.ruleNumber && score >= 12) return 'high';
  if (chunk.ruleNumber || score >= 8) return 'medium';
  return 'low';
}

function formatCitation({ chunk, score, query, normalizeWhitespace }) {
  const note = normalizeWhitespace(chunk.text).slice(0, 260);
  const citation = {
    ruleNumber: chunk.ruleNumber || 'Unnumbered',
    section: chunk.section || chunk.title || 'Indexed document',
    sourceDocument: chunk.sourceDocument || chunk.title || 'Indexed document',
    version: chunk.version || null,
    page: chunk.page ?? null,
    confidence: citationConfidence({ chunk, score, query }),
    note,
  };
  Object.defineProperties(citation, {
    manualSection: { value: citation.section, enumerable: false },
    explanation: { value: note, enumerable: false },
    sourceUrl: { value: chunk.sourceUrl || null, enumerable: false },
  });
  return citation;
}

function isRulesFlavoredQuestion(prompt) {
  const text = String(prompt || '');
  return RULE_NUMBER_PATTERN.test(text)
    || /\b(rule|rules|manual|legal|legality|illegal|allowed|permitted|inspection|inspector|penalty|penalties|foul|violation|q&a|qa|size limit|robot size|dimension|extension)\b/i.test(text);
}

export function isOfficialFirstPdfUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  return parsed.protocol === 'https:' && ALLOWED_FIRST_HOSTS.has(host);
}

function contentDispositionFilename(value) {
  const match = String(value || '').match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return match ? decodeURIComponent(match[1].replace(/"$/g, '')) : null;
}

export function createRulesModule({ chunksRef, normalizeWhitespace = fallbackNormalizeWhitespace, scoreText }) {
  async function ingestDocument({
    filePath = null,
    data = null,
    title = '',
    type = 'manual',
    sourceUrl = null,
    version = null,
    documents,
    nowIso = () => new Date().toISOString(),
  }) {
    if (!documents) throw new Error('rules.ingestDocument requires a documents map');
    const buffer = data ? Buffer.from(data) : await fsp.readFile(filePath);
    const stat = filePath ? await fsp.stat(filePath).catch(() => null) : null;
    const displayTitle = title || titleFromSource(sourceUrl || filePath);
    const ext = path.extname(displayTitle || filePath || '').toLowerCase();
    const pdf = ext === '.pdf' || isLikelyPdf(buffer);
    const parsed = pdf
      ? await parsePdfBuffer(buffer)
      : { text: buffer.toString('utf8'), pages: [{ num: 1, text: buffer.toString('utf8') }], total: 1, metadata: {} };
    const checksum = sha256(buffer);
    const resolvedVersion = extractVersion({
      provided: version,
      metadata: parsed.metadata,
      fileName: displayTitle,
      text: parsed.text,
      modifiedAt: stat?.mtime || null,
    });
    const id = `${String(type).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}_${checksum.slice(0, 16)}`;
    const pages = parsed.total || parsed.pages.length || null;
    const documentSourceUrl = sourceUrl || filePath || displayTitle;
    const seasonName = type === 'manual' || type === 'season-resource'
      ? extractSeasonName(parsed.text, displayTitle, normalizeWhitespace)
      : null;
    const doc = {
      id,
      title: displayTitle,
      type,
      sourceUrl: documentSourceUrl,
      version: resolvedVersion,
      pages,
      checksum,
      outdated: false,
      ingestedAt: nowIso(),
      summary: normalizeWhitespace(parsed.text).slice(0, 900),
      seasonName,
      seasonSource: type === 'manual' || type === 'season-resource'
        ? buildSeasonSource({
          text: parsed.text,
          title: displayTitle,
          type,
          version: resolvedVersion,
          pages,
          sourceUrl: documentSourceUrl,
          checksum,
          normalizeWhitespace,
          nowIso,
        })
        : null,
    };
    const replacedDocumentId = markReplacedDocuments({ documents, chunksRef, newDocument: doc });

    documents.set(id, doc);
    chunksRef.value = chunksRef.value.filter((chunk) => chunk.documentId !== id);
    chunksRef.value.push(...chunkDocumentPages(parsed.pages, {
      documentId: id,
      title: displayTitle,
      sourceUrl: documentSourceUrl,
      type,
      version: resolvedVersion,
      normalizeWhitespace,
    }));

    return { document: doc, replacedDocumentId };
  }

  async function ingestOfficialUrl({ url, title = '', type = 'manual', version = null, documents, nowIso }) {
    if (!isOfficialFirstPdfUrl(url)) {
      throw statusError(400, 'Official URL ingest only accepts HTTPS PDFs from firstinspires.org, ftc-resources.firstinspires.org, or cdn.firstinspires.org.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw statusError(400, `Unable to fetch official PDF (${response.status}).`);

    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 50_000_000) throw statusError(400, 'Official PDF is too large to ingest safely.');

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || '';
    const pathLooksPdf = new URL(url).pathname.toLowerCase().endsWith('.pdf');
    if (!isLikelyPdf(buffer) || (!pathLooksPdf && !/pdf/i.test(contentType))) {
      throw statusError(400, 'Official URL must resolve to a PDF document.');
    }

    const inferredTitle = title
      || contentDispositionFilename(response.headers.get('content-disposition'))
      || titleFromSource(url, 'Official FTC manual.pdf');
    return ingestDocument({
      data: buffer,
      title: inferredTitle,
      type,
      sourceUrl: url,
      version,
      documents,
      nowIso,
    });
  }

  function quoteRule(query, {
    preferManual = true,
    documentIds = null,
    includeOutdated = false,
    limit = 3,
  } = {}) {
    const allowedDocuments = Array.isArray(documentIds) && documentIds.length
      ? new Set(documentIds)
      : null;
    const queryRules = extractRuleNumbers(query);
    return chunksRef.value
      .filter((chunk) => !allowedDocuments || allowedDocuments.has(chunk.documentId))
      .filter((chunk) => includeOutdated || !chunk.outdated)
      .map((chunk) => {
        const haystack = `${chunk.ruleNumber || ''} ${chunk.section || ''} ${chunk.title || ''} ${chunk.text || ''}`;
        const exactRuleBoost = chunk.ruleNumber && queryRules.includes(chunk.ruleNumber) ? 12 : 0;
        const manualBoost = preferManual && (chunk.type === 'manual' || chunk.type === 'season-resource') ? 8 : 0;
        const officialBoost = isOfficialFirstPdfUrl(chunk.sourceUrl) ? 2 : 0;
        const requirementsPenalty = preferManual && chunk.type === 'requirements' ? -4 : 0;
        const ruleBoost = chunk.ruleNumber ? 4 : 0;
        return {
          chunk,
          score: scoreText(haystack, query) + exactRuleBoost + manualBoost + officialBoost + requirementsPenalty + ruleBoost,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((entry) => formatCitation({ ...entry, query, normalizeWhitespace }));
  }

  function assertCitable(prompt, projectId, { documentIds = null } = {}) {
    if (!isRulesFlavoredQuestion(prompt)) {
      return { ok: true, refused: false, projectId, citations: [] };
    }
    const citations = quoteRule(prompt, { documentIds });
    if (!citations.length) {
      return {
        ok: false,
        refused: true,
        projectId,
        message: RULES_REFUSAL_MESSAGE,
        citations: [],
      };
    }
    return { ok: true, refused: false, projectId, citations };
  }

  return {
    assertCitable,
    ingestDocument,
    ingestOfficialUrl,
    isRulesFlavoredQuestion,
    quoteRule,
  };
}
