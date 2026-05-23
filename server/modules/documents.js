import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PDFParse } from 'pdf-parse';

function snippetAround(text, pattern, radius = 520, normalizeWhitespace) {
  const source = String(text || '');
  const index = source.toLowerCase().indexOf(String(pattern).toLowerCase());
  if (index < 0) return '';
  return normalizeWhitespace(source.slice(Math.max(0, index - radius), index + radius));
}

function firstMatch(text, regex, fallback = '') {
  return String(text || '').match(regex)?.[1]?.trim() || fallback;
}

function extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl, defaultFiles, normalizeWhitespace, nowIso, slugId }) {
  const normalized = normalizeWhitespace(text);
  const manualTitle = firstMatch(
    text,
    /(20\d{2}-20\d{2}\s+FIRST[^]+?Competition Manual\s+[A-Z0-9™\s]+Presented by [A-Za-z0-9 ]+)/,
    title,
  );
  const seasonName = firstMatch(text, /Competition Manual\s+([A-Z0-9™ ]+?)\s+Presented by/i, firstMatch(text, /\b([A-Z][A-Z0-9]+)™\s+Presented by/i, 'Uploaded season'));
  const teamUpdate = firstMatch(text, /Team Update\s+(\d+)/i, null);
  const manualVersion = version || (teamUpdate ? `TU${teamUpdate}` : firstMatch(text, /Section\s+\d+[^V]+V(\d+)/i, null));
  const scoringSummary = snippetAround(text, 'Game Overview', 520, normalizeWhitespace) || normalized.slice(0, 600);
  const pointValues = snippetAround(text, 'Table 10-2', 520, normalizeWhitespace) || snippetAround(text, 'Point Values', 520, normalizeWhitespace);
  const robotConstraints = [
    snippetAround(text, 'R101', 520, normalizeWhitespace),
    snippetAround(text, 'R105', 520, normalizeWhitespace),
    snippetAround(text, 'ROBOT Construction Rules', 520, normalizeWhitespace),
  ].filter(Boolean);
  const fieldFacts = [
    snippetAround(text, 'GOAL is', 520, normalizeWhitespace),
    snippetAround(text, 'OBELISK is', 520, normalizeWhitespace),
    snippetAround(text, 'CLASSIFIER is', 520, normalizeWhitespace),
  ].filter(Boolean);
  const citations = [
    { rule: 'R101', query: 'R101', note: snippetAround(text, 'R101', 520, normalizeWhitespace) },
    { rule: 'R105', query: 'R105', note: snippetAround(text, 'R105', 520, normalizeWhitespace) },
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

async function parsePdf(filePath) {
  const parser = new PDFParse({ url: filePath });
  try {
    const result = await parser.getText();
    return { text: result.text || '', pages: result.total || result.numpages || null };
  } finally {
    await parser.destroy();
  }
}

function chunkText(text, { documentId, title, sourceUrl, type, version, pageSize = 1200, normalizeWhitespace, slugId }) {
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

export function createDocumentModule({
  defaultFiles,
  documents,
  chunksRef,
  normalizeWhitespace,
  nowIso,
  slugId,
}) {
  async function ingestDocument({ filePath, title, type, sourceUrl = filePath, version = null }) {
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
        ? extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl, defaultFiles, normalizeWhitespace, nowIso, slugId })
        : null,
    };
    documents.set(id, doc);
    chunksRef.value = chunksRef.value.filter((chunk) => chunk.documentId !== id);
    chunksRef.value.push(...chunkText(text, { documentId: id, title, sourceUrl, type, version, normalizeWhitespace, slugId }));
    return doc;
  }

  async function ingestDefaultReferences() {
    const docs = [];
    if (fs.existsSync(defaultFiles.writeup)) {
      docs.push(await ingestDocument({ filePath: defaultFiles.writeup, title: 'Blueprint Requirements Writeup', type: 'requirements', version: 'local-writeup' }));
    }
    if (fs.existsSync(defaultFiles.manual)) {
      docs.push(await ingestDocument({ filePath: defaultFiles.manual, title: 'DECODE Competition Manual TU32', type: 'manual', version: 'TU32' }));
    }
    return docs;
  }

  return {
    ingestDocument,
    ingestDefaultReferences,
  };
}
