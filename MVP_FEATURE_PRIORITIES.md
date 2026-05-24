# Blueprint MVP Feature Priorities

This document ranks the main Blueprint components in the order we should build them. The goal is to move from a working prototype toward the writeup-grade MVP without hardcoded outputs or disconnected artifacts.

## Guiding Principle

The most important architecture decision is the shared mechanism model:

Team inputs + manual + selected concept -> mechanism model -> BOM, physics, CAD, code, and build guide.

If those downstream artifacts do not come from the same structured robot definition, the app will feel fake even if each page looks polished.

## Priority Bands

- P0: Required for the MVP to feel real.
- P1: Required for the MVP to be useful end to end.
- P2: Important quality and differentiation.
- P3: Production, scale, or polish work.

## Ranked Build Order

### 1. Shared Mechanism Model

Priority: P0

Why it matters:
This is the spine of the product. Every robot concept needs a structured description of drivetrain, intake, lift/arm/manipulator, sensors, code assumptions, CAD placement, parts, and build steps.

Current state:
First implementation pass is complete. Concepts now carry `mechanismSpecs` with stable IDs, hardware, physics inputs, CAD placement, code hardware names, and validation flags. BOM, physics, CAD, code README, and build-guide steps now reference those same mechanism IDs.

Remaining hardening:
- Make mechanism templates more season-specific as better manual extraction lands.
- Add a pure unit test suite around unusual concept packets and repair cases.
- Replace the conceptual CAD layout with richer geometry generated from the same specs.

What we need:
- `MechanismSpec` data model.
- Drivetrain spec: type, motors, wheels, gear ratio, dimensions, constraints.
- Intake/outtake spec: type, motors/servos, game piece assumptions.
- Lift/arm/slide/manipulator spec: load, travel, gear ratio, actuation, safety assumptions.
- Sensor/vision spec: camera, distance/color sensors, odometry, optional AprilTag support.
- Control/autonomous assumptions.
- Risk flags per mechanism.
- Mechanism IDs stable across BOM, physics, CAD, code, and build guide.

Done when:
- Selecting a concept produces a structured mechanism packet.
- BOM, physics, CAD, code, and build guide all read from that packet.
- No downstream artifact guesses from concept names or keyword matching.

Tests:
- Unit test validates mechanism schema for all generated concepts.
- Integration test confirms selected mechanism IDs appear in BOM, physics, CAD, code, and build guide.

### 2. Robot Concept Generator Quality Gate

Priority: P0

Why it matters:
The app must generate 3 complete robot architectures, not three disconnected subsystem ideas.

Current state:
Second implementation pass is complete. Vertex packets now go through a dedicated concept quality gate before the app accepts them. The gate rejects subsystem-only concepts, missing schema fields, duplicate architectures, wrong conservative/balanced/high-ceiling ordering, unsupported legal certainty, invented point values, placeholder text, and over-budget concepts that do not name budget risk. Rejection reasons are sent into a repair prompt, and rejected packets are never silently presented as accepted AI output.

Remaining hardening:
- Add UI surfacing for quality-gate repair/fallback status.
- Expand concept validation with season-specific scoring vocabulary once manual extraction is stronger.
- Add model-eval fixtures for real bad Vertex responses captured during testing.

What we need:
- Strong structured output schema. Initial server-side gate added.
- Review rule: reject concepts missing drivetrain, scoring/intake, manipulator, and control/autonomous plan. Added.
- Distinct conservative, balanced, and high-ceiling concepts. Added.
- Cost, build time, risks, upgrade path, and required tools. Added.
- Explanation of why a concept fits the team. Added.

Done when:
- Every generated concept is a complete robot plan.
- Bad model output is repaired or rejected.
- The UI shows only accepted, complete concepts.

Tests:
- Model-normalization unit tests for incomplete concepts.
- API test that generated concepts pass whole-robot validation.

### 3. Team Onboarding And Project Setup

Priority: P0

Why it matters:
Garbage inputs make garbage robot plans. The app needs enough team context to produce practical outputs.

Current state:
Third implementation pass is complete. The wizard now uses a setup validation model, and the API enforces the same critical blockers before project creation/generation. Draft intake can still be saved while incomplete, but generation refuses missing identity, invalid roster, unrealistic budget/timeline, missing resources, missing strategy mode, too few priorities, or vague goals. Inventory, tools, and priorities are cleaned and deduped before they reach generation.

Remaining hardening:
- Add project list/restore UI so users can switch among saved projects.
- Add source-aware season manual requirements for final competition recommendations.
- Add import mapping for richer inventory files with SKU, quantity, and notes.

