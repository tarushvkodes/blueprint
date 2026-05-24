# Blueprint Repo Write-Up

## Snapshot

Repository: `tarushvkodes/blueprint`

Local checkout: `C:\Users\Lalith\Documents\Codex\2026-05-23\tarushvkodes-blueprint-https-github-com-tarushvkodes`

Blueprint is an AI engineering workspace for FIRST Tech Challenge teams. The intended product turns a team profile, game manual, inventory, budget, strategy preferences, and supplier constraints into a complete robot planning packet: strategy, robot concepts, rules checklist, REV-first BOM, physics calculations, conceptual CAD, FTC SDK Java starter code, build guide, chatbot iteration, grants, and driver-control optimization.

## Product Context

The real product brief is in `context.md`; `README.md` is still the default Vite template. The context positions Blueprint as a serious student engineering tool, not an "AI builds your robot" chatbot. Its core requirements are citation-backed rules work, visible assumptions and math, conservative beginner-friendly recommendations, editable artifacts, and mentor/student review gates.

Primary users are new or underserved FTC teams, coaches, mentors, and student leads. The MVP is expected to be useful enough for a team to start planning and building, even if many systems are deterministic templates at first.

## Current Implementation

The frontend is a Vite + React + TypeScript app. It has a landing page, a workspace view, tabs for dashboard/overview/strategy/design/BOM/physics/CAD/code/build/chat, a Three.js robot preview, GSAP landing animations, Lucide icons, and plain CSS styling.

The backend is a Node/Express server with a slim `server/index.js` bootstrap, route wiring in `server/routes.js`, and focused modules for documents, REV catalog, project generation, code, CAD, persistence, and validation.

Optional AI support is wired through `GOOGLE_AI_STUDIO_API_KEY` for the Gemini API. Without an AI Studio key, the app deliberately runs in `local-fallback` mode.

## Important Files

- `context.md`: living product spec, status, risks, milestones, acceptance criteria.
- `src/App.tsx`: switches between landing page and workspace.
- `src/LandingPage.tsx`: marketing/product overview with interactive sections.
- `src/Workspace.tsx`: main working interface for intake, artifacts, and tabs.
- `src/hooks/useBlueprintProject.ts`: frontend project state and API actions.
- `src/api.ts`: client API adapter and response normalization.
- `src/projectData.ts`: fallback/demo data and UI content.
- `src/RobotPreview.tsx`: React Three Fiber concept robot.
- `server/index.js`: Runtime bootstrap and server start.
- `server/routes.js`: Express route registration split out from the generator logic.
- `server/documents.js`: PDF ingestion, keyword chunks, season extraction, and rules lookup.
- `server/catalog.js`: REV catalog adapter, cache, and search.
- `server/generators/project.js`: Concepts, strategy, BOM, physics, build guides, prompts, and project responses.
- `server/generators/code.js`: FTC SDK Java starter generator.
- `server/generators/cad.js`: Concept CAD layout/export helpers.
- `.env.example`: Google AI Studio model settings and API port settings.

## Verification

Commands run:

- `npm.cmd install`: passed, 0 vulnerabilities reported.
- `npm.cmd run build`: passed.
- `npm.cmd run lint`: passed.
- API smoke test against `GET /api/health`: passed with `{"ok":true,"service":"blueprint-api","catalogItems":4,"documents":0,"chunks":0}`.
- API integration tests cover health, project lifecycle, artifacts, catalog fallback, and chat fallback.

Build warning: the production JS chunk is over 500 kB, mostly because the app bundles Three/React pieces together. This is not a correctness failure, but code splitting would be a later polish item.

## Current Gaps

- README is boilerplate and should be replaced with Blueprint-specific setup, architecture, and usage docs.
- No persistent database, authentication, file storage service, or background jobs.
- Rules/RAG is keyword-based and prototype-grade; page preservation, section parsing, official URL ingestion, version detection, semantic search, and conflict detection remain open.
- The REV catalog parser works from seed/search pages but is not a full supplier system.
- Many generated artifacts are deterministic templates rather than reviewed agent outputs.
- CAD export endpoints now use explicit concept artifact names; a real CAD pipeline is still future work.
- Generated FTC Java now has a CI compile smoke test against FTC compatibility stubs; full FTC SDK/Gradle validation is still future work.
- Driver logs, sponsor CRM, and inventory workflows have backend starts but limited UI.
- Frontend API base is configurable with `VITE_API_BASE`; local development defaults to `http://localhost:8787/api`.

## Suggested Next Moves

1. Replace the Vite README with a real Blueprint README.
2. Upgrade manual ingestion before expanding legality features.
3. Add a provider-neutral model adapter with structured outputs and Review Agent gates.
4. Replace local JSON snapshots with a real project/artifact database.
5. Add full FTC SDK/Gradle compile validation.
6. Implement the CadQuery/STEP pipeline.
