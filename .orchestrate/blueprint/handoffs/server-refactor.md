<!-- orchestrate handoff
task: server-refactor
branch: orch/blueprint/server-refactor
agentId: bc-622d87ae-6de3-4c69-b919-a26f1b8a0181
runId: run-52c9c8dd-a9fc-4b3c-9f39-863b6039134a
resultStatus: finished
finishedAt: 2026-05-23T19:03:32.175Z
-->

## Status
success

## Branch
`orch/blueprint/server-refactor`

## What I did
- Refactored `server/index.js` from a monolith into a thin bootstrap (env loading, dependency wiring, route registration, listen, and global error middleware).
- Added domain modules under `server/modules/`:
  - `ai.js`, `rules.js`, `catalog.js`, `generators.js`, `code.js`, `cad.js`, `build.js`, `physics.js`, `chat.js`, `drivers.js`, `grants.js`, `persistence.js`
  - plus `documents.js` and `utils.js` for shared ingestion/indexing and helpers.
- Implemented JSON-on-disk project persistence in `server/modules/persistence.js` at `.cache/projects/<id>.json` with async API:
  - `saveProject`, `loadProject`, `listProjects`, `updateProject`.
- Wired project lifecycle to persistence so create/update/generate/intake edits are saved and restored after restart.
- Added route registrars under `server/routes/` (one per resource group/prefix):
  - `health.js`, `ai.js`, `projects.js`, `documents.js`, `catalog.js`, `code.js`, `cad.js`, `build.js`, `physics.js`, `chat.js`, `drivers.js`, `grants.js`.
- Preserved existing endpoint paths and payload behavior, including `/api/project/demo` support and existing response shapes.
- Added `server/README.md` documenting module and route ownership.
- Added smoke test harness `server/smoke-test.js` and npm script `test:smoke` in `package.json`.

## Measurements
- `LOC(server/index.js): 1645 → 187`
- `server/modules/*.js files: 0 → 14`
- `server/routes/*.js files: 0 → 12`
- `npm run lint (exit code): 0 == 0`
- `npm run build (exit code): 0 == 0`
- `npm run test:smoke endpoint checks: 3 == 3`
- `manual persistence restart check (POST/GET project status): 200 == 200`

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- The persisted store now becomes the source of truth for non-demo projects; on boot, projects are hydrated from `.cache/projects`.
- Demo project behavior is preserved via `/api/project/demo`; it is generated at startup and intentionally not persisted as a regular user project.
- No UI bug was in scope, so no screen recording artifact was produced.

## Suggested follow-ups
- Add focused tests for mutating project endpoints (`PATCH`, `intake`, `generate-*`) to lock request/response shape compatibility.
- Add contract snapshots for key responses (`/api/project/demo`, `/api/projects/:id/export.json`) to prevent accidental schema drift in future slices.