What we need:
- Required field validation. Added on frontend and API.
- Skill mode: Beginner, Intermediate, Advanced. Added.
- Budget and timeline validation. Added.
- Inventory import cleanup. Added.
- Strategy mode: AI, team-provided, hybrid. Added.
- Clear setup completion meter. Added.
- Persisted project selection and restore. Existing local restore remains; project switching UI still needed.

Done when:
- A team can create a project from scratch without editing code.
- Missing critical setup fields are surfaced before generation.
- The project reloads after refresh.

Tests:
- Frontend smoke test for project creation wizard.
- API test for create, update, list, restore, delete.

### 4. Season Manual And Rules Ingestion

Priority: P0

Why it matters:
Rule-sensitive answers are the highest-risk part. They must be grounded in current official documents.

Current state:
PDF upload works. Ingestion now preserves page-aware chunks from parsed PDFs, carries rule numbers, document version, and upload/source date through searchable chunks, and rule citations now include section/page metadata.

Remaining hardening:
- Add official FIRST URL ingestion and source-type detection.
- Improve section heading extraction against real manual fixtures.
- Show indexed source docs in the UI with version/date and chunk health.

What we need:
- Better PDF chunking by page and section. Initial page-aware chunking added.
- Preserve page numbers. Added.
- Preserve rule numbers. Added.
- Preserve document version and upload/source date. Added.
- Support official FIRST URL ingestion.
- Distinguish manual, team update, Q&A, field drawing, and inspection checklist.
- Show indexed source docs in the UI.

Done when:
- Uploaded manual produces searchable chunks with page and rule metadata.
- Rule answers cite source document, version, section/page, and confidence.
- If no citation exists, the app refuses certainty.

Tests:
- Chunk metadata regression test for rule/page/version/source date. Added.
- Rule search test with expected rule/page metadata. Added.
- PDF fixture ingestion test.
- Chat test verifies uncited legality claims are not made.

### 5. Rules-Aware RAG And Legal Checklist

Priority: P0

Why it matters:
This is the trust layer. It prevents the app from hallucinating robot legality.

Current state:
Keyword search and citations exist, and each selected mechanism now gets a deterministic legal checklist item. Checklist items carry mechanism ID, concern, citation object, confidence, source metadata, and conservative unresolved/blocker status when the indexed manual cannot support the claim. The project review pass consumes the same checklist and blocks final confidence when current-manual citations are missing.

Remaining hardening:
- Add semantic search through embeddings.
- Add conflict and outdated-source detection across manuals, team updates, Q&A, and inspection documents.
- Expand checklist queries with season-specific scoring vocabulary once manual extraction is stronger.

What we need:
- Citation object with rule number, section, page, source, version/date, explanation, confidence. Added.
- Rules checklist tied to selected robot concept and mechanisms. Added.
- Legal concern mapping by drivetrain, extension, control system, vision, game interaction. Initial deterministic mapping added.
- Conflict/outdated-source warnings.
- Future semantic search through embeddings.

Done when:
- Each concept has rule concerns backed by indexed citations or marked unresolved. Added.
- Legal checklist updates when selected design changes. Added.

Tests:
- Legal checklist integration test. Added.
- Regression test for no definitive claim when citation confidence is low. Added through review blockers.

### 6. BOM And Budget Engine

Priority: P0

Why it matters:
The BOM must be believable and mechanically tied to the robot. If it is generic, the whole app feels hardcoded.

Current state:
REV catalog scraping exists. BOM still uses simple mechanism keywords and starter assumptions.

What we need:
- BOM generated from `MechanismSpec`.
- Required, optional, spares, already-owned, missing.
- Buy-first ranking.
- Budget modes: ultra-low, balanced, competitive.
- Substitution suggestions.
- Manual overrides for price, quantity, and inventory.
- Cost by subsystem.

Done when:
- Changing selected design changes BOM because mechanism specs changed.
- Inventory actually removes owned items from missing list.
- Budget remaining is accurate.

Tests:
- BOM unit tests by mechanism type.
- Integration test for design selection changing BOM.

### 7. REV Catalog And Supply Data

Priority: P1

Why it matters:
Real parts, SKUs, prices, product URLs, CAD links, and last-checked dates make the app practical.

Current state:
REV storefront adapter and local cache exist.

What we need:
- More robust product discovery.
- Category normalization.
- Price parsing validation.
- Stock/purchasability label.
- CAD/resource URL extraction.
- Catalog refresh metadata.
- SKU matching by mechanism requirements.

Done when:
- BOM line items prefer real catalog entries.
- Unknown availability is clearly labeled with `lastChecked`.

Tests:
- Catalog parser fixture tests.
- Search test for key REV parts.

### 8. Physics And Math Verifier

