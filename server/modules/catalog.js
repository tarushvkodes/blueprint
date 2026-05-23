import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { assertSupplierAdapter } from './suppliers/adapter.js';
import { createAndyMarkSupplierAdapter } from './suppliers/andymark.js';
import { createGoBildaSupplierAdapter } from './suppliers/gobilda.js';
import { REV_CATEGORY_TAXONOMY, categoryFromRevProduct, createRevSupplierAdapter } from './suppliers/rev.js';

export function createCatalogModule({
  seedRevUrls,
  cacheDir,
  catalog,
  nowIso,
  normalizeWhitespace,
  scoreText,
  fetchImpl,
  requestDelayMs,
}) {
  const SUPPLIERS = Object.freeze(['rev', 'gobilda', 'andymark']);
  const REV_TAXONOMY = new Set(REV_CATEGORY_TAXONOMY);
  const supplierCatalogs = new Map([
    ['rev', catalog],
    ['gobilda', new Map()],
    ['andymark', new Map()],
  ]);
  const supplierAdapters = new Map([
    [
      'rev',
      createRevSupplierAdapter({
        seedUrls: seedRevUrls,
        nowIso,
        normalizeWhitespace,
        fetchImpl,
        requestDelayMs,
      }),
    ],
    ['gobilda', createGoBildaSupplierAdapter()],
    ['andymark', createAndyMarkSupplierAdapter()],
  ]);
  const overridesPath = path.join(cacheDir, 'rev-overrides.json');
  const overrides = new Map();

  for (const supplier of SUPPLIERS) {
    assertSupplierAdapter(supplierAdapters.get(supplier), supplier);
  }

  function normalizeSupplier(value = 'rev') {
    const normalized = String(value || 'rev').trim().toLowerCase();
    if (SUPPLIERS.includes(normalized)) return normalized;
    throw new Error(`Unsupported supplier "${value}"`);
  }

  function normalizeSku(value) {
    return String(value || '').trim().toUpperCase();
  }

  function normalizeCategory(category, name) {
    const normalized = String(category || '').trim().toLowerCase();
    if (REV_TAXONOMY.has(normalized)) return normalized;
    return categoryFromRevProduct([category || ''], name || '', normalizeWhitespace);
  }

  function normalizeProduct(product, supplier) {
    if (!product || typeof product !== 'object') return null;
    const sku = normalizeSku(product.sku);
    if (!sku) return null;
    const baseCategory = product.category || 'accessory';
    const category = supplier === 'rev' ? normalizeCategory(baseCategory, product.name) : String(baseCategory || 'accessory').toLowerCase();
    const compatibleSkus = Array.isArray(product.compatibleSkus)
      ? product.compatibleSkus.map((value) => normalizeSku(value)).filter(Boolean)
      : Array.isArray(product.compatibleParts)
        ? product.compatibleParts.map((value) => normalizeSku(value)).filter(Boolean)
        : [];
    const requiredAccessories = Array.isArray(product.requiredAccessories)
      ? product.requiredAccessories.map((value) => normalizeSku(value)).filter(Boolean)
      : [];
    const normalized = {
      ...product,
      sku,
      id: product.id || sku,
      supplier,
      category,
      compatibleSkus,
      requiredAccessories,
    };
    if (!normalized.compatibleParts) normalized.compatibleParts = compatibleSkus;
    return normalized;
  }

  function getSupplierContext(supplierInput) {
    const supplier = normalizeSupplier(supplierInput);
    const adapter = supplierAdapters.get(supplier);
    const products = supplierCatalogs.get(supplier);
    return { supplier, adapter, products };
  }

  function overrideKey(supplier, sku) {
    return `${supplier}:${normalizeSku(sku)}`;
  }

  async function persistSupplierCatalog(supplier) {
    if (supplier !== 'rev') return;
    const supplierCatalog = supplierCatalogs.get('rev') || new Map();
    const output = Array.from(supplierCatalog.values()).map((item) => normalizeProduct(item, 'rev')).filter(Boolean);
    await fsp.writeFile(path.join(cacheDir, 'rev-catalog.json'), JSON.stringify(output, null, 2));
  }

  async function loadOverrides() {
    if (!fs.existsSync(overridesPath)) return;
    const raw = JSON.parse(await fsp.readFile(overridesPath, 'utf8'));
    const entries = Array.isArray(raw)
      ? raw
      : Object.entries(raw || {}).map(([key, value]) => {
        const [supplier = 'rev', sku = key] = key.split(':');
        return { supplier, sku, ...value };
      });
    for (const entry of entries) {
      const supplier = normalizeSupplier(entry.supplier || 'rev');
      const sku = normalizeSku(entry.sku);
      if (!sku) continue;
      const normalizedEntry = { supplier, sku, updatedAt: entry.updatedAt || nowIso() };
      if (Object.hasOwn(entry, 'price')) normalizedEntry.price = entry.price;
      if (Object.hasOwn(entry, 'stock')) normalizedEntry.stock = entry.stock;
      if (Object.hasOwn(entry, 'notes')) normalizedEntry.notes = entry.notes;
      overrides.set(overrideKey(supplier, sku), normalizedEntry);
    }
  }

  async function persistOverrides() {
    const output = Array.from(overrides.values()).sort((a, b) => a.sku.localeCompare(b.sku));
    await fsp.writeFile(overridesPath, JSON.stringify(output, null, 2));
  }

  function applyOverride(product, supplier) {
    if (!product) return null;
    const normalizedSupplier = normalizeSupplier(supplier || product.supplier || 'rev');
    const sku = normalizeSku(product.sku);
    if (!sku) return { ...product, supplier: normalizedSupplier };
    const override = overrides.get(overrideKey(normalizedSupplier, sku));
    if (!override) return { ...product, supplier: normalizedSupplier };
    const merged = { ...product, supplier: normalizedSupplier };
    if (Object.hasOwn(override, 'price') && override.price != null) merged.price = Number(override.price);
    if (Object.hasOwn(override, 'stock')) {
      merged.stock = override.stock;
      merged.stockStatus = String(override.stock);
    }
    if (Object.hasOwn(override, 'notes')) merged.notes = String(override.notes);
    return merged;
  }

  async function syncCatalog({ supplier = 'rev', query = 'ftc', limit = 3 } = {}) {
    const context = getSupplierContext(supplier);
    const discoveries = await context.adapter.discover({ query, limit });
    const results = [];
    const seenSkus = new Set();
    for (const discovery of discoveries) {
      const candidate = typeof discovery === 'string' ? { url: discovery } : discovery;
      try {
        const parsed = await context.adapter.getProduct(candidate.sku || '', { productUrl: candidate.url });
        const normalized = normalizeProduct(parsed, context.supplier);
        if (!normalized?.sku || !normalized.name) continue;
        if (seenSkus.has(normalized.sku)) continue;
        seenSkus.add(normalized.sku);
        context.products.set(normalized.sku, normalized);
        if (context.supplier === 'rev') catalog.set(normalized.sku, normalized);
        results.push(normalized);
      } catch (error) {
        results.push({
          supplier: context.supplier,
          sku: normalizeSku(candidate.sku),
          productUrl: candidate.url,
          error: error.message,
          lastChecked: nowIso(),
        });
      }
    }
    await persistSupplierCatalog(context.supplier);
    return results;
  }

  async function syncRevCatalog(options = {}) {
    return syncCatalog({ ...options, supplier: 'rev' });
  }

  async function loadCachedCatalog() {
    const file = path.join(cacheDir, 'rev-catalog.json');
    if (fs.existsSync(file)) {
      const items = JSON.parse(await fsp.readFile(file, 'utf8'));
      for (const item of items) {
        const normalized = normalizeProduct(item, 'rev');
        if (!normalized) continue;
        catalog.set(normalized.sku, normalized);
      }
    }
    await loadOverrides();
    return Array.from(catalog.values()).map((item) => applyOverride(item, 'rev'));
  }

  function parseSearchOptions(limitOrOptions, supplierArg) {
    let limit = 20;
    let supplier = supplierArg || 'rev';
    if (typeof limitOrOptions === 'number') {
      limit = limitOrOptions;
    } else if (typeof limitOrOptions === 'object' && limitOrOptions !== null) {
      limit = Number(limitOrOptions.limit ?? 20);
      supplier = String(limitOrOptions.supplier || 'rev');
    } else if (limitOrOptions !== undefined) {
      limit = Number(limitOrOptions);
    }
    return {
      supplier: normalizeSupplier(supplier),
      limit: Math.max(1, Number(limit) || 20),
    };
  }

  function scoreCatalogProduct(product, query) {
    return scoreText(
      [
        product.sku,
        product.name,
        product.category,
        product.notes,
        product.compatibleSkus?.join(' '),
        product.requiredAccessories?.join(' '),
      ]
        .filter(Boolean)
        .join(' '),
      query,
    );
  }

  function getCatalogStore(supplier = 'rev') {
    return getSupplierContext(supplier).products;
  }

  function setCatalogProduct(supplier, product) {
    const context = getSupplierContext(supplier);
    const normalized = normalizeProduct(product, context.supplier);
    if (!normalized) return null;
    context.products.set(normalized.sku, normalized);
    if (context.supplier === 'rev') catalog.set(normalized.sku, normalized);
    return normalized;
  }

  async function setCatalogOverride(sku, { supplier = 'rev', price, stock, notes } = {}) {
    const normalizedSupplier = normalizeSupplier(supplier);
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) throw new Error('SKU is required');
    const hasAnyValue = [price, stock, notes].some((value) => value !== undefined);
    if (!hasAnyValue) throw new Error('At least one of price, stock, or notes is required');
    const key = overrideKey(normalizedSupplier, normalizedSku);
    const existing = overrides.get(key) || { supplier: normalizedSupplier, sku: normalizedSku };
    const next = { ...existing, updatedAt: nowIso() };
    if (price !== undefined) {
      const numeric = Number(price);
      if (!Number.isFinite(numeric)) throw new Error('Override price must be numeric');
      next.price = numeric;
    }
    if (stock !== undefined) next.stock = stock;
    if (notes !== undefined) next.notes = String(notes);
    overrides.set(key, next);
    await persistOverrides();
    return applyOverride(getCatalogProduct(normalizedSku, normalizedSupplier), normalizedSupplier);
  }

  async function deleteCatalogOverride(sku, { supplier = 'rev' } = {}) {
    const normalizedSupplier = normalizeSupplier(supplier);
    const normalizedSku = normalizeSku(sku);
    if (!normalizedSku) throw new Error('SKU is required');
    const removed = overrides.delete(overrideKey(normalizedSupplier, normalizedSku));
    await persistOverrides();
    return removed;
  }

  function supportedSuppliers() {
    return [...SUPPLIERS];
  }

  function searchCatalog(query, limitOrOptions = 20, supplierArg = 'rev') {
    const { limit, supplier } = parseSearchOptions(limitOrOptions, supplierArg);
    const products = Array.from(getCatalogStore(supplier).values());
    const scored = products
      .map((product) => ({
        product: applyOverride(product, supplier),
        score: scoreCatalogProduct(product, query),
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

  function getCatalogProduct(sku, supplier = 'rev') {
    const normalizedSupplier = normalizeSupplier(supplier);
    const raw = getCatalogStore(normalizedSupplier).get(normalizeSku(sku));
    return applyOverride(raw, normalizedSupplier);
  }

  return {
    supportedSuppliers,
    syncCatalog,
    syncRevCatalog,
    loadCachedCatalog,
    searchCatalog,
    findCatalogPart,
    getCatalogProduct,
    setCatalogProduct,
    setCatalogOverride,
    deleteCatalogOverride,
  };
}
