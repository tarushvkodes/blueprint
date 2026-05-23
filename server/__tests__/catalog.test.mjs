import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import fsp from 'node:fs/promises';
import { createCatalogModule } from '../modules/catalog.js';

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function scoreText(text, query) {
  const normalizedQuery = normalizeWhitespace(query).toLowerCase();
  if (!normalizedQuery) return 1;
  return normalizeWhitespace(text).toLowerCase().includes(normalizedQuery) ? 1 : 0;
}

function buildResponse(html, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return html;
    },
  };
}

test('catalog normalizes REV products and applies overrides', async () => {
  const fixtureDir = new URL('./fixtures/', import.meta.url);
  const searchHtml = await fsp.readFile(new URL('rev-search-page.html', fixtureDir), 'utf8');
  const productHtml = await fsp.readFile(new URL('rev-product.html', fixtureDir), 'utf8');
  const cacheDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'catalog-test-'));
  const requestedProductUrls = [];
  const fetchImpl = async (url) => {
    const href = String(url);
    if (href.includes('/search.php') && href.includes('page=1')) return buildResponse(searchHtml);
    if (href.includes('/search.php') && href.includes('page=2')) return buildResponse('<html><body>No matches</body></html>');
    if (href.includes('/rev-41-1301/')) {
      requestedProductUrls.push(href);
      return buildResponse(productHtml);
    }
    if (href.includes('/rev-41-1301-alt/')) {
      requestedProductUrls.push(href);
      return buildResponse(productHtml);
    }
    return buildResponse('<html><body>Not found</body></html>', 404);
  };

  const catalogApi = createCatalogModule({
    seedRevUrls: [],
    cacheDir,
    catalog: new Map(),
    nowIso: () => '2026-01-01T00:00:00.000Z',
    normalizeWhitespace,
    scoreText,
    fetchImpl,
    requestDelayMs: 0,
  });

  const syncResults = await catalogApi.syncRevCatalog({ query: 'motors', limit: 2 });
  const syncedProducts = syncResults.filter((entry) => !entry.error);
  assert.equal(syncedProducts.length, 1);
  assert.equal(requestedProductUrls.length, 1);

  const product = catalogApi.getCatalogProduct('REV-41-1301', 'rev');
  assert.ok(product);
  assert.equal(product.supplier, 'rev');
  assert.equal(product.category, 'motors');
  assert.equal(product.weight, '0.69 lb');
  assert.equal(product.dimensions, '2.4 in x 1.5 in x 1.5 in');
  assert.equal(product.voltageRange, '9-14V');
  assert.equal(product.stallCurrent, 9.2);
  assert.equal(product.freeRpm, 435);
  assert.equal(product.encoderTicks, 28);
  assert.deepEqual(product.compatibleSkus, ['REV-41-1600', 'REV-45-1655', 'REV-21-3009']);
  assert.deepEqual(product.requiredAccessories, ['REV-41-1165', 'REV-41-1302']);

  await catalogApi.setCatalogOverride('REV-41-1301', {
    supplier: 'rev',
    price: 42.42,
    stock: 'Backorder',
    notes: 'Manual override for testing',
  });

  const overridden = catalogApi.getCatalogProduct('REV-41-1301', 'rev');
  assert.equal(overridden.price, 42.42);
  assert.equal(overridden.stockStatus, 'Backorder');
  assert.match(overridden.notes, /Manual override/);

  const searchResults = catalogApi.searchCatalog('motor', { supplier: 'rev', limit: 3 });
  assert.equal(searchResults[0].price, 42.42);

  const overrideFile = JSON.parse(await fsp.readFile(path.join(cacheDir, 'rev-overrides.json'), 'utf8'));
  assert.equal(overrideFile.length, 1);
  assert.equal(overrideFile[0].price, 42.42);

  await catalogApi.deleteCatalogOverride('REV-41-1301', { supplier: 'rev' });
  const restored = catalogApi.getCatalogProduct('REV-41-1301', 'rev');
  assert.equal(restored.price, 32.99);
});
