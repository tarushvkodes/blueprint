<!-- orchestrate handoff
task: frontend-editable-workspace
branch: orch/blueprint/frontend-editable-workspace
agentId: bc-d1f60c59-ec35-4812-8909-7c384c66bb78
runId: run-fdbf4a37-478c-4ed6-8927-6841c798791d
resultStatus: finished
finishedAt: 2026-05-23T19:25:02.501Z
-->

Now compose the handoff:

## Status
success

## Branch
`orch/blueprint/frontend-editable-workspace`

## What I did
- Added `src/Wizard.tsx`: a six-step Project Wizard (identity, team capacity, workspace + tools, inventory + budget, timeline + priorities + strategy mode, review) covering every onboarding field in `context.md`. Validates per step; on submit calls `POST /api/projects` through the hook and lands the user in the workspace.
- Rebuilt `src/App.tsx` as a three-view shell (`landing` / `wizard` / `workspace`) with localStorage-backed active project id so reloads re-open the persisted project. New users (no stored id) are routed to the wizard; returning users go straight to the workspace.
- Updated `src/LandingPage.tsx`: hero CTAs, nav action, and footer CTA now adapt label ("Start a project" vs "Open workspace") and route to the wizard or workspace based on `isNewUser`.
- Rebuilt `src/Workspace.tsx`:
  - Editable Dashboard for every onboarding field (location, students, mentors, timeline, supplier, build space, CAD/programming experience, strategy mode, tools, inventory, priorities, project notes) saving through `/api/projects/:id/intake` with optimistic `Saving…` → `Saved` feedback.
  - Editable BOM rows (qty, price, manual price override, already-owned, notes) persisted via the new `/api/projects/:id/bom/update` endpoint, with a per-row Save indicator that disables when row matches server state.
  - Substitutions section: guided form + per-row prompt swap; persists `{ sku, originalPart, replacement, note, createdAt }` on `project.bom.substitutions`.
  - Upload UI with progress + error states for season PDF, team inventory (CSV/JSON parsed client-side, PDFs routed to `documents/upload` with `type=inventory`), and driver-log CSV/JSON routed to `/driver-logs/analyze`.
  - Chat tab: rules-question detector triggers a refusal banner when `project.season.isSample === true`; otherwise asks Blueprint and renders citations. Apply suggestion calls a new `/api/projects/:id/notes` endpoint; Copy answer uses the clipboard API; both surface confirmation.
- Rebuilt `src/hooks/useBlueprintProject.ts` to add `createProject`, `updateBom`, `addSubstitution`, `removeSubstitution`, `appendNotes`, `uploadInventoryFile`, `uploadDriverLogs`, `resetProject`, and project-id persistence.
- Extended `src/api.ts` with `createProject`, `fetchProjectById`, `updateBomEntries`, `addBomSubstitution`, `removeBomSubstitution`, `appendProjectNotes`, `uploadInventoryPdf`, `analyzeDriverLogs`, and an enriched `askBlueprintQuestion` returning answer + citations + suggestedActions.
- Extended `src/types.ts` with `Substitution`, `Team.notes`, and `BomItem.{priceOverride, owned, note}`. `src/projectData.ts` only changed to add an empty `substitutions: []` to `fallbackProject`.
- Server: added new endpoints in `server/routes/projects.js` only — `POST /api/projects/:id/bom/update` (qty/price/override/owned/note + add/remove substitution + subtotal recompute) and `POST /api/projects/:id/notes` (append or replace `team.notes`). Added a local `enrichResponse(project)` helper that round-trips BOM extras, project notes, and substitutions over the existing `projects.projectForResponse`. The intake + patch + generate-blueprint + select-design + demo + create-project handlers now use `enrichResponse` and preserve `team.notes` across `defaultTeam` sanitization.
- New CSS for wizard, BOM editor rows, substitution UI, upload progress states, chat refusal banner, chat citations + apply controls, notes summary, and workspace banner. Liquid Glass / Shader language preserved (all panels reuse `.liquid-glass`, existing color palette, and the `ShaderBackdrop` workspace variant).

