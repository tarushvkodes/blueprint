import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';
import { defaultFiles } from './config.js';
import { state } from './state.js';
import { firstMatch, normalizeWhitespace, nowIso, scoreText, slugId, snippetAround } from './utils.js';

function chunkText(text, { documentId, title, sourceUrl, type, version, pageSize = 1200 }) {
  const chunks = [];
  const paragraphs = String(text || '').split(/\n\s*\n/g).map(normalizeWhitespace).filter(Boolean);
  let buffer = '';
  let section = title;
  for (const paragraph of paragraphs) {
    const maybeSection = paragraph.match(/^([A-Z][A-Za-z0-9 /&().:-]{4,90})$/);
    if (maybeSection) section = maybeSection[1];
    if ((buffer + paragraph).length > pageSize && buffer) {
      chunks.push({
        id: slugId('chunk'),
        documentId,
        title,
        sourceUrl,
        type,
        version,
        section,
        page: null,
        ruleNumber: (buffer.match(/\bR\d{3}\b/) || [null])[0],
        text: buffer.trim(),
      });
      buffer = '';
    }
    buffer += `${paragraph}\n\n`;
  }
  if (buffer.trim()) {
    chunks.push({
      id: slugId('chunk'),
      documentId,
      title,
      sourceUrl,
      type,
      version,
      section,
      page: null,
      ruleNumber: (buffer.match(/\bR\d{3}\b/) || [null])[0],
      text: buffer.trim(),
    });
  }
  return chunks;
}

async function parsePdf(filePath) {
  const parser = new PDFParse({ url: filePath });
  try {
    const result = await parser.getText();
    return { text: result.text || '', pages: result.total || result.numpages || null };
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

export async function ingestDocument({ filePath, title, type, sourceUrl = filePath, version = null }) {
  const stat = await fsp.stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let text = '';
  let pages = null;
  if (ext === '.pdf') {
    const parsed = await parsePdf(filePath);
    text = parsed.text;
    pages = parsed.pages;
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
    pages,
    checksum: `${stat.size}-${Math.round(stat.mtimeMs)}`,
    ingestedAt: nowIso(),
    summary: normalizeWhitespace(text).slice(0, 900),
    seasonSource: type === 'manual' || type === 'season-resource'
      ? extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl })
      : null,
  };
  state.documents.set(id, doc);
  state.chunks = state.chunks.filter((chunk) => chunk.documentId !== id);
  state.chunks.push(...chunkText(text, { documentId: id, title, sourceUrl, type, version }));
  return doc;
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
