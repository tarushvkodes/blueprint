# UI Audit

## Strengths

- The product has a clear identity: FTC robotics, REV-first planning, citation-aware legality, and build-ready artifacts.
- The landing page uses concrete robotics imagery rather than generic SaaS visuals.
- Workspace tabs expose the full product surface and keep the main workflows discoverable.
- Important technical caveats, especially CAD concept disclaimers and rule citations, are visible in the UI.

## Issues Found

- The workspace header status text is not announced as a live region, so async feedback can be missed by screen readers.
- Resolved in first pass: workspace command status now uses `role="status"` with `aria-live="polite"`.
- Several dense sections are visually card-like without consistent hierarchy, making scan paths uneven on smaller screens.
- `Workspace.tsx` duplicates button and panel patterns rather than using shared components, which causes interaction and spacing drift.
- Upload controls are visually clear but need stronger helper/error states and keyboard-focused treatment.
- BOM rows are rendered as generic divs; they behave like editable table rows and would benefit from more semantic structure.
- Empty states exist as text fallbacks, but many tabs could better show what action populates them.
- Code, CAD, and autonomous preformatted panels can dominate mobile layouts and need stricter overflow/focus handling.
- Resolved in first pass: decorative shader/3D effects were replaced with CSS/SVG-native visuals, reducing runtime cost while preserving robotics identity.

## Product Polish Priorities

1. Add shared status, empty state, field, panel title, and artifact button primitives.
2. Make async statuses explicit with loading/error/success states per action.
3. Improve dashboard setup flow with inline field helper text and persistent generation readiness.
4. Refine workspace tabs on mobile into a compact segmented/select hybrid with better focus styling.
5. Add semantic table/list structures for BOM, build steps, and review blockers.
6. Verify desktop and mobile screenshots after component splitting.