## Measurements
- `LOC(src/Workspace.tsx): 411 → 728`
- `LOC(src/App.tsx): 79 → 137`
- `LOC(src/hooks/useBlueprintProject.ts): 129 → 425`
- `LOC(src/api.ts): 203 → 339`
- `LOC(server/routes/projects.js): 182 → 351`
- `LOC(src/Wizard.tsx): 0 → 481`
- `LOC(src/App.css): 1813 → 2723`
- `npm run lint exit code: 0 == 0`
- `npm run build exit code: 0 == 0`
- `npm run test:smoke exit code: 0 == 0`
- `Project endpoints exercised end-to-end (create / bom/update / addSubstitution / notes / reload-by-id): 200 == 200`

## Verification
unit-test-verified

Backend changes were exercised via `curl` against the running API for create → BOM row edit (qty + override + owned + note) → addSubstitution → notes append → reload by id, confirming each field round-trips and survives an intake re-sanitization. `npm run test:smoke` continues to pass on top of the new route. Frontend was verified via `tsc -b && vite build` and `eslint .` only (no live browser run); the React state changes pass the React 19 `react-hooks/set-state-in-effect` rule via render-time syncing rather than effects.

## Notes, concerns, deviations, findings, thoughts, feedback
- `server/routes/documents.js` is off-limits, and its `/documents/upload` route hard-rejects non-PDF bodies. To satisfy the inventory upload requirement without touching it, the client parses CSV/JSON inventory files locally and merges parts into `team.inventory` via the intake endpoint; PDF inventories still go through `documents/upload` with `type=inventory`. The task wording ("route inventory through `/documents/upload` with `type=inventory`") is therefore only partially honored for the PDF path. A future server slice that allows CSV/JSON ingestion in `documents.js` would close the gap.
- `defaultTeam` (in `server/modules/generators.js`, off-limits) strips unknown fields, so `team.notes` would be wiped by an intake save. Worked around by preserving `notes` inside the routes I do own (`projects.js`) and re-injecting via `enrichResponse`. This means notes added through other route handlers (e.g. `documents/upload`) would still be returned untouched only if `team.notes` is already preserved in the persisted project — and it is, because persistence serializes the whole project including `notes`.
- BOM updates persist via the new endpoint, but `enrichResponse` is only applied to responses in `routes/projects.js`. Other route handlers that go through `projectForResponse` (e.g. `documents/upload`) will not echo `priceOverride`/`owned`/`note`/`substitutions` in their response payload. Persistence is intact (the fields are stored on the project object); the client merges previous-state fields into responses, so this is transparent in practice unless the user uploads a manual before any BOM edits.
- React 19's new `react-hooks/set-state-in-effect` rule blocked the obvious `useEffect(() => setTeamDraft(project.team), [project.team])` sync pattern. Replaced with render-time `if (trackedTeam !== project.team) { setTrackedTeam(project.team); setTeamDraft(project.team) }`, which is the React-recommended pattern but still reads slightly unusual.
- The chat refusal banner is purely client-side (regex over the user's message + `isSample` flag); the server still produces a generic answer. A future slice could move refusal enforcement to the chat route so non-UI clients are also covered.
- No screen recording was captured — the deliverable is multi-screen UI scaffolding rather than a discrete bug fix, and there is no live preview environment available to this agent.

## Suggested follow-ups
- Extend `documents/upload` (or add a sibling route) to accept inventory CSV/JSON so the upload path is server-authoritative instead of being parsed client-side.
- Move chat refusal into `server/routes/chat.js` (and/or `modules/chat.js`) so all clients benefit from it.
- Add Playwright coverage for: wizard → workspace handoff, BOM edit persistence after reload, refusal banner appearing when `isSample === true`, and Apply-suggestion writing to `team.notes`.
- Surface `priceOverride`/`owned`/`note`/`substitutions` on `projectForResponse` itself so non-`projects.js` routes can echo them without a route-local enrichResponse helper.
- Add `bundle size` budgets / dynamic imports — the production bundle is now ~1.5 MB (the wizard, BOM editor, and chat sections share the same chunk as the landing page).