Priority: P1

Why it matters:
Blueprint should show math, not vibes. This is one of the strongest differentiators.

Current state:
Drivetrain, lift, arm, and intake/servo calculations exist with assumptions and mechanism IDs.

What we need:
- Physics generated per mechanism spec.
- Drivetrain: speed, torque, acceleration estimate.
- Lift/slide: load, torque, safety margin.
- Arm: required torque, safety factor.
- Servo: torque margin.
- Intake: roller speed. Added.
- Battery/current warnings.
- Student-readable assumptions and formulas.
- Warning thresholds.

Done when:
- Each motorized mechanism gets at least one calculation. Initial mechanism coverage added for drivetrain, lift/arm, and intake.
- Low safety margins produce warnings.
- Physics page traces every number back to a mechanism input.

Tests:
- Calculator unit tests.
- Integration test that selected design produces mechanism-specific physics.

### 9. CAD / Blueprint Generator

Priority: P1

Why it matters:
The CAD view makes the plan concrete, but it must not overpromise manufacturing-ready output.

Current state:
Conceptual CAD JSON and STEP-like note exports exist. Three.js preview exists.

What we need:
- CAD generated from mechanism spec.
- Top/front/side/isometric/wiring/exploded views as structured layout data.
- Mounting points tied to real subsystems.
- Clear "conceptual starter" labeling.
- Better part placement for different drivetrain/manipulator types.
- Later: CadQuery/OpenCascade STEP/STL export.

Done when:
- CAD layout visibly changes by selected concept and mechanisms.
- Exported concept data includes subsystem placement and verification notes.

Tests:
- CAD generation unit tests for tank/mecanum/lift/arm variants.
- Browser smoke test for nonblank 3D scene.

### 10. FTC Java Code Generator

Priority: P1

Why it matters:
The code must be usable starter FTC SDK Java, aligned with generated hardware names and selected mechanisms.

Current state:
Java files are generated. Static validation and fixture compile test exist.

What we need:
- Code generated from mechanism spec.
- Include `IntakeSubsystem.java`.
- Hardware configuration checklist per mechanism.
- Different drivetrain code for tank vs mecanum.
- Lift/arm/intake code only when present.
- Safer initialization and telemetry.
- Autonomous code from auto plan.
- Optional driver log hooks.

Done when:
- Generated code compiles against fixture.
- Hardware names are consistent across code, checklist, and UI.
- Selecting a tank concept does not produce mecanum-only controls.

Tests:
- Static validation.
- Fixture compile.
- Snapshot tests for drivetrain variants.

### 11. Build Guide

Priority: P1

Why it matters:
This is what turns a plan into student action.

Current state:
Build guide exists but is still template-heavy.

What we need:
- Steps generated from mechanism spec and BOM.
- Parts/tools per step.
- Checkpoints.
- Common mistakes.
- Tests before continuing.
- Safety warnings.
- HTML and later PDF export.
- Step completion in UI.

Done when:
- Every major subsystem has build, wire, test, and tune steps.
- Steps reference actual BOM items and hardware names.

Tests:
- Build guide integration test validates parts/tools/checkpoints exist.

### 12. Strategy Engine

Priority: P1

Why it matters:
Strategy determines what robot is worth building.

Current state:
Basic deterministic and Vertex strategy output exists.

What we need:
- Strategy grounded in scoring table and team constraints.
- What to score, ignore, specialize in.
- Auto/TeleOp/endgame strategy.
- Alliance compatibility.
- Risk/reward analysis.
- Driver practice goals.
- Citations for game-specific claims.

Done when:
- Strategy changes when manual/team priorities change.
- Concepts explain how they serve the strategy.

Tests:
- Strategy fixture tests for beginner vs advanced teams.

### 13. Autonomous Assistant

Priority: P2

Why it matters:
Autonomous is a core FTC differentiator, but it depends on drivetrain and sensors being modeled first.

Current state:
Basic starter autonomous code exists.

What we need:
- Inputs: start position, alliance color, desired action, sensors, reliability preference.
- Path sequence.
- Pseudocode.
- Java starter code.
- Tuning constants.
- Testing plan.
- Warnings for wheel diameter, gear ratio, track width, battery, traction.

Done when:
- Auto plan and code match the selected drivetrain.

Tests:
- Auto code generation tests by drivetrain.

### 14. Chat / Iteration Layer

Priority: P2

Why it matters:
Chat is how teams iterate after generation.

Current state:
Project-aware chat exists. `/goal` command exists in-app.

What we need:
- Chat history.
- Suggested actions.
- Apply-to-plan workflow.
- Modes: rules, strategy, mechanical, code, CAD, budget, grants, driver optimization.
- Citations in chat responses.
- Commands for `/goal`, `/budget`, `/inventory`, `/select`, `/recalc`.

