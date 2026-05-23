import * as cheerio from 'cheerio';
import { createRequire } from 'node:module';
import { SupplierAdapter } from './adapter.js';

const require = createRequire(import.meta.url);
const revCompatibilitySeed = require('./rev-compatibility.json');

const REV_USER_AGENT = 'FTC-Copilot-MVP/0.1 (+local development)';
const REV_BASE_URL = 'https://www.revrobotics.com';
export const REV_CATEGORY_TAXONOMY = Object.freeze([
  'drivetrain',
  'motors',
  'servos',
  'sensors',
  'structure',
  'power',
  'wheels',
  'slides',
  'intake',
  'control',
  'accessory',
]);

class SupplierHttpError extends Error {
  constructor(status, url) {
    super(`Fetch failed ${status} for ${url}`);
    this.name = 'SupplierHttpError';
    this.status = status;
    this.url = url;
  }
}

function normalizeSku(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCategoryText(value, normalizeWhitespace) {
  return normalizeWhitespace(String(value || '')).toLowerCase();
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function extractTextNumber(value) {
  const match = String(value || '').replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractCurrentProduct(html) {
  const match = html.match(/var\s+currentProduct\s*=\s*JSON\.parse\("(.+?)"\);/s);
  if (!match) return {};
  try {
    return JSON.parse(match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\'));
  } catch {
    return {};
  }
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

function collectLabelValuePairs($, bcData, jsonLdProduct, normalizeWhitespace) {
  const pairs = [];
  const seen = new Set();
  const pushPair = (label, value) => {
    const normalizedLabel = normalizeWhitespace(String(label || ''));
    const normalizedValue = normalizeWhitespace(String(value || ''));
    if (!normalizedLabel || !normalizedValue) return;
    const dedupeKey = `${normalizedLabel}|${normalizedValue}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    pairs.push([normalizedLabel, normalizedValue]);
  };
  const visit = (node, parentKey = '') => {
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, parentKey));
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (typeof node.name === 'string' && Object.hasOwn(node, 'value')) {
      pushPair(node.name, node.value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (value == null) continue;
      if (Array.isArray(value) || typeof value === 'object') {
        visit(value, key);
      } else if (typeof value === 'string' || typeof value === 'number') {
        pushPair(parentKey || key, value);
      }
    }
  };
  visit(bcData?.product_attributes);
  visit(bcData?.product);
  visit(bcData?.custom_fields);
  visit(jsonLdProduct?.additionalProperty);

  const addTableRows = (rootSelector) => {
    $(`${rootSelector} tr`).each((_index, row) => {
      const cells = $(row).find('th, td');
      if (cells.length < 2) return;
      const label = $(cells[0]).text();
      const value = $(cells[cells.length - 1]).text();
      pushPair(label, value);
    });
  };
  addTableRows('.productView-description');
  addTableRows('.tab-content');
  addTableRows('.tabs-contents');

  $('.productView-description li').each((_index, item) => {
    const line = normalizeWhitespace($(item).text());
    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) return;
    pushPair(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
  });

  return pairs;
}

function parseVoltageRange(text) {
  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:v|volt(?:s)?)\s*(?:to|-)\s*(\d+(?:\.\d+)?)\s*(?:v|volt(?:s)?)/i);
  if (rangeMatch) return `${rangeMatch[1]}-${rangeMatch[2]}V`;
  const singleMatch = text.match(/(?:voltage|input)[^0-9]{0,20}(\d+(?:\.\d+)?)\s*(?:v|volt(?:s)?)/i);
  if (singleMatch) return `${singleMatch[1]}V`;
  return null;
}

function parseCurrentValue(text) {
  const match = text.match(/stall[^0-9]{0,24}(\d+(?:\.\d+)?)\s*a\b/i) || text.match(/(\d+(?:\.\d+)?)\s*a\b[^a-z0-9]{0,8}stall/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseFreeRpm(text) {
  const match = text.match(/free[^0-9]{0,24}(\d+(?:\.\d+)?)\s*rpm/i) || text.match(/(\d+(?:\.\d+)?)\s*rpm[^a-z0-9]{0,8}free/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseEncoderTicks(text) {
  const match =
    text.match(/encoder[^0-9]{0,24}(\d+(?:\.\d+)?)\s*(?:ticks?|counts?)(?:\s*per\s*(?:rev|rotation))?/i)
    || text.match(/(\d+(?:\.\d+)?)\s*(?:ticks?|counts?)\s*per\s*(?:rev|rotation)/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseDimensions(bcData, text, normalizeWhitespace) {
  const dimensions = bcData?.product_attributes?.dimensions || bcData?.product?.dimensions;
  if (dimensions && typeof dimensions === 'object') {
    const length = dimensions.length ?? dimensions.depth;
    const width = dimensions.width;
    const height = dimensions.height;
    if (length || width || height) {
      const values = [length, width, height]
        .map((value) => normalizeWhitespace(String(value || '')))
        .filter(Boolean);
      if (values.length > 1) return values.join(' x ');
    }
  }
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm|cm|in|")\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|in|")\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm|cm|in|")/i);
  if (!match) return null;
  return normalizeWhitespace(match[0]);
}

function normalizeRevCategory(rawCategories, name, normalizeWhitespace) {
  const candidates = [
    ...rawCategories.map((value) => normalizeCategoryText(value, normalizeWhitespace)),
    normalizeCategoryText(name, normalizeWhitespace),
  ];
  const joined = candidates.join(' ');
  if (/(controller|control hub|driver hub|expansion hub|imu|radio|processor|module)/.test(joined)) return 'control';
  if (/(mecanum|omni|traction wheel|wheel)/.test(joined)) return 'wheels';
  if (/(linear slide|linear motion|slide kit|viper slide|slide)/.test(joined)) return 'slides';
  if (/(servo)/.test(joined)) return 'servos';
  if (/(motor|gearmotor|planetary motor)/.test(joined)) return 'motors';
  if (/(sensor|encoder|limit switch|distance sensor|color sensor)/.test(joined)) return 'sensors';
  if (/(drivetrain|sprocket|chain|belt|pulley|gearbox|differential|axle)/.test(joined)) return 'drivetrain';
  if (/(battery|power|voltage|fuse|switch|converter|xt30|wire|cable|charger)/.test(joined)) return 'power';
  if (/(intake|roller|compliant wheel)/.test(joined)) return 'intake';
  if (/(channel|plate|bracket|extrusion|shaft|bearing|standoff|fastener|structure|chassis)/.test(joined)) return 'structure';
  return 'accessory';
}

function collectCategories($, bcData, jsonLdProduct, normalizeWhitespace) {
  const categoryValues = [];
  const addCategory = (value) => {
    if (Array.isArray(value)) {
      value.forEach(addCategory);
      return;
    }
    if (typeof value === 'object' && value !== null) {
      if (typeof value.name === 'string') addCategory(value.name);
      Object.values(value).forEach(addCategory);
      return;
    }
    const text = normalizeWhitespace(String(value || ''));
    if (!text || /^home$/i.test(text)) return;
    categoryValues.push(text);
  };
  addCategory(jsonLdProduct?.category);
  addCategory(bcData?.product_attributes?.categories);
  addCategory(bcData?.product?.categories);
  addCategory(bcData?.breadcrumbs);
  $('.breadcrumbs a, nav[aria-label*="breadcrumb"] a').each((_index, anchor) => {
    addCategory($(anchor).text());
  });
  return uniqueStrings(categoryValues);
}

function normalizeCompatibilityMap(rawMap) {
  const entries = Object.entries(rawMap || {});
  return new Map(
    entries.map(([sku, value]) => {
      const compatibleSkus = uniqueStrings((value?.compatibleSkus || []).map((item) => normalizeSku(item)));
      const requiredAccessories = uniqueStrings((value?.requiredAccessories || []).map((item) => normalizeSku(item)));
      return [normalizeSku(sku), { compatibleSkus, requiredAccessories }];
    }),
  );
}

function toAbsoluteUrl(urlLike, baseUrl) {
  if (!urlLike) return '';
  try {
    return new URL(urlLike, baseUrl).href;
  } catch {
    return '';
  }
}

function normalizeRevProductUrl(url) {
  return String(url || '').trim().toLowerCase().replace(/\?.*$/, '');
}

export class RevSupplierAdapter extends SupplierAdapter {
  constructor({
    seedUrls = [],
    nowIso,
    normalizeWhitespace,
    fetchImpl = fetch,
    requestDelayMs = 1000,
    compatibilityMap = revCompatibilitySeed,
  }) {
    super({ supplier: 'rev' });
    this.seedUrls = uniqueStrings(seedUrls.map((url) => toAbsoluteUrl(url, REV_BASE_URL)));
    this.nowIso = nowIso;
    this.normalizeWhitespace = normalizeWhitespace;
    this.fetchImpl = fetchImpl;
    this.requestDelayMs = Math.max(0, Number(requestDelayMs) || 0);
    this.lastRequestAt = 0;
    this.compatibilityMap = normalizeCompatibilityMap(compatibilityMap);
  }

  async waitForThrottle() {
    if (this.requestDelayMs <= 0) return;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed >= this.requestDelayMs) return;
    await new Promise((resolve) => setTimeout(resolve, this.requestDelayMs - elapsed));
  }

  async fetchText(url) {
    await this.waitForThrottle();
    const response = await this.fetchImpl(url, {
      headers: {
        'user-agent': REV_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    this.lastRequestAt = Date.now();
    if (!response.ok) throw new SupplierHttpError(response.status, url);
    return response.text();
  }

  createProductMetadata({ bcData, jsonLdProduct, $, description }) {
    const pairEntries = collectLabelValuePairs($, bcData, jsonLdProduct, this.normalizeWhitespace);
    const metadataText = this.normalizeWhitespace(
      [description, jsonLdProduct?.description || '', ...pairEntries.map(([label, value]) => `${label}: ${value}`)].join(' '),
    );

    const labeledValue = (regex) => pairEntries.find(([label]) => regex.test(label))?.[1] || '';
    const weightValue = labeledValue(/\bweight\b/i) || bcData?.product_attributes?.weight || jsonLdProduct?.weight?.value || '';
    const weight = this.normalizeWhitespace(String(weightValue || '')) || null;
    const dimensions = parseDimensions(bcData, metadataText, this.normalizeWhitespace);
    const voltageRange = parseVoltageRange(metadataText);
    const stallCurrent = parseCurrentValue(metadataText);
    const freeRpm = parseFreeRpm(metadataText);
    const encoderTicks = parseEncoderTicks(metadataText) ?? extractTextNumber(labeledValue(/\b(?:encoder|ticks?|counts?)\b/i));

    return {
      weight,
      dimensions,
      voltageRange,
      stallCurrent,
      freeRpm,
      encoderTicks,
    };
  }

  parseStockStatus(bcData) {
    if (bcData?.product_attributes?.instock === false) return 'Out of stock';
    if (bcData?.product_attributes?.purchasable === false) return 'Not purchasable online';
    if (Number.isFinite(Number(bcData?.product_attributes?.inventory_level))) {
      return Number(bcData.product_attributes.inventory_level) > 0 ? 'In stock' : 'Out of stock';
    }
    return 'Available/unknown quantity';
  }

  getCompatibility(sku) {
    return this.compatibilityMap.get(normalizeSku(sku)) || { compatibleSkus: [], requiredAccessories: [] };
  }

  async getProduct(sku, options = {}) {
    const normalizedSku = normalizeSku(sku);
    const url = options.productUrl
      ? toAbsoluteUrl(options.productUrl, REV_BASE_URL)
      : normalizedSku
        ? `${REV_BASE_URL}/${normalizedSku.toLowerCase()}/`
        : '';
    if (!url) throw new Error('REV getProduct requires a sku or productUrl');

    const html = await this.fetchText(url);
    const $ = cheerio.load(html);
    const bcData = parseBcData(html);
    const jsonLdProduct = parseJsonLd($).find((entry) => entry['@type'] === 'Product') || {};
    const currentProduct = extractCurrentProduct(html);
    const name = this.normalizeWhitespace(jsonLdProduct.name || currentProduct.title || $('.productView-title').first().text() || $('h1').first().text());
    const discoveredSku = normalizeSku(
      bcData?.product_attributes?.sku || jsonLdProduct.sku || $('[data-product-sku]').first().text() || currentProduct.sku || normalizedSku,
    );
    const productUrl = toAbsoluteUrl($('link[rel="canonical"]').attr('href') || url, REV_BASE_URL) || url;
    const image = $('meta[property="og:image"]').attr('content') || (Array.isArray(jsonLdProduct.image) ? jsonLdProduct.image[0] : jsonLdProduct.image) || '';
    const docs = [];
    $('a[href]').each((_index, anchor) => {
      const absolute = toAbsoluteUrl($(anchor).attr('href'), productUrl);
      if (!absolute) return;
      if (/\.(pdf|step|stp|stl|x_t|sldprt|sldasm|iges|igs)(\?|$)/i.test(absolute) || /docs\.revrobotics|content\/docs|cad/i.test(absolute)) {
        docs.push(absolute);
      }
    });
    const uniqueDocs = uniqueStrings(docs);
    const description = this.normalizeWhitespace(
      $('.productView-description, [data-content-region="product_below_content"]').text()
      || jsonLdProduct.description
      || $('meta[name="description"]').attr('content')
      || '',
    );
    const categories = collectCategories($, bcData, jsonLdProduct, this.normalizeWhitespace);
    const metadata = this.createProductMetadata({ bcData, jsonLdProduct, $, description });
    const compatibility = this.getCompatibility(discoveredSku);
    const numericPrice = Number(
      bcData?.product_attributes?.price?.without_tax?.value
      ?? $('meta[property="product:price:amount"]').attr('content')
      ?? String($('.price--main').first().text()).replace(/[^0-9.]/g, ''),
    ) || 0;

    return {
      id: discoveredSku || productUrl,
      supplier: 'rev',
      sku: discoveredSku,
      name,
      category: normalizeRevCategory(categories, name, this.normalizeWhitespace),
      price: numericPrice,
      weight: metadata.weight,
      dimensions: metadata.dimensions,
      voltageRange: metadata.voltageRange,
      stallCurrent: metadata.stallCurrent,
      freeRpm: metadata.freeRpm,
      encoderTicks: metadata.encoderTicks,
      material: null,
      productUrl,
      cadUrl: uniqueDocs.find((doc) => /\.(step|stp|stl|x_t|sldprt|sldasm|iges|igs)(\?|$)/i.test(doc)) || null,
      docs: uniqueDocs,
      image,
      stockStatus: this.parseStockStatus(bcData),
      lastChecked: this.nowIso(),
      ftcLegalityStatus: 'Needs rules citation review',
      compatibleSkus: compatibility.compatibleSkus,
      requiredAccessories: compatibility.requiredAccessories,
      compatibleParts: compatibility.compatibleSkus,
      electricalRequirements: {
        voltageRange: metadata.voltageRange,
        stallCurrent: metadata.stallCurrent,
      },
      mechanicalProperties: {
        weight: metadata.weight,
        dimensions: metadata.dimensions,
        freeRpm: metadata.freeRpm,
        encoderTicks: metadata.encoderTicks,
      },
      notes: description.slice(0, 700),
    };
  }

  getDiscoveryCandidates($, pageUrl) {
    const candidates = [];
    $('a[href]').each((_index, anchor) => {
      const href = $(anchor).attr('href');
      if (!href) return;
      const absolute = toAbsoluteUrl(href, pageUrl);
      if (!absolute || !/\/rev-[0-9a-z-]+\/?$/i.test(normalizeRevProductUrl(absolute))) return;
      const parentProduct = $(anchor).closest('[data-product-sku], .product, .card');
      const cardSku = normalizeSku(
        $(anchor).attr('data-product-sku')
        || parentProduct.attr('data-product-sku')
        || parentProduct.find('[data-product-sku]').attr('data-product-sku')
        || parentProduct.find('.card-sku, [data-test-id="product-sku"]').first().text(),
      );
      candidates.push({ url: absolute, sku: cardSku || null });
    });
    return candidates;
  }

  async discover({ query = 'ftc', limit = 3 } = {}) {
    const pages = Math.max(1, Math.min(25, Number(limit) || 1));
    const discovered = [];
    const seenUrls = new Set();
    const seenSkus = new Set();
    const addCandidate = (candidate) => {
      const normalizedUrl = normalizeRevProductUrl(candidate.url);
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;
      const skuKey = normalizeSku(candidate.sku);
      if (skuKey) {
        if (seenSkus.has(skuKey)) return;
        seenSkus.add(skuKey);
      }
      seenUrls.add(normalizedUrl);
      discovered.push({ url: candidate.url, sku: skuKey || null });
    };

    this.seedUrls.forEach((seedUrl) => addCandidate({ url: seedUrl, sku: null }));

    for (let page = 1; page <= pages; page += 1) {
      const searchUrl = new URL('/search.php', REV_BASE_URL);
      searchUrl.searchParams.set('search_query', query);
      searchUrl.searchParams.set('page', String(page));
      let html = '';
      try {
        html = await this.fetchText(searchUrl.href);
      } catch (error) {
        if (error instanceof SupplierHttpError) break;
        throw error;
      }
      const $ = cheerio.load(html);
      const pageCandidates = this.getDiscoveryCandidates($, searchUrl.href);
      pageCandidates.forEach(addCandidate);
      if (pageCandidates.length === 0) break;
    }

    return discovered;
  }

  async searchProducts({ query = 'ftc', limit = 20, pages = 3 } = {}) {
    const discovered = await this.discover({ query, limit: pages });
    const products = [];
    const seenSkus = new Set();
    for (const candidate of discovered) {
      if (products.length >= limit) break;
      try {
        const product = await this.getProduct(candidate.sku || '', { productUrl: candidate.url });
        const skuKey = normalizeSku(product.sku);
        if (!skuKey || seenSkus.has(skuKey)) continue;
        seenSkus.add(skuKey);
        products.push(product);
      } catch {
        // searchProducts is best effort for discovery previews.
      }
    }
    return products;
  }

  async getCadUrl(product) {
    return product?.cadUrl || null;
  }
}

export function createRevSupplierAdapter(options) {
  return new RevSupplierAdapter(options);
}

export function categoryFromRevProduct(rawCategories, name, normalizeWhitespace) {
  return normalizeRevCategory(rawCategories, name, normalizeWhitespace);
}
