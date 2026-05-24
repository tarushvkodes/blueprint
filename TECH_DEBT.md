# Technical Debt

## Hotspots

- `src/Workspace.tsx`: broad component that mixes project derivation, form parsing, file parsing, navigation, and every workspace tab. This makes UI behavior hard to test and increases regression risk.
- `src/App.css`: large global stylesheet serving both landing and app workspace. There are useful design rules inside it, but component ownership and state styles are hard to reason about.
- `server/routes.js`: route handlers repeat project lookup, timestamp, review refresh, artifact rebuild, and persistence patterns. This is a correctness risk because future routes can forget one step.
- `server/generators/project.js`: large domain module with many responsibilities: AI prompt construction, local strategy/concept/BOM/build generation, review, persistence adapter, and response shaping.
- `src/hooks/useBlueprintProject.ts`: single status string hides concurrent loading/error states and makes UX messaging ambiguous when multiple actions run.

## Architecture Risks

- Frontend/backend contracts are normalized in `src/api.ts`, but server response shapes still vary by endpoint. This increases fallback complexity.
- In-memory state plus local snapshots is fine for MVP use, but lacks project versioning, conflict handling, and background job state.
- AI-required endpoints return hard failures when Vertex is not verified; the UI communicates this mostly through generic status text.
- Large client chunk suggests the landing page loads workspace, Three.js, shader, and app logic together.
- Resolved in first pass: route-level lazy loading and lightweight CSS/SVG visuals removed the build chunk warning and allowed removal of the shader/Three.js runtime dependencies.

## Test Gaps

- No automated browser/accessibility tests for the workspace.
- No focused tests for frontend response normalization edge cases.
- No tests around project lifecycle helpers once route mutation logic is extracted.
- No visual regression coverage for responsive layouts.

## Cleanup Candidates

- Move workspace constants and parsing helpers out of render files.
- Create route helper utilities for `getProject`, `touchProject`, `refreshReview`, and selected-design rebuilds.
- Split workspace tabs into separate components loaded through a common shell.
- Introduce a small design token layer for colors, spacing, surfaces, focus rings, and form controls.

## Completed Cleanup

- `src/workspaceUtils.ts` now owns workspace constants, code/CAD/build derivation, and inventory text parsing.
- `server/routes.js` now has shared helpers for project lookup, persistence, team updates, selected-design artifact rebuilds, and document attachment.
- Removed unused heavyweight visual dependencies: shader packages and Three.js stack.