Done when:
- A chat answer can update the project with user approval.
- Rule-sensitive chat answers cite sources.

Tests:
- Command handler tests.
- Chat response schema tests.

### 15. Driver Log Optimization

Priority: P2

Why it matters:
This is a strong differentiator and directly helps teams improve driver performance.

Current state:
CSV/JSON upload and basic button-count suggestions exist.

What we need:
- Robust log parser.
- Button/stick/trigger events with timestamps.
- Repeated sequence detection.
- Macro suggestions.
- Toggle vs hold recommendations.
- Deadzone and slow mode suggestions.
- Driver 1/driver 2 ownership.
- UI heatmap or usage table.

Done when:
- Uploading logs produces specific remap suggestions tied to repeated actions.

Tests:
- Parser tests for CSV/JSON.
- Recommendation tests for repeated button sequences.

### 16. Grant / Sponsor Assistant

Priority: P2

Why it matters:
Funding is important for underserved teams and is part of the writeup promise.

Current state:
Sponsor email and grant draft endpoints exist.

What we need:
- Editable sponsor email.
- Grant draft.
- Budget justification from BOM.
- Donation tiers.
- Follow-up and thank-you emails.
- Sponsor CRM fields.
- Export packet later.

Done when:
- A team can generate sponsor materials using real team/BOM data.

Tests:
- Sponsor content schema tests.

### 17. Review Agent / Quality Gates

Priority: P0/P1

Why it matters:
This protects users from bad AI output.

Current state:
Review gates now include concept whole-robot validation, Java static validation, CAD disclaimers, mechanism schema validation, legal checklist blockers for missing citations, mechanism ID alignment across BOM/physics/CAD/code/build guide, hardware-name mismatch detection, missing mechanism calculations, and over-budget warnings.

Remaining hardening:
- Add automatic repair actions for common review failures.
- Persist review history by project version.
- Add broader unsafe-build-advice detection as build guide detail increases.

What we need:
- Central review pass for every generated packet. Added.
- Block uncited legal claims. Added as missing-citation blockers.
- Block concept/BOM/physics/code/CAD mismatch. Added for mechanism IDs and hardware names.
- Flag unsafe build advice.
- Flag over-budget plans. Added as warnings with fixes.
- Flag missing mechanism calculations. Added.
- Store warnings and fixes. Added in the project review object.

Done when:
- Generated project response includes review pass/warnings. Added.
- UI surfaces blockers before download/build steps. Added on dashboard/sidebar.

Tests:
- Review test with intentionally contradictory packet. Added.

### 18. Persistence And Project Workspace

Priority: P1

Why it matters:
Teams need to return to their work.

Current state:
Local JSON cache and project restore exist.

What we need:
- Project versions.
- Artifact history.
- Chat history.
- Build progress.
- Eventually database-backed persistence.

Done when:
- Refreshing the app restores the latest non-demo project.
- Project exports include current artifacts.

Tests:
- Persistence integration test.

### 19. Frontend Workspace Pages

Priority: P1

Why it matters:
The UI should feel like a serious engineering workspace, not a marketing page.

Current state:
Dashboard, Strategy, Design, BOM, Physics, CAD, Code, Build, Chat exist. Driver Logs and Grants need fuller pages.

What we need:
- Dense dashboard as primary working screen.
- Dedicated Driver Logs tab.
- Dedicated Grants tab.
- Editable tables.
- Warning badges.
- Source citations.
- Apply changes workflow.
- Mobile-safe layout.

Done when:
- Users can operate the full MVP from tabs without touching raw JSON.

Tests:
- Browser smoke tests for key tabs.

### 20. Production Infrastructure

Priority: P3

Why it matters:
Needed for real deployment, accounts, collaboration, storage, and scale.

Current state:
Local app with local JSON cache.

What we need:
- Auth.
- Database.
- File storage.
- Background jobs.
- Vector DB.
- Observability.
- Deployment.
- Secrets management.

Done when:
- Multi-user hosted deployment exists with durable projects and files.

Tests:
- CI/CD, integration, e2e, observability checks.

## Recommended Immediate Sprint

Do these first:

1. Implement `MechanismSpec`.
2. Convert concept generation to emit `MechanismSpec`.
3. Make BOM consume `MechanismSpec`.
4. Make physics consume `MechanismSpec`.
5. Make CAD consume `MechanismSpec`.
6. Make code consume `MechanismSpec`.
7. Add Review Agent blockers for missing or contradictory mechanisms. Initial pass added.

That is the shortest path from "cool prototype" to "credible MVP."
