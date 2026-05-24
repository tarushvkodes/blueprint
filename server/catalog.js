import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { cacheDir, seedRevUrls } from './config.js';
import { state } from './state.js';
import { normalizeWhitespace, nowIso, scoreText } from './utils.js';

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

function productCategory(name, description = '') {
  const text = `${name} ${description}`.toLowerCase();
  if (/linear|slide/.test(text)) return 'Linear motion';
  if (/motor|gearbox|servo/.test(text)) return /servo/.test(text) ? 'Servos' : 'Motors';
  if (/hub|driver|control|battery|wire|cable|sensor|switch|xt30/.test(text)) return 'Control system';
  if (/wheel|mecanum|traction/.test(text)) return 'Wheels';
  if (/gear|sprocket|chain|belt|pulley/.test(text)) return 'Power transmission';
  if (/bracket|channel|extrusion|shaft|bearing|screw|nut|standoff/.test(text)) return 'Structure';
  return 'General FTC parts';
}

function normalizeProductUrl($, fallbackUrl) {
  const canonical = $('link[rel="canonical"]').attr('href') || fallbackUrl;
  return canonical.startsWith('http') ? canonical : new URL(canonical, fallbackUrl).href;
}

function stockLabel(bcData, htmlText) {
  const text = htmlText.toLowerCase();
  if (bcData?.product_attributes?.instock === false || /out of stock|sold out/.test(text)) return 'Out of stock';
  if (bcData?.product_attributes?.purchasable === false || /not purchasable|coming soon/.test(text)) return 'Not purchasable online';
  if (/add to cart|in stock|available/.test(text)) return 'Available/unknown quantity';
  return 'Availability not checked';
}

export function parseRevProductHtml(url, html, checkedAt = nowIso()) {
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
  const productUrl = normalizeProductUrl($, url);
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
  const searchText = normalizeWhitespace(`${sku} ${name} ${productCategory(name, description)} ${description}`);
  return {
    id: sku || productUrl,
    supplier: 'REV Robotics',
    sku,
    name,
    category: productCategory(name, description),
    price,
    weight: bcData?.product_attributes?.weight || null,
    dimensions: null,
    material: null,
    productUrl,
    cadUrl: docs.find((doc) => /\.(step|stp|stl|x_t|sldprt|sldasm|iges|igs)(\?|$)/i.test(doc)) || null,
    docs,
    image,
    stockStatus: stockLabel(bcData, html),
    purchasable: !/out of stock|not purchasable/i.test(stockLabel(bcData, html)),
    lastChecked: checkedAt,
    ftcLegalityStatus: 'Needs rules citation review',
    compatibleParts: [],
    requiredAccessories: [],
    electricalRequirements: null,
    mechanicalProperties: {},
    notes: description.slice(0, 700),
    searchText,
  };
}

async function parseRevProduct(url) {
  const html = await fetchText(url);
  return parseRevProductHtml(url, html);
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

export async function syncRevCatalog(options = {}) {
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
  const values = Array.from(state.catalog.values());
  await fsp.writeFile(path.join(cacheDir, 'rev-catalog.json'), JSON.stringify(values, null, 2));
  await fsp.writeFile(path.join(cacheDir, 'rev-catalog-meta.json'), JSON.stringify({
    syncedAt: nowIso(),
    query: options.query || 'ftc',
    requestedLimit: options.limit || 30,
    itemCount: values.length,
    errorCount: products.filter((product) => product.error).length,
  }, null, 2));
  return products;
}

export async function loadCachedCatalog() {
  const file = path.join(cacheDir, 'rev-catalog.json');
  if (!fs.existsSync(file)) return [];
  const items = JSON.parse(await fsp.readFile(file, 'utf8'));
  for (const item of items) state.catalog.set(item.sku.toUpperCase(), item);
  return items;
}

export function searchCatalog(query, limit = 20) {
  const products = Array.from(state.catalog.values());
  const scored = products
    .map((product) => ({
      product,
      score: scoreText(product.searchText || `${product.sku} ${product.name} ${product.category} ${product.notes}`, query),
    }))
    .filter((entry) => entry.score > 0 || !query)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name));
  return scored.slice(0, limit).map((entry) => entry.product);
}

export function findCatalogPart(...queries) {
  for (const query of queries) {
    const found = searchCatalog(query, 1)[0];
    if (found) return found;
  }
  return null;
}
