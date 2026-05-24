# Refactor Plan

## Current Architecture Map

- Frontend: React/Vite app with a landing experience and a project workspace. `src/App.tsx` owns view switching, `src/hooks/useBlueprintProject.ts` owns remote state/actions, `src/api.ts` normalizes API responses, and `src/Workspace.tsx` renders most product workflows.
- Backend: Express API bootstrapped by `server/index.js`; `server/routes.js` wires route handlers; generator modules create strategy, concepts, BOM, mechanism math, CAD, Java, build guides, reviews, and AI prompts.
- State/persistence: in-memory Maps in `server/state.js`, JSON snapshots in `.cache`, uploaded documents under `uploads`, and deterministic local fallbacks when Vertex AI is unavailable.
- Tests: Node test suite covers API integration and generator behavior. Frontend build/typecheck is covered by `npm run build`; there are no UI interaction tests yet.

## Baseline Quality Gates

- 2026-05-24: `npm run lint` passes.
- 2026-05-24: `npm run test` passes, 32 tests.
- 2026-05-24 baseline: `npm run build` passed with a large client chunk warning: `dist/assets/index-*.js` was about 1.54 MB minified.
- 2026-05-24 after first frontend pass: `npm run build` passes with no chunk warning. Main app is about 215 KB, landing about 130 KB, workspace about 39 KB, and robot preview about 2.6 KB minified.
- 2026-05-24: `npm run verify:java` could not run because this machine does not have a Java Runtime installed.

## Priority Workstream

1. Reduce duplicated backend mutation flows around selected design rebuilds, review refreshes, timestamps, and persistence.
2. Split `Workspace.tsx` into cohesive view/components and move data-preparation helpers out of the render body.
3. Improve async state modeling in `useBlueprintProject` so actions expose loading/error intent instead of a single status string.
4. Code-split expensive workspace/visual modules to address the Vite chunk warning.
5. Add focused UI interaction tests for onboarding, tab navigation, upload empty states, and BOM overrides.
6. Tighten accessibility: focus visibility, form helper/error text, status live region, table semantics, and upload controls.
7. Continue refining CSS tokens and shared component primitives so layout rhythm, controls, and empty/error states stay consistent.

## First Refactor Pass

- Completed: added living architecture/technical debt/UI audit docs.
- Completed: extracted frontend workspace derivation and parsing helpers into `src/workspaceUtils.ts`.
- Completed: consolidated backend route-local project lifecycle helpers where route handlers repeat lookup/review/timestamp/persist logic.
- Completed: route-level code splitting for landing/workspace and lazy loading for the robot preview.
- Completed: replaced heavyweight shader/Three.js decorative effects with CSS/SVG-native visuals and removed unused runtime dependencies.
- Completed: added a polite live region for workspace command status.
- Verified: lint, tests, and build pass after the first pass.
