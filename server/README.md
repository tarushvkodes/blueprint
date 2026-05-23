# Server layout

`server/index.js` owns only boot wiring: env load, dependencies, route registration, and `app.listen`.

## Modules (`server/modules`)

- `ai.js`: AI status + Vertex JSON adapter.
- `rules.js`: rule citation search over indexed chunks.
- `catalog.js`: REV catalog discovery/sync/cache/search.
- `generators.js`: project/team normalization, strategy/design/BOM generation, prompt packet assembly, project response shaping, and project lifecycle.
- `code.js`: FTC Java artifact generation.
- `cad.js`: conceptual CAD generation and CAD export shaping.
- `build.js`: build guide generation and HTML export rendering.
- `physics.js`: mechanism calculations.
- `chat.js`: fallback chat answer generation.
- `drivers.js`: driver log analysis.
- `grants.js`: sponsor email and grant draft payloads.
- `persistence.js`: JSON-on-disk project store at `.cache/projects/<id>.json`.
- `documents.js`: document ingestion/index chunking for rules context.
- `utils.js`: shared utility helpers.

## Routes (`server/routes`)

- `health.js`: `/api/health`
- `ai.js`: `/api/ai/status`
- `projects.js`: `/api/project/demo`, `/api/projects`, and project-level planning/export/prompt endpoints.
- `documents.js`: `/api/projects/:id/documents/*` and `/api/projects/:id/rules/search`
- `catalog.js`: `/api/catalog/*`
- `code.js`: `/api/projects/:id/code*`
- `cad.js`: `/api/projects/:id/cad*`
- `build.js`: `/api/projects/:id/build-guide*`
- `physics.js`: `/api/projects/:id/calculate/mechanism`, `/api/projects/:id/calculations`
- `chat.js`: `/api/projects/:id/chat`
- `drivers.js`: `/api/projects/:id/driver-logs/analyze`
- `grants.js`: `/api/teams/:id/*`
