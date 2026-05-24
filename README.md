# Blueprint

Blueprint is an AI-assisted engineering workspace for FIRST Tech Challenge teams. It helps a team turn kickoff inputs into an inspectable robot planning packet: strategy, concepts, legal checklist, REV-first BOM, budget, mechanism math, conceptual CAD, FTC SDK starter code, build steps, sponsor materials, and driver-control suggestions.

The current repo is an MVP prototype. It is designed to run locally, use deterministic fallbacks when hosted AI is not configured, and keep legality-sensitive output citation-aware.

## What Works Today

- React/TypeScript workspace with landing page and project tabs.
- Express API for project generation, manual upload, REV catalog sync, BOMs, physics, CAD specs, FTC Java code, build guide, chat, grants, and driver logs.
- Local fallback generators for concepts, strategy, BOM, physics, CAD layout, code, and build steps.
- Optional Vertex AI JSON calls through either an Express Mode API key or Application Default Credentials.
- REV Robotics public product page adapter with local cache.
- PDF upload and basic keyword chunk search for rule citations.
- Code ZIP export for generated FTC SDK Java starter files.

## Quick Start

Install dependencies:

```bash
npm install
```

Run the API and web app together:

```bash
npm run dev
```

Local URLs:

- Web app: `http://localhost:5173/`
- API: `http://localhost:8787/`
- Health check: `http://localhost:8787/api/health`

Build and lint:

```bash
npm run build
npm run lint
npm run test
npm run verify:java
```

On Windows PowerShell, if script execution blocks `npm`, use `npm.cmd`:

```bash
npm.cmd install
npm.cmd run dev
```

## Environment

Copy `.env.example` to `.env` when you want to configure the API.

```bash
# Option A: Vertex AI Express Mode with API key.
VERTEX_AI_API_KEY=

# Option B: Standard Vertex AI with Application Default Credentials.
# Use this when your Google Cloud organization blocks API keys.
VERTEX_AI_PROJECT=
VERTEX_AI_LOCATION=us-central1

VERTEX_TEXT_MODEL=gemini-2.5-flash
VERTEX_IMAGE_MODEL=gemini-2.5-flash-image
API_PORT=8787
```

Without either `VERTEX_AI_API_KEY` or `VERTEX_AI_PROJECT`, Blueprint runs in `local-fallback` mode. For the ADC path, run `gcloud auth application-default login`, make sure the project has Vertex/Agent Platform APIs enabled, then set `VERTEX_AI_PROJECT` to the Google Cloud project ID.

## Repo Structure

```text
src/
  App.tsx                     App shell and landing/workspace switch
  LandingPage.tsx             Product overview page
  Workspace.tsx               Project workspace UI
  RobotPreview.tsx            React Three Fiber concept preview
  api.ts                      Frontend API client and normalization
  hooks/useBlueprintProject.ts Project state and actions
  projectData.ts              Demo/fallback content
  types.ts                    Frontend types

server/
  index.js                    Runtime bootstrap and server start
  routes.js                   Express route registration
  documents.js                PDF ingestion, chunks, rules lookup
  catalog.js                  REV catalog sync, cache, search
  config.js                   Paths, env loading, runtime config
  state.js                    Shared in-memory state
  utils.js                    Small shared helpers
  persistence.js              Local project snapshot persistence
  javaValidation.js           Generated Java static validation
  generators/
    project.js                Team defaults, concepts, BOM, physics, prompts, responses
    code.js                   FTC SDK Java starter generator
    cad.js                    Concept CAD layout and export helpers

context.md                    Product brief, implementation status, risks, milestones
BLUEPRINT_REPO_WRITEUP.md      Repo orientation notes
```

## API Highlights

- `GET /api/health`
- `GET /api/ai/status`
- `GET /api/project/demo`
- `POST /api/projects`
- `GET /api/projects`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/intake`
- `POST /api/projects/:id/generate-blueprint`
- `POST /api/projects/:id/documents/upload`
- `GET /api/projects/:id/rules/search`
- `POST /api/catalog/sync`
- `GET /api/catalog/search`
- `GET /api/projects/:id/cad`
- `GET /api/projects/:id/cad/export.concept.json`
- `GET /api/projects/:id/cad/export.concept.step`
- `GET /api/projects/:id/code`
- `GET /api/projects/:id/code/validate`
- `GET /api/projects/:id/code/export.zip`
- `GET /api/projects/:id/build-guide/export.html`
- `POST /api/projects/:id/driver-logs/analyze`
- `POST /api/teams/:id/sponsor-email`
- `POST /api/teams/:id/grant-draft`

## Current Limitations

- Project persistence is local JSON under `.cache`, not a production database.
- Rules/RAG is keyword-based and does not preserve PDF page numbers yet.
- REV catalog sync depends on public storefront pages and can break if markup changes.
- CAD output is explicitly conceptual. The current exports are layout/spec artifacts, not manufacturing-ready CAD.
- Generated Java receives static validation, but it is not compiled inside a full FTC SDK project yet.
- CI compiles generated Java against a small FTC compatibility fixture; full FTC SDK/Gradle validation is still future work.
- Authentication, team accounts, background jobs, and cloud file storage are not implemented.

## Product Direction

The next major upgrades should be:

1. Stronger manual ingestion with page/rule preservation and official source URLs.
2. Real persistence with project/artifact versions.
3. Provider-neutral model adapter with structured outputs and Review Agent gates.
4. FTC SDK compile fixture for generated Java.
5. Parametric CAD pipeline through CadQuery/OpenCascade or an equivalent exporter.
6. Inventory, driver-log, and sponsor workflows that are fully editable in the UI.

See `context.md` for the full product spec and milestone checklist.
