<!-- orchestrate handoff
task: rev-catalog-and-supply
branch: orch/blueprint/rev-catalog-and-supply
agentId: bc-d70b254e-9e7f-4873-95f0-902bec00d31b
runId: run-8a56897c-7882-4bc8-a49d-1158e9e3e1d3
resultStatus: finished
finishedAt: 2026-05-23T19:10:33.335Z
-->

## Status
success

## Branch
`orch/blueprint/rev-catalog-and-supply`

## What I did
- Reworked `server/modules/catalog.js` to support supplier-aware catalogs (`rev`, `gobilda`, `andymark`), while preserving existing catalog API usage in the rest of the server.
- Added supplier adapter interface and implementations under `server/modules/suppliers/**`:
  - `adapter.js`: `SupplierAdapter` interface + adapter contract checks.
  - `rev.js`: full REV implementation with:
    - paginated BigCommerce search crawler (`search.php?search_query=...&page=N`)
    - polite crawling (max 1 request/sec)
    - clean crawl abort on 4xx/5xx search-page responses
    - SKU dedupe across discovered results
    - parsing via existing BCData + JSON-LD path
    - metadata extraction (`weight`, `dimensions`, `voltageRange`, `stallCurrent`, `freeRpm`, `encoderTicks`)
    - normalized category taxonomy mapping
    - compatibility/accessory enrichment.
  - `gobilda.js` and `andymark.js`: interface-conformant stubs that throw `NotImplementedError`.
  - `rev-compatibility.json`: seeded compatibility + required accessory mappings for common REV drivetrain SKUs.
- Added override persistence in `catalog.js` using `.cache/rev-overrides.json` and applied overrides at read/search time:
  - supports `price`, `stock`, `notes` override values.
- Updated `server/routes/catalog.js`:
  - `/api/catalog/search` accepts `?supplier=` (default `rev`)
  - `/api/catalog/products/:sku` accepts `?supplier=` and returns supplier-aware product payload
  - new:
    - `POST /api/catalog/products/:sku/override`
    - `DELETE /api/catalog/products/:sku/override`
- Added focused fixture-based test coverage:
  - `server/__tests__/catalog.test.mjs`
  - `server/__tests__/fixtures/rev-search-page.html`
  - `server/__tests__/fixtures/rev-product.html`
  - validates normalization, metadata extraction, SKU dedupe behavior, and override precedence.
- Updated `package.json` scripts:
  - added `test:catalog`
  - wired `test:catalog` into `test:smoke`.

## Measurements
- `server/modules/suppliers/* adapter files: 0 → 4`
- `REV compatibility mapping entries: 0 → 4`
- `server/__tests__/catalog* test files: 0 → 1`
- `npm run test:catalog: 0 passing → 1 passing`
- `npm run lint (exit code): 0 == 0`
- `npm run build (exit code): 0 == 0`
- `duplicate SKU fetches in fixture-backed discovery path: 2 candidates → 1 parsed product`

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- I installed repo dependencies with `npm install` in this cloud environment to run verification (`eslint`, `tsc`, `cheerio` were unavailable before install).
- `gobilda` and `andymark` adapters are intentionally interface-complete stubs that raise `NotImplementedError` for all supplier operations.
- `GET /api/catalog/search` now returns the product array directly (supplier-aware filtering supported), instead of the previous `{ query, products }` wrapper.
- REV override persistence is centralized at `.cache/rev-overrides.json` and keyed by `supplier:sku`; REV is the actively implemented supplier path.

## Suggested follow-ups
- Add route-level tests for `POST/DELETE /api/catalog/products/:sku/override` and `?supplier=` validation/error responses.
- Add integration tests for paginated REV discovery against captured multi-page fixtures (including 4xx abort behavior).
- Fill out goBILDA and AndyMark adapters to complete multi-supplier parity.
- Environment setup recommendation: run a Cursor env setup agent from https://cursor.com/onboard so future agents start with dependencies preinstalled. Suggested prompt:  
  `Set up this repository's cloud agent environment to run npm install automatically (or bake deps into base image) so npm run lint, npm run build, npm run test:catalog, and npm run test:smoke work out of the box.`