import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as cheerio from 'cheerio';
import { PDFParse } from 'pdf-parse';

const require = createRequire(import.meta.url);
const archiver = require('archiver');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const cacheDir = path.join(rootDir, '.cache');
const uploadDir = path.join(rootDir, 'uploads');

function loadEnvFile() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

const app = express();
const port = process.env.API_PORT || 8787;
const upload = multer({ dest: uploadDir });

const vertexConfig = {
  apiKey: process.env.VERTEX_AI_API_KEY || '',
  textModel: process.env.VERTEX_TEXT_MODEL || 'gemini-2.5-flash',
  imageModel: process.env.VERTEX_IMAGE_MODEL || 'gemini-2.5-flash-image',
};

await fsp.mkdir(cacheDir, { recursive: true });
await fsp.mkdir(uploadDir, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

const DEFAULT_FILES = {
  writeup: '/Users/tarushvkosgi/Downloads/writeup.pdf',
  manual: '/Users/tarushvkosgi/Downloads/DECODE_Competition_Manual_TU32.pdf',
};

const seedRevUrls = [
  'https://www.revrobotics.com/rev-45-3529/',
  'https://www.revrobotics.com/rev-31-1595/',
  'https://www.revrobotics.com/rev-31-1596/',
  'https://www.revrobotics.com/rev-41-1301/',
  'https://www.revrobotics.com/rev-41-1600/',
  'https://www.revrobotics.com/rev-45-1655/',
  'https://www.revrobotics.com/rev-41-1267/',
  'https://www.revrobotics.com/rev-41-1432/',
  'https://www.revrobotics.com/rev-31-1302/',
];

const state = {
  projects: new Map(),
  documents: new Map(),
  chunks: [],
  catalog: new Map(),
  ai: {
    lastError: null,
  },
};

function nowIso() {
  return new Date().toISOString();
}

function slugId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeWhitespace(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function tokenize(text) {
  return normalizeWhitespace(text).toLowerCase().match(/[a-z0-9#.-]+/g) || [];
}

function scoreText(text, query) {
  const haystack = new Set(tokenize(text));
  const terms = tokenize(query);
  return terms.reduce((score, term) => score + (haystack.has(term) ? 3 : normalizeWhitespace(text).toLowerCase().includes(term) ? 1 : 0), 0);
}

function aiStatus() {
  return {
    ready: Boolean(vertexConfig.apiKey),
    provider: vertexConfig.apiKey ? 'vertex-express' : 'local-fallback',
    textModel: vertexConfig.textModel,
    imageModel: vertexConfig.imageModel,
    message: vertexConfig.apiKey ? 'AI ready' : 'Local fallback active',
    lastError: state.ai.lastError,
  };
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function callVertexJson({ prompt, model = vertexConfig.textModel }) {
  if (!vertexConfig.apiKey) {
    return { ok: false, generatedBy: 'local-fallback', error: 'VERTEX_AI_API_KEY is not configured.' };
  }

  const endpoint = `https://aiplatform.googleapis.com/v1/publishers/google/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(vertexConfig.apiKey)}`;
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      temperature: 0.35,
      responseMimeType: 'application/json',
    },
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || `Vertex request failed with ${response.status}`);
      }
      const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '';
      const data = extractJson(text);
      if (!data) throw new Error('Vertex response did not contain valid JSON.');
      state.ai.lastError = null;
      return { ok: true, data, generatedBy: 'vertex-express' };
    } catch (error) {
      state.ai.lastError = error.message;
      if (attempt === 1) {
        return { ok: false, generatedBy: 'local-fallback', error: error.message };
      }
    }
  }

  return { ok: false, generatedBy: 'local-fallback', error: 'Vertex request failed.' };
}

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

function snippetAround(text, pattern, radius = 520) {
  const source = String(text || '');
  const index = source.toLowerCase().indexOf(String(pattern).toLowerCase());
  if (index < 0) return '';
  return normalizeWhitespace(source.slice(Math.max(0, index - radius), index + radius));
}

function firstMatch(text, regex, fallback = '') {
  return String(text || '').match(regex)?.[1]?.trim() || fallback;
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
    isSample: type === 'manual' && /DECODE/i.test(title) && sourceUrl === DEFAULT_FILES.manual,
    scoringSummary,
    pointValues,
    robotConstraints,
    fieldFacts,
    citations,
  };
}

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
      ? extractSeasonSourcePack({ text, title, type, version, pages, sourceUrl })
      : null,
  };
  state.documents.set(id, doc);
  state.chunks = state.chunks.filter((chunk) => chunk.documentId !== id);
  state.chunks.push(...chunkText(text, { documentId: id, title, sourceUrl, type, version }));
  return doc;
}

async function ingestDefaultReferences() {
  const docs = [];
  if (fs.existsSync(DEFAULT_FILES.writeup)) {
    docs.push(await ingestDocument({ filePath: DEFAULT_FILES.writeup, title: 'Blueprint Requirements Writeup', type: 'requirements', version: 'local-writeup' }));
  }
  if (fs.existsSync(DEFAULT_FILES.manual)) {
    docs.push(await ingestDocument({ filePath: DEFAULT_FILES.manual, title: 'DECODE Competition Manual TU32', type: 'manual', version: 'TU32' }));
  }
  return docs;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'FTC-Copilot-MVP/0.1 (+local development)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status} for ${url}`);
  return response.text();
}

function parseJsonLd($) {
  const entries = [];
  $('script[type="application/ld+json"]').each((_index, script) => {
    try {
      entries.push(JSON.parse($(script).text()));
    } catch {
      // Keep catalog sync resilient when storefront scripts contain malformed JSON.
    }
  });
  return entries.flatMap((entry) => (Array.isArray(entry) ? entry : [entry]));
}

