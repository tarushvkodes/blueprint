import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { defaultFiles, uploadDir } from './config.js';
import { state } from './state.js';
import { firstMatch, normalizeWhitespace, nowIso, scoreText, slugId, snippetAround } from './utils.js';

const rulePatterns = [
  /\b[A-Z]{1,3}\d{2,4}[A-Z]?\b/,
  /<([A-Z]{1,3}\d{2,4}[A-Z]?)>/,
];

function inferRuleNumber(text) {
  const source = String(text || '');
  for (const pattern of rulePatterns) {
    const match = source.match(pattern);
    if (match) return match[1] || match[0];
  }
  return null;
}

function inferSection(paragraph, fallback) {
  const normalized = normalizeWhitespace(paragraph);
  const maybeNumbered = normalized.match(/^(\d+(?:\.\d+){0,4}\s+[A-Z][A-Za-z0-9 /&().:'-]{3,90})/);
  if (maybeNumbered) return maybeNumbered[1];
  if (/[.!?]$/.test(normalized)) return fallback;
  const maybeNamed = normalized.match(/^([A-Z][A-Za-z0-9 /&():'-]{4,90})$/);
  return maybeNamed ? maybeNamed[1] : fallback;
}

function makeChunk({ documentId, title, sourceUrl, type, version, sourceDate, section, page, text }) {
  return {
    id: slugId('chunk'),
    documentId,
    title,
    sourceUrl,
    type,
    version,
    sourceDate,
    section,
    page,
    ruleNumber: inferRuleNumber(text),
    text: text.trim(),
  };
}

export function inferSourceType({ title = '', sourceUrl = '', fallback = 'season-resource' } = {}) {
  const text = `${title} ${sourceUrl}`.toLowerCase();
  if (/q[&-]?a|question.*answer|answers/.test(text)) return 'qa';
  if (/team[ _-]?update|tu\d+/.test(text)) return 'team-update';
  if (/field.*drawing|field.*setup|field.*assembly/.test(text)) return 'field-drawing';
  if (/inspection|inspect/.test(text)) return 'inspection-checklist';
  if (/competition.*manual|game.*manual|manual/.test(text)) return 'manual';
  return fallback;
}

export function chunkText(text, { documentId, title, sourceUrl, type, version, sourceDate = null, page = null, pageSize = 1200 }) {
  const chunks = [];
  const paragraphs = String(text || '').split(/\n\s*\n/g).map(normalizeWhitespace).filter(Boolean);
  let buffer = '';
  let section = title;
  for (const paragraph of paragraphs) {
    section = inferSection(paragraph, section);
    if ((buffer + paragraph).length > pageSize && buffer) {
      chunks.push(makeChunk({
        documentId,
        title,
        sourceUrl,
        type,
        version,
        sourceDate,
        section,
        page,
        text: buffer.trim(),
      }));
      buffer = '';
    }
    buffer += `${paragraph}\n\n`;
  }
  if (buffer.trim()) {
    chunks.push(makeChunk({
      documentId,
      title,
      sourceUrl,
      type,
      version,
      sourceDate,
      section,
      page,
      text: buffer.trim(),
    }));
  }
  return chunks;
}

function chunkDocumentText(text, options) {
  if (Array.isArray(options.pagesText) && options.pagesText.length) {
    return options.pagesText.flatMap((page) => chunkText(page.text, { ...options, page: page.page }));
  }
  return chunkText(text, options);
}

async function parsePdf(filePath) {
  const parser = new PDFParse({ url: filePath });
  try {
    const result = await parser.getText();
    const pagesText = Array.isArray(result.pages)
      ? result.pages.map((page) => ({ page: page.num, text: page.text || '' })).filter((page) => page.text.trim())
      : [];
    return { text: result.text || '', pages: result.total || result.numpages || null, pagesText };
  } finally {
    await parser.destroy();
  }
}

function extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl }) {
  const normalized = normalizeWhitespace(text);
  const manualTitle = firstMatch(
    text,
    /(20\d{2}-20\d{2}\s+FIRST[^]+?Competition Manual\s+[A-Z0-9™\s]+Presented by [A-Za-z0-9 ]+)/,
    title,
  );
  const seasonName = firstMatch(text, /Competition Manual\s+([A-Z0-9™ ]+?)\s+Presented by/i, firstMatch(text, /\b([A-Z][A-Z0-9]+)™\s+Presented by/i, 'Uploaded season'));
  const teamUpdate = firstMatch(text, /Team Update\s+(\d+)/i, null);
  const manualVersion = version || (teamUpdate ? `TU${teamUpdate}` : firstMatch(text, /Section\s+\d+[^V]+V(\d+)/i, null));
  const scoringSummary = snippetAround(text, 'Game Overview') || normalized.slice(0, 600);
  const pointValues = snippetAround(text, 'Table 10-2') || snippetAround(text, 'Point Values');
  const robotConstraints = [
    snippetAround(text, 'R101'),
    snippetAround(text, 'R105'),
    snippetAround(text, 'ROBOT Construction Rules'),
  ].filter(Boolean);
  const fieldFacts = [
    snippetAround(text, 'GOAL is'),
    snippetAround(text, 'OBELISK is'),
    snippetAround(text, 'CLASSIFIER is'),
  ].filter(Boolean);
  const citations = [
    { rule: 'R101', query: 'R101', note: snippetAround(text, 'R101') },
    { rule: 'R105', query: 'R105', note: snippetAround(text, 'R105') },
    { rule: 'Scoring', query: 'Table 10-2', note: pointValues },
  ].filter((citation) => citation.note);

  return {
    id: slugId('season'),
    sourceDocument: title,
    sourceUrl,
    type,
    title: manualTitle,
    seasonName: normalizeWhitespace(seasonName).replace(/™/g, '').trim() || 'Uploaded season',
    manualVersion,
    pages,
    extractedAt: nowIso(),
    isSample: type === 'manual' && /DECODE/i.test(title) && sourceUrl === defaultFiles.manual,
    scoringSummary,
    pointValues,
    robotConstraints,
    fieldFacts,
    citations,
  };
}

export async function ingestDocument({ filePath, title, type, sourceUrl = filePath, version = null, sourceDate = null }) {
  const stat = await fsp.stat(filePath);
  const ingestedAt = nowIso();
  const effectiveSourceDate = sourceDate || ingestedAt;
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let pages = null;
  let pagesText = [];
  if (ext === '.pdf') {
    const parsed = await parsePdf(filePath);
    text = parsed.text;
    pages = parsed.pages;
    pagesText = parsed.pagesText;
  } else if (type === 'cad' || stat.size > 5_000_000) {
    const handle = await fsp.open(filePath, 'r');
    try {
      const sample = Buffer.alloc(Math.min(16_384, stat.size));
      await handle.read(sample, 0, sample.length, 0);
      text = [
        `${title} reference file metadata`,
        `Path: ${filePath}`,
        `Size bytes: ${stat.size}`,
        `Modified: ${stat.mtime.toISOString()}`,
        'Header sample:',
        sample.toString('utf8').slice(0, 12_000),
      ].join('\n');
    } finally {
      await handle.close();
    }
  } else {
    text = await fsp.readFile(filePath, 'utf8');
  }
  const id = `${type}_${Buffer.from(filePath).toString('base64url').slice(0, 12)}`;
  const doc = {
    id,
    title,
    type,
    sourceUrl,
    version,
    sourceDate: effectiveSourceDate,
    pages,
    checksum: `${stat.size}-${Math.round(stat.mtimeMs)}`,
    ingestedAt,
    summary: normalizeWhitespace(text).slice(0, 900),
    seasonSource: type === 'manual' || type === 'season-resource'
      ? extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl })
      : null,
  };
  state.documents.set(id, doc);
  state.chunks = state.chunks.filter((chunk) => chunk.documentId !== id);
  state.chunks.push(...chunkDocumentText(text, { documentId: id, title, sourceUrl, type, version, sourceDate: effectiveSourceDate, pagesText }));
  return doc;
}

export async function ingestDocumentFromUrl({ url, title = null, type = null, version = null, sourceDate = null }) {
  const parsedUrl = new URL(url);
  if (!['https:', 'http:'].includes(parsedUrl.protocol)) {
    throw new Error('Only http(s) document URLs are supported.');
  }
  const response = await fetch(parsedUrl);
  if (!response.ok) {
    throw new Error(`Document download failed with ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') || '';
  const inferredTitle = title || decodeURIComponent(path.basename(parsedUrl.pathname)) || parsedUrl.hostname;
  if (!/pdf/i.test(contentType) && !/\.pdf($|\?)/i.test(parsedUrl.pathname)) {
    throw new Error('Only PDF URL ingestion is supported in this MVP.');
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 25 * 1024 * 1024) {
    throw new Error('PDF is larger than the 25 MB MVP ingestion limit.');
  }
  await fsp.mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${slugId('url-doc')}.pdf`);
  await fsp.writeFile(filePath, bytes);
  const sourceType = type || inferSourceType({ title: inferredTitle, sourceUrl: url });
  return ingestDocument({
    filePath,
    title: inferredTitle,
    type: sourceType,
    sourceUrl: url,
    version,
    sourceDate,
  });
}

export async function ingestDefaultReferences() {
  const docs = [];
  if (fs.existsSync(defaultFiles.writeup)) {
    docs.push(await ingestDocument({ filePath: defaultFiles.writeup, title: 'Blueprint Requirements Writeup', type: 'requirements', version: 'local-writeup' }));
  }
  if (fs.existsSync(defaultFiles.manual)) {
    docs.push(await ingestDocument({ filePath: defaultFiles.manual, title: 'DECODE Competition Manual TU32', type: 'manual', version: 'TU32' }));
  }
  return docs;
}

function isOfficialSource(sourceUrl = '') {
  return /firstinspires\.org|ftc-docs\.firstinspires\.org|github\.com\/FIRST-Tech-Challenge/i.test(String(sourceUrl));
}

export function sourceHealthForDocument(doc = {}, allDocs = Array.from(state.documents.values())) {
  const chunks = state.chunks.filter((chunk) => chunk.documentId === doc.id);
  const ruleCount = new Set(chunks.map((chunk) => chunk.ruleNumber).filter(Boolean)).size;
  const warnings = [];
  const relatedDocs = allDocs.filter((candidate) => candidate.type === doc.type && candidate.id !== doc.id);
  const hasVersionConflict = Boolean(doc.version && relatedDocs.some((candidate) => candidate.version && candidate.version !== doc.version));
  const sourceAgeDays = doc.sourceDate
    ? Math.floor((Date.now() - Date.parse(doc.sourceDate)) / 86_400_000)
    : null;

  if (!chunks.length) warnings.push('No searchable chunks were produced.');
  if ((doc.type === 'manual' || doc.type === 'season-resource') && !doc.version && !doc.seasonSource?.manualVersion) {
    warnings.push('Manual version was not detected.');
  }
  if ((doc.type === 'manual' || doc.type === 'team-update') && !isOfficialSource(doc.sourceUrl)) {
    warnings.push('Source URL is not recognized as official FIRST/FTC documentation.');
  }
  if (hasVersionConflict) warnings.push('Another indexed document of this type has a different version.');
  if (sourceAgeDays !== null && sourceAgeDays > 240) warnings.push('Source date is older than 240 days; check for team updates or Q&A changes.');

  return {
    chunkCount: chunks.length,
    ruleCount,
    hasPageNumbers: chunks.some((chunk) => Number.isFinite(Number(chunk.page))),
    officialSource: isOfficialSource(doc.sourceUrl),
    hasVersionConflict,
    sourceAgeDays,
    status: warnings.length ? 'review' : 'ready',
    warnings,
  };
}

export function quoteRule(query, { preferManual = true } = {}) {
  const matches = state.chunks
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
      page: chunk.page,
      sourceDocument: chunk.title,
      version: chunk.version,
      sourceDate: chunk.sourceDate,
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