function parseBcData(html) {
  const match = html.match(/var\s+BCData\s*=\s*(\{.*?\});/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function productCategory(name) {
  const text = name.toLowerCase();
  if (/motor|gearbox|servo/.test(text)) return /servo/.test(text) ? 'Servos' : 'Motors';
  if (/hub|driver|control|battery|wire|cable|sensor|switch/.test(text)) return 'Control system';
  if (/wheel|mecanum|traction/.test(text)) return 'Wheels';
  if (/gear|sprocket|chain|belt|pulley/.test(text)) return 'Power transmission';
  if (/bracket|channel|extrusion|shaft|bearing|screw|nut|standoff/.test(text)) return 'Structure';
  if (/linear|slide/.test(text)) return 'Linear motion';
  return 'General FTC parts';
}

async function parseRevProduct(url) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  const bcData = parseBcData(html);
  const jsonLd = parseJsonLd($).find((entry) => entry['@type'] === 'Product') || {};
  const currentProductMatch = html.match(/var\s+currentProduct\s*=\s*JSON\.parse\("(.+?)"\);/s);
  let currentProduct = {};
  if (currentProductMatch) {
    try {
      currentProduct = JSON.parse(currentProductMatch[1].replace(/\\"/g, '"'));
    } catch {
      currentProduct = {};
    }
  }
  const name = normalizeWhitespace(jsonLd.name || currentProduct.title || $('.productView-title').first().text() || $('h1').first().text());
  const sku = normalizeWhitespace(bcData?.product_attributes?.sku || jsonLd.sku || $('[data-product-sku]').first().text() || currentProduct.sku);
  const price = Number(bcData?.product_attributes?.price?.without_tax?.value ?? $('meta[property="product:price:amount"]').attr('content') ?? String($('.price--main').first().text()).replace(/[^0-9.]/g, '')) || 0;
  const productUrl = $('link[rel="canonical"]').attr('href') || url;
  const image = $('meta[property="og:image"]').attr('content') || (Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image) || '';
  const docs = [];
  $('a[href]').each((_index, anchor) => {
    const href = $(anchor).attr('href');
    if (!href) return;
    const absolute = href.startsWith('http') ? href : new URL(href, productUrl).href;
    if (/\.(pdf|step|stp|stl|x_t|sldprt|sldasm|iges|igs)(\?|$)/i.test(absolute) || /docs\.revrobotics|content\/docs|cad/i.test(absolute)) {
      docs.push(absolute);
    }
  });
  const description = normalizeWhitespace($('.productView-description, [data-content-region="product_below_content"]').text() || jsonLd.description || $('meta[name="description"]').attr('content') || '');
  return {
    id: sku || productUrl,
    supplier: 'REV Robotics',
    sku,
    name,
    category: productCategory(name),
    price,
    weight: bcData?.product_attributes?.weight || null,
    dimensions: null,
    material: null,
    productUrl,
    cadUrl: docs.find((doc) => /\.(step|stp|stl|x_t|sldprt|sldasm|iges|igs)(\?|$)/i.test(doc)) || null,
    docs,
    image,
    stockStatus: bcData?.product_attributes?.instock === false ? 'Out of stock' : bcData?.product_attributes?.purchasable === false ? 'Not purchasable online' : 'Available/unknown quantity',
    lastChecked: nowIso(),
    ftcLegalityStatus: 'Needs rules citation review',
    compatibleParts: [],
    requiredAccessories: [],
    electricalRequirements: null,
    mechanicalProperties: {},
    notes: description.slice(0, 700),
  };
}

async function discoverRevUrls({ query = 'ftc', limit = 30 } = {}) {
  const urls = new Set(seedRevUrls);
  const searchUrl = `https://www.revrobotics.com/search.php?search_query=${encodeURIComponent(query)}`;
  for (const url of [searchUrl, 'https://www.revrobotics.com/search.php?search_query=REV%20FTC', 'https://www.revrobotics.com/sitemap.php']) {
    try {
      const html = await fetchText(url);
      const matches = html.match(/https:\/\/www\.revrobotics\.com\/rev-[0-9a-z-]+\//gi) || [];
      matches.forEach((match) => urls.add(match.toLowerCase()));
    } catch {
      // Discovery should still succeed with seed URLs if a page blocks or changes shape.
    }
  }
  return Array.from(urls).slice(0, limit);
}

async function syncRevCatalog(options = {}) {
  const urls = await discoverRevUrls(options);
  const products = [];
  for (const url of urls) {
    try {
      const product = await parseRevProduct(url);
      if (product.sku && product.name) {
        state.catalog.set(product.sku.toUpperCase(), product);
        products.push(product);
      }
    } catch (error) {
      products.push({ productUrl: url, error: error.message, lastChecked: nowIso() });
    }
  }
  await fsp.writeFile(path.join(cacheDir, 'rev-catalog.json'), JSON.stringify(Array.from(state.catalog.values()), null, 2));
  return products;
}

async function loadCachedCatalog() {
  const file = path.join(cacheDir, 'rev-catalog.json');
  if (!fs.existsSync(file)) return [];
  const items = JSON.parse(await fsp.readFile(file, 'utf8'));
  for (const item of items) state.catalog.set(item.sku.toUpperCase(), item);
  return items;
}

function searchCatalog(query, limit = 20) {
  const products = Array.from(state.catalog.values());
  const scored = products
    .map((product) => ({
      product,
      score: scoreText(`${product.sku} ${product.name} ${product.category} ${product.notes}`, query),
    }))
    .filter((entry) => entry.score > 0 || !query)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return scored.slice(0, limit).map((entry) => entry.product);
}

function findCatalogPart(...queries) {
  for (const query of queries) {
    const found = searchCatalog(query, 1)[0];
    if (found) return found;
  }
  return null;
}

function quoteRule(query, { preferManual = true } = {}) {
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

function defaultTeam(body = {}) {
  const parseList = (value, fallback = []) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
    return fallback;
  };

  return {
    name: body.name || body.teamName || 'Metal Magic FTC',
    number: body.number || body.teamNumber || 'Prototype',
    location: body.location || 'Virginia',
    experience: body.experience || body.experienceLevel || 'Intermediate',
    students: Number(body.students || body.numberOfStudents || 9),
    mentors: Number(body.mentors || body.availableMentors || 2),
    budget: Number(body.budget || 1500),
    supplier: body.supplier || 'REV Robotics',
    manual: body.manual || 'DECODE Competition Manual TU32',
    tools: parseList(body.tools, ['basic hand tools', '3D printer']),
    priorities: parseList(body.priorities, ['reliable autonomous', 'easy maintenance', 'simple driver control']),
    inventory: parseList(body.inventory, ['REV Starter Kit V3.1']),
    timelineWeeks: Number(body.timelineWeeks || 6),
    goals: body.goals || 'Build a reliable, legal FTC robot that students can understand, assemble, and iterate.',
    constraints: body.constraints || '',
    strategyMode: body.strategyMode || 'hybrid',
    cadExperience: body.cadExperience || 'Beginner',
    programmingExperience: body.programmingExperience || 'Beginner',
    buildSpace: body.buildSpace || 'Classroom or garage build space',
  };
}

function currentSeasonSource(project = null) {
  const docs = (project?.documents || [])
    .map((id) => state.documents.get(id))
    .filter(Boolean);
  const projectSeason = docs.find((doc) => doc.seasonSource)?.seasonSource;
  if (projectSeason) return projectSeason;
  return Array.from(state.documents.values()).find((doc) => doc.seasonSource)?.seasonSource || {
    seasonName: 'Uploaded season',
    manualVersion: null,
    scoringSummary: 'No official season manual has been uploaded yet.',
    pointValues: '',
    robotConstraints: [],
    fieldFacts: [],
    citations: [],
    isSample: true,
  };
}

function buildConcepts(team, season = currentSeasonSource()) {
  const rookie = /rookie|beginner/i.test(team.experience);
  const budget = team.budget;
  const seasonLabel = season.seasonName || 'Season';
  const scoringWords = `${season.scoringSummary || ''} ${season.pointValues || ''}`.toLowerCase();
  const scoreObject = /artifact/.test(scoringWords) ? 'artifact' : /sample|pixel|element/.test(scoringWords) ? 'game piece' : 'scoring element';
  const scoringMechanism = /goal|ramp|classifier|launch/.test(scoringWords) ? 'controlled scorer' : 'simple scoring mechanism';
  return [
    {
      id: 'simple-reliable-scorer',
      name: `Simple ${seasonLabel} Scorer`,
      strategyFit: 'Scores repeatable low-risk tasks, parks reliably in autonomous, and stays easy to inspect.',
      difficulty: rookie ? 'Beginner' : 'Beginner-safe',
      estimatedCost: Math.min(940, Math.round(budget * 0.72)),
      buildTime: '3-4 weeks',
      requiredTools: ['hex drivers', 'wrenches', 'wire strippers', 'laptop'],
      requiredParts: ['Control Hub', 'HD Hex Motors', 'FTC Starter Kit V3.1', 'servo wrist'],
      mainMechanisms: ['tank drivetrain', `passive ${scoreObject} guide`, 'single-stage arm/lift', 'basic autonomous movement'],
      pros: ['lowest mechanical risk', 'fastest to assemble', 'best for limited mentor support'],
      cons: ['lower scoring ceiling', 'less maneuverable than mecanum'],
      risks: ['driver practice matters more than mechanism count'],
      ruleConcerns: quoteRule('robot construction size control system parts'),
      upgradePath: ['add mecanum wheels', 'add preset lift positions', 'add active intake'],
    },
    {
      id: 'balanced-cycle-machine',
      name: `Balanced ${seasonLabel} Cycle Machine`,
      strategyFit: 'Balances scoring potential with maintainability using mecanum drive, lift presets, and a REV-first BOM.',
      difficulty: 'Intermediate',
      estimatedCost: Math.min(1280, Math.round(budget * 0.9)),
      buildTime: '5-6 weeks',
      requiredTools: ['hex drivers', 'wrenches', '3D printer optional', 'CAD viewer'],
      requiredParts: ['Mecanum wheel set', 'Control Hub', 'UltraPlanetary gearbox', 'linear motion kit'],
      mainMechanisms: ['mecanum drivetrain', 'linear slide', 'active intake', scoringMechanism],
      pros: ['higher cycle speed', 'good autonomous base', 'clean driver-control upgrade path'],
      cons: ['more tuning', 'requires square chassis and cable management'],
      risks: ['slide binding can cause current draw spikes'],
      ruleConcerns: quoteRule('autonomous teleop penalties robot construction'),
      upgradePath: ['add vision', 'add scoring macro', 'add spare slide carriage'],
    },
    {
      id: 'high-ceiling-vision-rig',
      name: `High Ceiling ${seasonLabel} Vision Rig`,
      strategyFit: 'Targets aggressive autonomous and fast teleop cycles for teams with enough programming and CAD bandwidth.',
      difficulty: 'Advanced',
      estimatedCost: Math.max(1600, Math.round(budget * 1.14)),
      buildTime: '7+ weeks',
      requiredTools: ['CAD', '3D printer', 'precision assembly', 'driver practice field'],
      requiredParts: ['mecanum drivetrain', 'multi-stage lift', 'camera/vision module', 'spares'],
      mainMechanisms: ['mecanum drivetrain', 'multi-stage lift', 'vision alignment', 'macro controls'],
      pros: ['highest scoring ceiling', 'strong autonomous potential'],
      cons: ['over budget for many teams', 'harder to debug'],
      risks: ['code and mechanism integration can consume the season'],
      ruleConcerns: quoteRule('vision control system autonomous rule penalties'),
      upgradePath: ['requires review before build; not recommended as first robot for rookies'],
    },
  ];
}

function buildStrategy(team, season = currentSeasonSource()) {
  const beginner = /rookie|beginner/i.test(team.experience);
  const hasAutoScoring = /auto|autonomous/i.test(season.scoringSummary || season.pointValues || '');
  const hasEndgame = /base|endgame|return|park|climb|hang/i.test(season.scoringSummary || season.pointValues || '');
  return {
    recommendation: beginner
      ? `Build drivetrain and one repeatable ${season.seasonName || 'game'} scoring path first; ignore high-complexity tasks until the robot can drive, score, and pass inspection consistently.`
      : `Prioritize a maintainable ${season.seasonName || 'season'} scoring robot with reliable teleop cycles${hasAutoScoring ? ', autonomous scoring support' : ''}, then add driver macros after logs show repeated sequences.`,
    scoringPriorities: ['repeatable teleop scoring', hasAutoScoring ? 'reliable autonomous action' : 'reliable autonomous movement', 'low penalty exposure', 'fast reset between cycles'],
    whatToIgnore: beginner ? ['multi-stage lift until the first mechanism works', 'fragile endgame gambits'] : ['unproven mechanisms that do not increase cycle reliability'],
    autonomous: ['encoder-based drive/park', hasAutoScoring ? 'score preload if mechanism is stable' : 'complete a reliable movement objective', 'time-based fallback'],
    teleOp: ['driver 1 owns drivetrain', 'driver 2 owns manipulator', 'slow mode for alignment', 'preset scoring positions'],
    endgame: [hasEndgame ? 'practice return/endgame task only after scoring is stable' : 'attempt only if build time remains after drivetrain and scoring validation'],
    driverPracticeGoals: ['five clean cycles in a row', 'zero cable snags', 'consistent button sequence under time pressure'],
    allianceCompatibility: 'Prefer a robot that can park, avoid traffic, and score one task reliably instead of blocking partners.',
    citations: quoteRule('scoring autonomous teleop endgame penalties'),
    generatedBy: 'local-fallback',
  };
}

function buildBom(team, conceptId = 'balanced-cycle-machine') {
  const concept = buildConcepts(team).find((item) => item.id === conceptId) || buildConcepts(team)[1];
  const wantsMecanum = /mecanum|balanced|high/i.test(`${concept.name} ${concept.mainMechanisms.join(' ')}`);
  const parts = [
    { subsystem: 'Control', query: 'REV-31-1595 Control Hub', qty: 1, required: true, buyFirst: 1 },
    { subsystem: 'Drivetrain', query: 'HD Hex Motor REV-41-1301', qty: wantsMecanum ? 4 : 2, required: true, buyFirst: 2 },
    { subsystem: 'Drivetrain', query: wantsMecanum ? 'Mecanum Wheel Set REV-45-1655' : 'FTC Starter Kit V3.1 REV-45-3529', qty: 1, required: true, buyFirst: 3 },
    { subsystem: 'Scoring', query: 'UltraPlanetary Gearbox Kit REV-41-1600', qty: 2, required: true, buyFirst: 4 },
    { subsystem: 'Scoring', query: 'Linear Motion Kit REV-41-1432', qty: /slide|lift/i.test(concept.mainMechanisms.join(' ')) ? 1 : 0, required: false, buyFirst: 5 },
    { subsystem: 'Electrical', query: 'XT30 Cable REV-31-1302', qty: 4, required: true, buyFirst: 6 },
  ].filter((item) => item.qty > 0);
  const items = parts.map((line) => {
    const product = findCatalogPart(line.query) || {};
    const price = Number(product.price || (line.subsystem === 'Control' ? 285 : line.subsystem === 'Drivetrain' ? 45 : 30));
    return {
      ...line,
      supplier: 'REV Robotics',
      sku: product.sku || line.query.match(/REV-\d{2}-\d{4}/)?.[0] || 'SKU pending',
      part: product.name || line.query,
      price,
      total: price * line.qty,
      productUrl: product.productUrl || null,
      cadUrl: product.cadUrl || null,
      stock: product.stockStatus || 'Availability not checked',
      lastChecked: product.lastChecked || null,
      inInventory: team.inventory.some((owned) => line.query.toLowerCase().includes(String(owned).toLowerCase())),
      substitutionSuggestions: [],
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  return {
    conceptId,
    required: items.filter((item) => item.required),
    optional: items.filter((item) => !item.required),
    spareParts: items.filter((item) => /motor|cable|wheel/i.test(item.part)).map((item) => ({ ...item, qty: 1, total: item.price })),
    alreadyOwned: items.filter((item) => item.inInventory),
    missing: items.filter((item) => !item.inInventory),
    subtotal,
    shippingEstimatePlaceholder: Math.max(35, Math.round(subtotal * 0.06)),
    budgetRemaining: team.budget - subtotal,
    buyFirst: items.sort((a, b) => a.buyFirst - b.buyFirst).slice(0, 4),
    budgetMode: team.budget < 1000 ? 'Ultra-Low Budget' : team.budget < 1800 ? 'Balanced Budget' : 'Competitive Budget',
  };
}

function calculateMechanisms({ design = {}, robot = {} } = {}) {
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

function generateCode(project) {
  const hardwareNames = {
    leftFront: 'left_front',
    rightFront: 'right_front',
    leftBack: 'left_back',
    rightBack: 'right_back',
    liftMotor: 'lift_motor',
    intakeServo: 'intake_servo',
  };
  return {
    'Constants.java': `package org.firstinspires.ftc.teamcode;\n\npublic final class Constants {\n    public static final double DRIVE_LIMIT = 0.70;\n    public static final double TURN_LIMIT = 0.65;\n    public static final int LIFT_LOW_TICKS = 450;\n    public static final int LIFT_HIGH_TICKS = 1050;\n    public static final double INTAKE_OPEN = 0.78;\n    public static final double INTAKE_CLOSED = 0.18;\n    private Constants() {}\n}\n`,
    'RobotHardware.java': `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.hardware.DcMotor;\nimport com.qualcomm.robotcore.hardware.HardwareMap;\nimport com.qualcomm.robotcore.hardware.Servo;\n\npublic class RobotHardware {\n    public DcMotor leftFront, rightFront, leftBack, rightBack, liftMotor;\n    public Servo intakeServo;\n    public DriveSubsystem drive;\n    public LiftSubsystem lift;\n\n    public void init(HardwareMap hardwareMap) {\n        leftFront = hardwareMap.get(DcMotor.class, "${hardwareNames.leftFront}");\n        rightFront = hardwareMap.get(DcMotor.class, "${hardwareNames.rightFront}");\n        leftBack = hardwareMap.get(DcMotor.class, "${hardwareNames.leftBack}");\n        rightBack = hardwareMap.get(DcMotor.class, "${hardwareNames.rightBack}");\n        liftMotor = hardwareMap.get(DcMotor.class, "${hardwareNames.liftMotor}");\n        intakeServo = hardwareMap.get(Servo.class, "${hardwareNames.intakeServo}");\n\n        rightFront.setDirection(DcMotor.Direction.REVERSE);\n        rightBack.setDirection(DcMotor.Direction.REVERSE);\n        liftMotor.setZeroPowerBehavior(DcMotor.ZeroPowerBehavior.BRAKE);\n        drive = new DriveSubsystem(leftFront, rightFront, leftBack, rightBack);\n        lift = new LiftSubsystem(liftMotor);\n    }\n}\n`,
    'DriveSubsystem.java': `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.hardware.DcMotor;\nimport com.qualcomm.robotcore.util.Range;\n\npublic class DriveSubsystem {\n    private final DcMotor leftFront, rightFront, leftBack, rightBack;\n\n    public DriveSubsystem(DcMotor leftFront, DcMotor rightFront, DcMotor leftBack, DcMotor rightBack) {\n        this.leftFront = leftFront;\n        this.rightFront = rightFront;\n        this.leftBack = leftBack;\n        this.rightBack = rightBack;\n    }\n\n    public void mecanum(double y, double x, double turn) {\n        double lf = y + x + turn;\n        double rf = y - x - turn;\n        double lb = y - x + turn;\n        double rb = y + x - turn;\n        double max = Math.max(1.0, Math.max(Math.abs(lf), Math.max(Math.abs(rf), Math.max(Math.abs(lb), Math.abs(rb)))));\n        leftFront.setPower(Range.clip(lf / max, -Constants.DRIVE_LIMIT, Constants.DRIVE_LIMIT));\n        rightFront.setPower(Range.clip(rf / max, -Constants.DRIVE_LIMIT, Constants.DRIVE_LIMIT));\n        leftBack.setPower(Range.clip(lb / max, -Constants.DRIVE_LIMIT, Constants.DRIVE_LIMIT));\n        rightBack.setPower(Range.clip(rb / max, -Constants.DRIVE_LIMIT, Constants.DRIVE_LIMIT));\n    }\n\n    public void stop() { mecanum(0, 0, 0); }\n}\n`,
    'LiftSubsystem.java': `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.hardware.DcMotor;\nimport com.qualcomm.robotcore.util.Range;\n\npublic class LiftSubsystem {\n    private final DcMotor liftMotor;\n\n    public LiftSubsystem(DcMotor liftMotor) {\n        this.liftMotor = liftMotor;\n        this.liftMotor.setMode(DcMotor.RunMode.STOP_AND_RESET_ENCODER);\n        this.liftMotor.setMode(DcMotor.RunMode.RUN_USING_ENCODER);\n    }\n\n    public void manual(double stick) {\n        liftMotor.setPower(Range.clip(-stick, -0.55, 0.75));\n    }\n\n    public void goTo(int ticks) {\n        liftMotor.setTargetPosition(ticks);\n        liftMotor.setMode(DcMotor.RunMode.RUN_TO_POSITION);\n        liftMotor.setPower(0.65);\n    }\n}\n`,
    'TeleOpMain.java': `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\nimport com.qualcomm.robotcore.eventloop.opmode.TeleOp;\n\n@TeleOp(name = "Blueprint TeleOp")\npublic class TeleOpMain extends LinearOpMode {\n    private final RobotHardware robot = new RobotHardware();\n\n    @Override\n    public void runOpMode() {\n        robot.init(hardwareMap);\n        telemetry.addLine("Hardware initialized. Config names are case-sensitive.");\n        telemetry.update();\n        waitForStart();\n\n        while (opModeIsActive()) {\n            double slow = gamepad1.left_bumper ? 0.42 : 1.0;\n            robot.drive.mecanum(-gamepad1.left_stick_y * slow, gamepad1.left_stick_x * slow, gamepad1.right_stick_x * slow);\n            robot.lift.manual(gamepad2.left_stick_y);\n            if (gamepad2.a) robot.intakeServo.setPosition(Constants.INTAKE_CLOSED);\n            if (gamepad2.b) robot.intakeServo.setPosition(Constants.INTAKE_OPEN);\n            telemetry.addData("slowMode", gamepad1.left_bumper);\n            telemetry.update();\n        }\n    }\n}\n`,
    'AutoMain.java': `package org.firstinspires.ftc.teamcode;\n\nimport com.qualcomm.robotcore.eventloop.opmode.Autonomous;\nimport com.qualcomm.robotcore.eventloop.opmode.LinearOpMode;\n\n@Autonomous(name = "Blueprint Auto")\npublic class AutoMain extends LinearOpMode {\n    private final RobotHardware robot = new RobotHardware();\n\n    @Override\n    public void runOpMode() throws InterruptedException {\n        robot.init(hardwareMap);\n        telemetry.addLine("Tune wheel diameter, gear ratio, track width, and battery assumptions before competition.");\n        telemetry.update();\n        waitForStart();\n\n        robot.drive.mecanum(0.35, 0, 0);\n        sleep(750);\n        robot.drive.stop();\n        robot.lift.goTo(Constants.LIFT_LOW_TICKS);\n        sleep(900);\n        robot.intakeServo.setPosition(Constants.INTAKE_OPEN);\n        sleep(250);\n        robot.drive.stop();\n    }\n}\n`,
    'README.md': `# Blueprint Starter Code\n\nGenerated for ${project.team.name}. Confirm FTC SDK version, package path, hardware names, motor direction, encoder constants, and legal behavior before competition.\n\nHardware configuration names:\n${Object.values(hardwareNames).map((name) => `- ${name}`).join('\n')}\n`,
  };
}

function buildGuide(project) {
  const selected = project.selectedDesign || project.concepts?.[1];
  return [
    { phase: 'Prepare parts', title: 'Confirm manual, BOM, and inventory', parts: [], tools: ['laptop'], time: '30 min', diagram: 'BOM -> bins -> legal checklist', instructions: 'Open the current manual, confirm team inventory, mark already-owned REV parts, and print the legal/rules checklist.', checkpoint: 'Budget remaining is non-negative or substitutions are chosen.', commonMistake: 'Ordering mechanisms before confirming control system parts.', test: 'A student can point to the manual version and every buy-first part.' },
    { phase: 'Build drivetrain', title: `Assemble ${selected?.name || 'selected'} drivetrain`, parts: ['motors', 'wheels', 'channel', 'fasteners'], tools: ['hex drivers', 'wrenches'], time: '2-4 hr', diagram: 'Top view: square base, four wheels, motors inside frame', instructions: 'Build the chassis square on a flat surface, tighten gradually, and verify wheels spin freely.', checkpoint: 'Robot rolls straight with no binding.', commonMistake: 'Mirroring mecanum wheels incorrectly.', test: 'Push the robot by hand; each wheel spins freely and the frame does not rack.' },
    { phase: 'Wire drivetrain', title: 'Mount Control Hub and battery safely', parts: ['Control Hub', 'battery', 'switch', 'XT30 cables'], tools: ['wire clips', 'zip ties'], time: '1 hr', diagram: 'Rear electronics bay with strain-relieved cables', instructions: 'Route wires away from moving parts, strain-relieve connectors, and label each motor cable.', checkpoint: 'Robot can be disabled quickly and no wires drag.', commonMistake: 'Leaving battery unsecured.', test: 'Lift and gently shake the robot; battery and hub remain fixed.' },
    { phase: 'Build scoring mechanism', title: 'Bench-test lift/intake before mounting', parts: ['gearbox', 'slide', 'servo'], tools: ['hex drivers'], time: '3-6 hr', diagram: 'Side view: scoring tower braced to base', instructions: 'Assemble the mechanism outside the robot, check current draw, then mount with accessible fasteners.', checkpoint: 'Mechanism moves through full range without binding.', commonMistake: 'Ignoring cable path through the lift travel.', test: 'Run the mechanism at low power for 10 cycles and check for heat or binding.' },
    { phase: 'Upload code', title: 'Configure hardware map and run TeleOp', parts: [], tools: ['Android Studio', 'Driver Station'], time: '45 min', diagram: 'Laptop -> Robot Controller -> Driver Station', instructions: 'Use generated case-sensitive config names, run TeleOp on blocks, and reverse motors only after checking wiring.', checkpoint: 'Forward stick drives forward and slow mode works.', commonMistake: 'Changing config names without updating code.', test: 'Forward stick drives forward, turn stick turns, and stop disables all motors.' },
    { phase: 'Tune autonomous', title: 'Tune constants and run repeatability tests', parts: [], tools: ['field tiles', 'tape measure'], time: '2 hr', diagram: 'Field tile path with start, score, park markers', instructions: 'Measure wheel diameter, tune encoder constants, and run 10 consecutive autonomous trials.', checkpoint: 'Robot succeeds at least 8 of 10 times before adding complexity.', commonMistake: 'Testing only on a full battery.', test: 'Record 10 runs and keep the simplest path that succeeds reliably.' },
  ].map((step) => ({ ...step, generatedBy: project.generatedBy || 'local-fallback' }));
}

function generateCadConcept(project) {
  const concept = project.selectedDesign || project.concepts?.[1];
  const wantsMecanum = /mecanum/i.test(`${concept?.name || ''} ${concept?.mainMechanisms?.join(' ') || ''}`);
  const dimensions = { length: 455, width: 455, height: /high|multi-stage/i.test(concept?.name || '') ? 455 : 430 };
  const components = [
    { id: 'base-frame', name: '18 in legal starting frame', shape: 'box', positionMm: { x: 0, y: 0, z: 45 }, sizeMm: { x: dimensions.length, y: dimensions.width, z: 90 }, material: 'REV extrusion/channel' },
    { id: 'control-hub', name: 'Control Hub bay', shape: 'box', positionMm: { x: -120, y: 115, z: 125 }, sizeMm: { x: 145, y: 95, z: 35 }, material: 'electronics' },
    { id: 'battery', name: 'Battery bay', shape: 'box', positionMm: { x: 120, y: 125, z: 120 }, sizeMm: { x: 145, y: 75, z: 50 }, material: 'electronics' },
    { id: 'lift-tower', name: 'Scoring lift/arm tower', shape: 'box', positionMm: { x: 55, y: 0, z: 250 }, sizeMm: { x: 80, y: 120, z: 330 }, material: 'linear motion' },
    { id: 'intake', name: 'Front intake/scoring wrist', shape: 'box', positionMm: { x: 0, y: -165, z: 125 }, sizeMm: { x: 220, y: 80, z: 75 }, material: 'mechanism' },
  ];
  const wheelPositions = wantsMecanum
    ? [[-180, -170], [180, -170], [-180, 170], [180, 170]]
    : [[-180, -170], [180, -170], [-180, 170], [180, 170]];
  wheelPositions.forEach(([x, y], index) => {
    components.push({
      id: `wheel-${index + 1}`,
      name: wantsMecanum ? `Mecanum wheel ${index + 1}` : `Traction wheel ${index + 1}`,
      shape: 'cylinder',
      positionMm: { x, y, z: 45 },
      sizeMm: { radius: 48, depth: 34 },
      material: 'wheel',
    });
  });

  return {
    disclaimer: 'Conceptual CAD starter. Verify dimensions, clearances, fasteners, and legality before manufacturing.',
    sourceReference: 'Generated from team constraints, selected architecture, REV part metadata, and parametric layout rules.',
    generatedBy: project.generatedBy || 'local-fallback',
    formatTargets: ['browser Three.js preview', 'downloadable GLB-style JSON artifact', 'downloadable STEP-style conceptual artifact'],
    robotDimensionsMm: dimensions,
    parametricLayout: {
      units: 'mm',
      startingConstraint: 'Must fit inside 18 in x 18 in x 18 in starting configuration unless current manual says otherwise.',
      components,
      mountingPoints: [
        { id: 'hub-mount', componentId: 'control-hub', note: 'Mount with service access and strain relief.' },
        { id: 'battery-strap', componentId: 'battery', note: 'Battery must be secure and reachable for inspection.' },
        { id: 'tower-brace', componentId: 'lift-tower', note: 'Brace tower to base frame before lift testing.' },
      ],
    },
    subsystemLayout: [
      { name: 'Drivetrain', placement: 'base rectangle, motors inside frame perimeter', dimensionsMm: { x: 455, y: 455, z: 90 } },
      { name: 'Control Hub', placement: 'rear-left protected electronics bay', dimensionsMm: { x: 145, y: 95, z: 35 } },
      { name: 'Battery', placement: 'rear-right low center of gravity bay', dimensionsMm: { x: 145, y: 75, z: 50 } },
      { name: 'Lift/arm', placement: 'centerline tower with service access', dimensionsMm: { x: 80, y: 120, z: 430 } },
      { name: 'Intake/scoring wrist', placement: 'front-right, inside starting configuration', dimensionsMm: { x: 180, y: 120, z: 80 } },
    ],
    views: ['top', 'front', 'side', 'isometric', 'exploded', 'wiring', 'subsystem closeups'],
    selectedConcept: concept?.name,
  };
}

function cadExportName(project, ext) {
  return `${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-${project.season?.seasonName || 'season'}-blueprint.${ext}`.toLowerCase();
}

function cadAsGltf(project) {
  const cad = project.cad || generateCadConcept(project);
  const nodes = cad.parametricLayout.components.map((component) => ({
    name: component.name,
    translation: [
      Number(((component.positionMm.x || 0) / 1000).toFixed(4)),
      Number(((component.positionMm.z || 0) / 1000).toFixed(4)),
      Number(((component.positionMm.y || 0) / 1000).toFixed(4)),
    ],
    extras: component,
  }));
  return {
    asset: {
      version: '2.0',
      generator: 'Blueprint conceptual CAD exporter',
      copyright: 'Conceptual FTC robot layout; verify before manufacturing.',
    },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    extras: {
      disclaimer: cad.disclaimer,
      units: cad.parametricLayout.units,
      robotDimensionsMm: cad.robotDimensionsMm,
      note: 'This MVP GLB-style artifact stores parametric CAD components for browser/tool import. Mesh export can be swapped for a full glTF pipeline later.',
    },
  };
}

function cadAsStep(project) {
  const cad = project.cad || generateCadConcept(project);
  const lines = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('Blueprint conceptual FTC robot CAD export'),'2;1');`,
    `FILE_NAME('${cadExportName(project, 'step')}', '${nowIso()}', ('Blueprint'), ('Blueprint'), 'Blueprint MVP', 'Blueprint', '');`,
    "FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));",
    'ENDSEC;',
    'DATA;',
  ];
  cad.parametricLayout.components.forEach((component, index) => {
    lines.push(`#${index + 1}=PRODUCT('${component.id}','${component.name}','${component.material}',());`);
    lines.push(`#${index + 101}=CARTESIAN_POINT('',(${component.positionMm.x || 0},${component.positionMm.y || 0},${component.positionMm.z || 0}));`);
  });
  lines.push('ENDSEC;', 'END-ISO-10303-21;');
  return lines.join('\n');
}

function buildGuideHtml(project) {
  const steps = project.buildGuide || [];
  const rows = steps.map((step, index) => `
    <section class="step">
      <div class="diagram">${step.diagram || `Step ${index + 1}`}</div>
      <div>
        <p class="kicker">Step ${index + 1} · ${step.phase}</p>
        <h2>${step.title || step.phase}</h2>
        <p>${step.instructions}</p>
        <p><strong>Parts:</strong> ${(step.parts || []).join(', ') || 'Project BOM items'}</p>
        <p><strong>Tools:</strong> ${(step.tools || []).join(', ') || 'Basic FTC tools'}</p>
        <p><strong>Checkpoint:</strong> ${step.checkpoint || 'Mentor/student review before continuing.'}</p>
        <p><strong>Common mistake:</strong> ${step.commonMistake || 'Skipping fit checks before tightening hardware.'}</p>
        <p><strong>Test before continuing:</strong> ${step.test || 'Confirm the subsystem moves freely and remains inside legal limits.'}</p>
      </div>
    </section>`).join('\n');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${project.team.name} Blueprint Build Guide</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 32px; color: #17211c; }
    h1 { font-size: 42px; margin-bottom: 4px; }
    .meta { color: #5b6b61; margin-bottom: 28px; }
    .step { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 22px 0; border-top: 1px solid #d8e2dc; page-break-inside: avoid; }
    .diagram { display: grid; min-height: 160px; place-items: center; border: 2px solid #9bb8aa; border-radius: 8px; background: #f3f8f5; font-weight: 800; text-align: center; }
    .kicker { color: #1f755f; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; }
  </style>
</head>
<body>
  <h1>${project.team.name} Build Guide</h1>
  <p class="meta">${project.season?.seasonName || 'FTC season'} · Conceptual instructions generated by Blueprint. Verify rules, dimensions, and safety before manufacturing.</p>
  ${rows}
</body>
</html>`;
}

function analyzeDriverLogs(logs = []) {
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

function sponsorEmail({ team, contactName = 'Community Partner', companyName = 'your organization', amount = 500 } = {}) {
  const teamLabel = /\bFTC\b/i.test(team.name) ? team.name : `${team.name} FTC`;
  return {
    subject: `Supporting ${teamLabel} robotics students`,
    body: `Hi ${contactName},\n\nI am writing on behalf of ${team.name}, an FTC robotics team in ${team.location}. We are building a competition robot for the current FIRST Tech Challenge season and are raising funds for parts, registration, tools, and student outreach.\n\nA sponsorship of $${amount} from ${companyName} would directly support a legal, safe, student-built robot plan with documented budget, engineering calculations, and build checkpoints. We would be glad to recognize your support on team materials and share progress updates throughout the season.\n\nThank you for considering our team,\n${team.name}`,
    tiers: [
      { amount: 250, benefit: 'Team website and social recognition' },
      { amount: 500, benefit: 'Logo on pit display and outreach materials' },
      { amount: 1000, benefit: 'Robot/cart recognition where event rules allow' },
    ],
  };
}

function projectContextForPrompts(project) {
  const seasonSource = project.season || currentSeasonSource(project);
  return {
    team: project.team,
    season: {
      name: seasonSource.seasonName,
      manualVersion: seasonSource.manualVersion,
      scoringSummary: seasonSource.scoringSummary,
      robotConstraints: seasonSource.robotConstraints,
      indexedDocuments: Array.from(state.documents.values()).map((doc) => ({
        id: doc.id,
        title: doc.title,
        type: doc.type,
        version: doc.version,
      })),
    },
    strategy: project.strategy,
    selectedDesign: project.selectedDesign,
    budget: project.bom ? {
      subtotal: project.bom.subtotal,
      shippingEstimatePlaceholder: project.bom.shippingEstimatePlaceholder,
      budgetRemaining: project.bom.budgetRemaining,
      budgetMode: project.bom.budgetMode,
    } : null,
    catalog: {
      supplier: 'REV Robotics',
      itemCount: state.catalog.size,
      accessMethod: 'Public REV Robotics BigCommerce product pages parsed server-side for SKU, title, price, stock-ish purchasability, docs, CAD URLs, and lastChecked.',
    },
  };
}

function buildAgentPrompts(project) {
  const context = projectContextForPrompts(project);
  const system = [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Prioritize student learning, FTC legality, conservative engineering assumptions, budget limits, and editable outputs.',
    'Never make a definitive rule-sensitive claim without citations from indexed official documents.',
    'When evidence is missing, say what must be checked and produce a safe next step instead of guessing.',
    'Show formulas, assumptions, inputs, calculations, result, safety factor, and warning thresholds for mechanism advice.',
    'Generate FTC SDK Java using only selected libraries and case-sensitive hardware names from the project.',
  ].join('\n');
  const citationRule = 'Return rule-sensitive statements with ruleNumber, manualSection, sourceDocument, version, explanation, and confidence.';
  return {
    system,
    context,
    agents: [
      {
        name: 'Intake Agent',
        purpose: 'Normalize team profile, constraints, inventory, timeline, skill level, and priorities.',
        prompt: `${system}\n\nUse the project context to identify missing onboarding fields. Ask only questions that materially affect strategy, legality, BOM, physics, CAD, or code outputs.\n\nReturn JSON: { missingFields, inferredConstraints, riskFlags, nextQuestions }.`,
      },
      {
        name: 'Rules Agent',
        purpose: 'Ground legal/rules checks in the indexed manual and updates.',
        prompt: `${system}\n\nSearch the indexed manual chunks for the proposed design and strategy. ${citationRule} Refuse uncited legality claims.\n\nReturn JSON: { likelyAllowed, blockers, inspectionChecklist, citations, unresolvedQuestions }.`,
      },
      {
        name: 'Strategy Agent',
        purpose: 'Turn game scoring, skill level, budget, and timeline into priorities.',
        prompt: `${system}\n\nRecommend what to score, what to ignore, autonomous plan, teleop plan, endgame stance, alliance fit, and driver practice goals. Cite game-sensitive claims.\n\nReturn JSON: { recommendation, scoringPriorities, ignoreList, autonomous, teleop, endgame, allianceCompatibility, citations }.`,
      },
      {
        name: 'Mechanical Design Agent',
        purpose: 'Generate three feasible robot concepts and merge options.',
        prompt: `${system}\n\nCreate exactly three robot concepts: conservative, balanced, and high-ceiling. Include difficulty, cost, build time, tools, mechanisms, pros, cons, risks, rule concerns, and upgrade path.\n\nReturn JSON: { concepts: [...] }.`,
      },
      {
        name: 'Parts Agent',
        purpose: 'Build REV-first BOMs from the parsed catalog.',
        prompt: `${system}\n\nUse only catalog parts with SKU/productUrl when possible. Mark unknown availability as lastChecked. Split required, optional, spares, alreadyOwned, missing, substitutions, and buyFirst priorities.\n\nReturn JSON: { required, optional, spareParts, alreadyOwned, missing, subtotal, budgetRemaining, substitutions }.`,
      },
      {
        name: 'Physics Agent',
        purpose: 'Verify mechanisms with math before recommendation.',
        prompt: `${system}\n\nFor each mechanism calculate torque, RPM, speed, force, safety margin, current/battery risk if possible, and warning thresholds. Use conservative defaults when inputs are missing and label assumptions.\n\nReturn JSON: { calculations: [{ mechanism, assumptions, formula, calculation, result, safetyFactor, recommendation, warning }] }.`,
      },
      {
        name: 'CAD Agent',
        purpose: 'Create conceptual CAD starter specs, not manufacturing promises.',
        prompt: `${system}\n\nGenerate a parametric CAD plan for browser preview and future CadQuery export. Include robot envelope, subsystem placement, mounting points, views, wiring view, and verification notes. Label it conceptual.\n\nReturn JSON: { disclaimer, robotDimensionsMm, subsystemLayout, mountingPoints, views, exportPlan }.`,
      },
      {
        name: 'Code Agent',
        purpose: 'Generate FTC SDK Java starter code aligned to selected hardware.',
        prompt: `${system}\n\nGenerate Java files for RobotHardware, DriveSubsystem, LiftSubsystem, TeleOpMain, AutoMain, Constants, and README. Use FTC SDK imports, safe power clipping, telemetry, hardware init errors, and case-sensitive names.\n\nReturn JSON: { files: [{ fileName, language, content }], hardwareConfigurationChecklist }.`,
      },
      {
        name: 'Build Guide Agent',
        purpose: 'Create LEGO-style assembly steps with tests.',
        prompt: `${system}\n\nCreate build phases with step number, title, parts, tools, estimated time, instruction, safety warning, checkpoint, common mistake, and test before continuing.\n\nReturn JSON: { buildSteps }.`,
      },
      {
        name: 'Driver Optimization Agent',
        purpose: 'Analyze gamepad logs and propose better control layout.',
        prompt: `${system}\n\nAnalyze button/stick usage, repeated sequences, timing gaps, failed actions, and phase context. Recommend remaps, macros, toggles vs holds, deadzones, slow mode, presets, and driver1/driver2 ownership.\n\nReturn JSON: { buttonUsage, repeatedSequences, suggestions, recommendedMap }.`,
      },
      {
        name: 'Grant Agent',
        purpose: 'Draft sponsor/grant materials from team and budget context.',
        prompt: `${system}\n\nDraft sponsor email, grant narrative, budget justification, donation tiers, follow-up email, thank-you email, and outreach tracker fields. Keep claims truthful and editable.\n\nReturn JSON: { sponsorEmail, grantDraft, budgetJustification, tiers, followUp, thankYou }.`,
      },
      {
        name: 'Review Agent',
        purpose: 'Catch contradictions and unsafe overclaims before output.',
        prompt: `${system}\n\nReview the whole plan for uncited rules, impossible parts, budget mismatch, missing physics, code/CAD mismatch, unsafe build advice, and overpromised CAD. Return required fixes before final output.\n\nReturn JSON: { pass, blockers, warnings, fixes, finalCaveats }.`,
      },
    ],
  };
}

function projectAiPrompt(project) {
  const season = currentSeasonSource(project);
  return [
    'You are Blueprint, an FTC engineering workspace assistant.',
    'Return only valid JSON. Make a year-agnostic FTC robot packet from the season/manual facts and team requirements.',
    'Never make definitive legality claims. Include citations when rule-sensitive.',
    'JSON shape: { strategy, concepts, buildGuide, chatSeed }.',
    'strategy: { recommendation, scoringPriorities, whatToIgnore, autonomous, teleOp, endgame, driverPracticeGoals, allianceCompatibility }.',
    'concepts: exactly 3 items with id, name, strategyFit, difficulty, estimatedCost, buildTime, requiredTools, requiredParts, mainMechanisms, pros, cons, risks, upgradePath.',
    'buildGuide: 6-10 Lego-like steps with phase, title, parts, tools, time, diagram, instructions, checkpoint, commonMistake, test.',
    `Team: ${JSON.stringify(project.team)}`,
    `Season source: ${JSON.stringify({
      seasonName: season.seasonName,
      manualVersion: season.manualVersion,
      scoringSummary: season.scoringSummary,
      pointValues: season.pointValues,
      robotConstraints: season.robotConstraints,
      fieldFacts: season.fieldFacts,
    })}`,
  ].join('\n\n');
}

function normalizeAiConcepts(concepts, team, season) {
  if (!Array.isArray(concepts) || concepts.length < 3) return buildConcepts(team, season);
  return concepts.slice(0, 3).map((concept, index) => ({
    id: concept.id || `ai-concept-${index + 1}`,
    name: concept.name || `Concept ${index + 1}`,
    strategyFit: concept.strategyFit || concept.fit || 'Generated from season constraints and team requirements.',
    difficulty: concept.difficulty || ['Beginner-safe', 'Intermediate', 'Advanced'][index],
    estimatedCost: Number(concept.estimatedCost || concept.cost || Math.round(team.budget * [0.7, 0.9, 1.1][index])),
    buildTime: concept.buildTime || ['3-4 weeks', '5-6 weeks', '7+ weeks'][index],
    requiredTools: concept.requiredTools || team.tools || [],
    requiredParts: concept.requiredParts || [],
    mainMechanisms: concept.mainMechanisms || concept.mechanisms || [],
    pros: concept.pros || [],
    cons: concept.cons || [],
    risks: concept.risks || [],
    upgradePath: concept.upgradePath || [],
    ruleConcerns: quoteRule(`${concept.name || ''} robot construction scoring`),
  }));
}

function normalizeAiBuildGuide(steps, project) {
  if (!Array.isArray(steps) || steps.length === 0) return buildGuide(project);
  return steps.map((step, index) => ({
    phase: step.phase || `Step ${index + 1}`,
    title: step.title || step.phase || `Build step ${index + 1}`,
    parts: Array.isArray(step.parts) ? step.parts : [],
    tools: Array.isArray(step.tools) ? step.tools : project.team.tools || [],
    time: step.time || step.estimatedTime || '30-60 min',
    diagram: step.diagram || `Diagram ${index + 1}`,
    instructions: step.instructions || step.instruction || '',
    checkpoint: step.checkpoint || 'Review before continuing.',
    commonMistake: step.commonMistake || 'Skipping fit checks.',
    test: step.test || step.testBeforeContinuing || 'Verify the subsystem is safe and repeatable.',
    generatedBy: project.generatedBy || 'vertex-express',
  }));
}

async function applyAiPacket(project) {
  const ai = await callVertexJson({ prompt: projectAiPrompt(project) });
  if (!ai.ok) {
    project.generatedBy = 'local-fallback';
    project.aiFallbackReason = ai.error;
    return project;
  }

  const season = currentSeasonSource(project);
  project.generatedBy = 'vertex-express';
  project.strategy = ai.data.strategy || project.strategy;
  project.concepts = normalizeAiConcepts(ai.data.concepts, project.team, season);
  project.selectedDesign = project.concepts[1] || project.concepts[0];
  project.buildGuide = normalizeAiBuildGuide(ai.data.buildGuide, project);
  return project;
}

async function createProject(body = {}) {
  const team = defaultTeam(body.team || body);
  const id = slugId('project');
  const project = {
    id,
    status: 'draft',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    team,
    documents: Array.from(state.documents.values()).map((doc) => doc.id),
    season: currentSeasonSource(),
    generatedBy: 'local-fallback',
    aiFallbackReason: null,
    strategy: buildStrategy(team, currentSeasonSource()),
    concepts: buildConcepts(team, currentSeasonSource()),
    selectedDesign: null,
    bom: null,
    physics: calculateMechanisms(),
    cad: null,
    code: null,
    buildGuide: null,
    warnings: [
      'Rule-sensitive claims require citations from the indexed manual.',
      'CAD is conceptual until dimensions and clearances are verified.',
      'Generated FTC SDK code must be compiled in a real FTC project before robot use.',
    ],
  };
  await applyAiPacket(project);
  project.season = currentSeasonSource(project);
  project.selectedDesign = project.concepts[1];
  project.bom = buildBom(team, project.selectedDesign.id);
  project.cad = generateCadConcept(project);
  project.code = generateCode(project);
  project.buildGuide = buildGuide(project);
  project.driverInsight = analyzeDriverLogs([]);
  project.sponsorDraft = sponsorEmail({ team });
  state.projects.set(id, project);
  return project;
}

function projectForResponse(project) {
  if (!project) return null;
  const bomItems = [...(project.bom?.required || []), ...(project.bom?.optional || [])];
  const id = project.id || 'demo';
  return {
    ...project,
    team: { ...project.team, manual: project.team.manual },
    season: project.season || currentSeasonSource(project),
    generatedBy: project.generatedBy || 'local-fallback',
    aiFallbackReason: project.aiFallbackReason || null,
    aiStatus: aiStatus(),
    sourceDocuments: (project.documents || []).map((docId) => state.documents.get(docId)).filter(Boolean).map((doc) => ({
      id: doc.id,
      title: doc.title,
      type: doc.type,
      version: doc.version,
      pages: doc.pages,
      ingestedAt: doc.ingestedAt,
      seasonSource: doc.seasonSource,
    })),
    artifactUrls: {
      projectJson: `/api/projects/${id}/export.json`,
      codeZip: `/api/projects/${id}/code/export.zip`,
      cadGltf: `/api/projects/${id}/cad/export.glb`,
      cadStep: `/api/projects/${id}/cad/export.step`,
      buildGuideHtml: `/api/projects/${id}/build-guide/export.html`,
    },
    concepts: project.concepts.map((concept) => ({
      ...concept,
      cost: concept.estimatedCost ?? concept.cost ?? 0,
      fit: concept.strategyFit ?? concept.fit ?? '',
      buildTime: concept.buildTime,
      mechanisms: concept.mainMechanisms ?? concept.mechanisms ?? [],
      risks: concept.risks,
    })),
    rules: quoteRule('robot construction control system autonomous teleop penalties').map((citation) => ({
      rule: citation.ruleNumber,
      section: citation.manualSection,
      status: citation.confidence === 'Low' ? 'Needs citation verification' : 'Indexed citation available',
      confidence: citation.confidence,
      note: citation.explanation,
      sourceDocument: citation.sourceDocument,
    })),
    bom: bomItems.map((item) => ({
      subsystem: item.subsystem,
      sku: item.sku,
      part: item.part,
      qty: item.qty,
      price: item.price,
      stock: item.stock,
      productUrl: item.productUrl,
      lastChecked: item.lastChecked,
    })),
    physics: project.physics.map((item) => ({
      mechanism: item.mechanism,
      formula: item.formula,
      inputs: Object.entries(item.assumptions || {}).map(([key, value]) => `${key}: ${value}`).join(', '),
      result: item.result,
      recommendation: item.recommendation,
      margin: item.safetyFactor,
      warning: item.warning,
    })),
    buildSteps: project.buildGuide?.map((step) => `${step.phase}: ${step.instructions}`) || [],
    buildGuide: project.buildGuide || [],
    codeFiles: Object.keys(project.code || {}),
    driverInsight: project.driverInsight?.suggestions?.join(' ') || '',
    sponsorDraft: project.sponsorDraft?.subject || '',
  };
}

await loadCachedCatalog();
await ingestDefaultReferences().catch((error) => console.warn('Reference ingestion skipped:', error.message));
if (state.catalog.size === 0) {
  syncRevCatalog({ limit: 12 }).catch((error) => console.warn('Initial REV catalog sync skipped:', error.message));
}
const demoProject = await createProject();

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'blueprint-api',
    catalogItems: state.catalog.size,
    documents: state.documents.size,
    chunks: state.chunks.length,
  });
});

app.get('/api/ai/status', (_req, res) => {
  res.json(aiStatus());
});

app.get('/api/project/demo', (_req, res) => {
  res.json(projectForResponse(demoProject));
});

app.post('/api/projects', async (req, res, next) => {
  try {
    const project = await createProject(req.body);
    res.status(201).json(projectForResponse(project));
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

app.patch('/api/projects/:id', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  Object.assign(project.team, defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) }));
  project.updatedAt = nowIso();
  res.json(projectForResponse(project));
});

app.post('/api/projects/:id/intake', async (req, res, next) => {
  try {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.team = defaultTeam({ ...project.team, ...(req.body.team || req.body || {}) });
    project.updatedAt = nowIso();
    res.json(projectForResponse(project));
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/generate-blueprint', async (req, res, next) => {
  try {
    const project = state.projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    project.team = defaultTeam({ ...project.team, ...(req.body.team || {}) });
    project.season = currentSeasonSource(project);
    project.strategy = buildStrategy(project.team, project.season);
    project.concepts = buildConcepts(project.team, project.season);
    project.selectedDesign = project.concepts[1] || project.concepts[0];
    await applyAiPacket(project);
    project.selectedDesign = project.concepts[1] || project.concepts[0];
    project.bom = buildBom(project.team, project.selectedDesign.id);
    project.physics = calculateMechanisms();
    project.cad = generateCadConcept(project);
    project.code = generateCode(project);
    project.buildGuide = project.buildGuide || buildGuide(project);
    project.updatedAt = nowIso();
    res.json(projectForResponse(project));
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/documents/ingest-defaults', async (req, res, next) => {
  try {
    const docs = await ingestDefaultReferences();
    const project = state.projects.get(req.params.id);
    if (project) project.documents = docs.map((doc) => doc.id);
    res.json({ documents: docs, chunks: state.chunks.length });
  } catch (error) {
    next(error);
  }
});

app.post('/api/projects/:id/documents/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ext !== '.pdf') {
      return res.status(400).json({ error: 'Only PDF season/manual resources are supported in this MVP.' });
    }
    const doc = await ingestDocument({
      filePath: req.file.path,
      title: req.body.title || req.file.originalname,
      type: req.body.type || 'season-resource',
      sourceUrl: req.file.originalname,
      version: req.body.version || null,
    });
    const project = state.projects.get(req.params.id);
    if (project) {
      project.documents = Array.from(new Set([...(project.documents || []), doc.id]));
      project.season = currentSeasonSource(project);
      project.team.manual = doc.seasonSource?.title || doc.title;
      project.updatedAt = nowIso();
    }
    res.status(201).json({ document: doc, project: project ? projectForResponse(project) : null });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects/:id/documents', (_req, res) => {
  res.json(Array.from(state.documents.values()));
});

app.get('/api/projects/:id/rules/search', (req, res) => {
  res.json({ query: req.query.q || '', citations: quoteRule(String(req.query.q || 'robot construction')) });
});

app.post('/api/catalog/sync', async (req, res, next) => {
  try {
    const products = await syncRevCatalog({ query: req.body?.query || 'ftc', limit: Number(req.body?.limit || 30) });
    res.json({ synced: products.filter((product) => !product.error).length, products, errors: products.filter((product) => product.error) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/catalog/search', (req, res) => {
  res.json({ query: req.query.q || '', products: searchCatalog(String(req.query.q || ''), Number(req.query.limit || 20)) });
});

app.get('/api/catalog/products/:sku', (req, res) => {
  const product = state.catalog.get(req.params.sku.toUpperCase());
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
});

app.post('/api/projects/:id/generate-strategies', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.strategy = buildStrategy({ ...project.team, ...(req.body || {}) });
  res.json(project.strategy);
});

app.post('/api/projects/:id/generate-designs', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.concepts = buildConcepts({ ...project.team, ...(req.body || {}) });
  res.json(project.concepts);
});

app.post('/api/projects/:id/select-design', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.selectedDesign = project.concepts.find((concept) => concept.id === req.body.designId) || project.concepts[1];
  project.bom = buildBom(project.team, project.selectedDesign.id);
  project.cad = generateCadConcept(project);
  project.code = generateCode(project);
  project.buildGuide = buildGuide(project);
  res.json(project);
});

app.post('/api/projects/:id/generate-bom', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.bom = buildBom({ ...project.team, ...(req.body.team || {}) }, req.body.designId || project.selectedDesign?.id);
  res.json(project.bom);
});

app.post('/api/projects/:id/calculate/mechanism', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.physics = calculateMechanisms(req.body);
  res.json(project.physics);
});

app.get('/api/projects/:id/calculations', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.physics);
});

app.post('/api/projects/:id/generate-cad', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.cad = generateCadConcept({ ...project, cadInputs: req.body });
  res.json(project.cad);
});

app.get('/api/projects/:id/cad', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.cad);
});

app.get('/api/projects/:id/cad/export', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.type('text/plain').send(JSON.stringify(project.cad, null, 2));
});

app.get('/api/projects/:id/cad/export.glb', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.attachment(cadExportName(project, 'glb'));
  res.type('model/gltf+json').send(JSON.stringify(cadAsGltf(project), null, 2));
});

app.get('/api/projects/:id/cad/export.step', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.attachment(cadExportName(project, 'step'));
  res.type('model/step').send(cadAsStep(project));
});

app.post('/api/projects/:id/generate-code', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.code = generateCode({ ...project, codeInputs: req.body });
  res.json(project.code);
});

app.get('/api/projects/:id/code', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.code);
});

app.get('/api/projects/:id/code/export.zip', (req, res, next) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-FTC-code.zip`);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', next);
  archive.pipe(res);
  for (const [file, content] of Object.entries(project.code || {})) {
    archive.append(content, { name: `TeamCode/src/main/java/org/firstinspires/ftc/teamcode/${file}` });
  }
  archive.finalize();
});

app.post('/api/projects/:id/generate-build-guide', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.buildGuide = buildGuide({ ...project, buildInputs: req.body });
  res.json(project.buildGuide);
});

app.get('/api/projects/:id/build-guide', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project.buildGuide);
});

app.get('/api/projects/:id/build-guide/export.html', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-build-guide.html`);
  res.type('html').send(buildGuideHtml(project));
});

app.get('/api/projects/:id/export.json', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.attachment(`${project.team.name.replace(/[^a-z0-9]+/gi, '-')}-blueprint.json`);
  res.json(projectForResponse(project));
});

app.get('/api/projects/:id/prompts', (req, res) => {
  const project = state.projects.get(req.params.id) || demoProject;
  res.json(buildAgentPrompts(project));
});

app.post('/api/projects/:id/agents/review-plan', (req, res) => {
  const project = state.projects.get(req.params.id) || demoProject;
  const prompts = buildAgentPrompts(project);
  res.json({
    projectContext: prompts.context,
    executionOrder: prompts.agents.map((agent) => agent.name),
    reviewGates: [
      'Rules Agent must cite official manual chunks before legality claims.',
      'Physics Agent must produce assumptions and safety factor for every motorized mechanism.',
      'Parts Agent must include SKU, product URL, lastChecked, and budget effect.',
      'Review Agent must block final output if code hardware names do not match generated hardware guide.',
    ],
    modelAdapterPayload: {
      system: prompts.system,
      messages: prompts.agents.map((agent) => ({ role: 'user', content: agent.prompt })),
      structuredOutput: true,
      note: 'This endpoint prepares prompts for the app model adapter; it does not call a hosted LLM in local MVP mode.',
    },
    requestedTask: req.body?.task || 'Generate complete project plan',
  });
});

app.post('/api/projects/:id/driver-logs/analyze', (req, res) => {
  const project = state.projects.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  project.driverInsight = analyzeDriverLogs(req.body.logs || req.body.events || req.body.csv || []);
  res.json(project.driverInsight);
});

app.post('/api/teams/:id/sponsor-email', (req, res) => {
  const project = Array.from(state.projects.values()).find((candidate) => candidate.team.number === req.params.id || candidate.team.name === req.params.id) || demoProject;
  res.json(sponsorEmail({ team: project.team, ...req.body }));
});

app.post('/api/teams/:id/grant-draft', (req, res) => {
  const project = Array.from(state.projects.values()).find((candidate) => candidate.team.number === req.params.id || candidate.team.name === req.params.id) || demoProject;
  res.json({
    title: `${project.team.name} FTC Robotics Grant Request`,
    requestedAmount: req.body.amount || 1000,
    needStatement: `${project.team.name} needs funding for competition registration, REV Robotics parts, spare components, and outreach materials.`,
    budgetJustification: project.bom,
    impact: 'Funding reduces the burden on students and helps the team build a safe, legal, well-documented robot while learning engineering fundamentals.',
  });
});

app.post('/api/projects/:id/chat', async (req, res) => {
  const project = state.projects.get(req.params.id) || demoProject;
  const message = String(req.body?.message || '');
  const citations = quoteRule(message);
  const catalogHits = searchCatalog(message, 3);
  const ai = await callVertexJson({
    prompt: [
      'Return JSON: { "answer": string, "suggestedActions": string[] }.',
      'You are Blueprint. Answer using the project context. Do not make legality claims without citations.',
      `Question: ${message}`,
      `Team: ${JSON.stringify(project.team)}`,
      `Season: ${JSON.stringify(project.season || currentSeasonSource(project))}`,
      `Citations available: ${JSON.stringify(citations)}`,
    ].join('\n\n'),
  });
  res.json({
    answer: ai.ok
      ? ai.data.answer
      : `For ${project.team.name}: ${message ? `I would handle "${message}" by checking indexed rules first, then updating the relevant BOM, calculation, code, CAD, or build-guide artifact.` : 'Ask about strategy, legality, parts, torque, code, CAD, grants, or driver logs.'} I will not make a definitive legality claim without the cited manual section and version.`,
    citations,
    catalogHits,
    generatedBy: ai.generatedBy,
    suggestedActions: ai.ok ? ai.data.suggestedActions || [] : ['search rules', 'recalculate mechanism', 'regenerate BOM', 'update code artifact'],
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Blueprint API running on http://localhost:${port}`);
});
