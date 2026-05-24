# Blueprint Context

Blueprint is an AI engineering workspace for FIRST Tech Challenge teams. It turns the official game manual, team constraints, budget, inventory, strategy, and preferred supplier into a complete first robot planning package: strategy, architecture, legal checklist, REV-first BOM, budget, physics calculations, conceptual CAD, FTC SDK Java starter code, build guide, grant support, chatbot iteration, and driver-control optimization.

The product should feel like a serious engineering tool for students, not a toy chatbot. It should make teams faster while preserving student learning, mentor review, rule citations, and transparent math.

## Product Positioning

Blueprint is not "AI builds your robot." It is an FTC project workspace that helps teams create a legal, budget-aware, buildable starting plan.

Primary promise:

> Blueprint turns kickoff chaos into a cited, budgeted, math-backed robot plan that students can inspect, edit, build, test, and improve.

Core principles:

- Prefer conservative, buildable recommendations for beginner teams.
- Never make rule-sensitive claims without citations.
- Show assumptions and formulas for mechanism recommendations.
- Treat CAD as conceptual until students verify dimensions, fasteners, clearances, and legality.
- Generate FTC SDK Java that is readable, safe, and aligned with hardware configuration names.
- Keep the team in control: AI should explain, compare, and propose, not replace engineering judgment.

## Target Users

Primary users:

- FTC students on new teams
- Underserved teams
- Teams without experienced mentors
- Teams with limited budgets
- Teams overwhelmed by kickoff

Secondary users:

- Coaches
- Mentors
- Parents helping with grants
- Team captains
- Programming leads
- Mechanical leads
- Outreach leads

Supported skill modes:

- Beginner Mode: plain language, minimal jargon, conservative robot concepts, step-by-step build guidance.
- Intermediate Mode: mechanism tradeoffs, customization, alternatives, budget comparisons.
- Advanced Mode: custom strategy, custom hardware, tuning values, code architecture, deeper physics and controls.

## MVP Outputs

For each team project, Blueprint must generate:

- Strategy recommendation
- Robot architecture
- Legal/rules checklist
- Bill of materials
- Budget breakdown
- Supply availability tracking
- Mechanism calculations
- Motor, torque, and RPM recommendations
- Gear ratio suggestions
- Starter CAD/3D concept
- Step-by-step build guide
- FTC SDK Java starter code
- Autonomous mode starter code
- Driver-controlled mode starter code
- Hardware configuration guide
- Testing checklist
- Grant/sponsor email generator
- AI chatbot for iteration
- Driver control optimization from logs

This is the real MVP. The first usable version should be complete enough for a team to start planning and building, even if several systems are initially deterministic or template-driven behind the scenes.

## Main Product Flow

1. Team creates a profile.
2. Team uploads/selects the current game manual and official resources.
3. Team enters budget, inventory, tools, skill level, timeline, and robot priorities.
4. Team chooses strategy mode: AI-generated, team-provided, or hybrid.
5. Blueprint generates three robot concepts.
6. Team selects one concept or asks Blueprint to merge ideas.
7. Blueprint generates the full project packet.
8. Team iterates through chat, substitutions, physics recalculation, code regeneration, build progress, grants, and driver logs.

Required onboarding fields:

- Team name
- Team number
- Location
- Experience level
- Number of students
- Available mentors
- Build space limitations
- Tools available
- CAD experience
- Programming experience
- Existing parts inventory
- Budget
- Preferred supplier, starting with REV Robotics
- Competition timeline
- Robot priorities

Robot priority options:

- Low cost
- Easy to build
- Fast drivetrain
- Strong endgame
- Reliable autonomous
- Simple driver control
- Easy maintenance
- Maximum scoring potential
- Alliance-friendly reliability

## Core Systems

### Rules-Aware RAG

Blueprint must ground rule-sensitive answers in official indexed documents.

MVP documents to index:

- FTC Competition Manual
- Field drawings
- Scoring rules
- Robot construction rules
- Inspection checklist
- Q&A updates if available
- Team updates
- FTC Docs
- FTC SDK docs/Javadocs
- REV Robotics docs
- REV product pages
- Team uploaded PDFs
- Team uploaded strategy notes
- Team uploaded inventory spreadsheets

RAG requirements:

- Chunk documents by section.
- Preserve page numbers where possible.
- Preserve rule numbers.
- Preserve document version.
- Store source URL.
- Store effective/update date.
- Support semantic search eventually.
- Support keyword search in MVP.
- Return citations.
- Highlight conflicting or outdated sources.

Rule citation format:

- Rule number
- Manual section
- Source document
- Version/date
- Short explanation
- Confidence level

Required behavior:

- Bad: "This is definitely legal."
- Good: "Based on the indexed manual, this appears likely legal under the cited rules, but the official manual, Q&A, and event inspectors remain authoritative."

### Parts Catalog And Supply Engine

MVP supplier: REV Robotics.

Current implementation approach:

- REV does not appear to expose a simple unauthenticated public catalog API.
- Blueprint uses a public-page adapter for REV Robotics BigCommerce product pages.
- The adapter discovers product URLs from search/seed URLs and parses storefront data.
- Product pages expose useful data through HTML, meta tags, JSON-LD, and `BCData.product_attributes`.

Catalog fields:

- Part name
- SKU
- Supplier
- Category
- Price
- Weight, if available
- Dimensions, if available
- Material, if available
- CAD URL
- Product URL
- Stock/purchasability status
- FTC legality status if known
- Compatible parts
- Required accessories
- Quantity
- Electrical requirements
- Mechanical properties
- Notes
- Last checked timestamp

Supply outputs:

- Required BOM
- Optional BOM
- Spare parts list
- Already-owned parts
- Missing parts
- Estimated subtotal
- Shipping estimate placeholder
- Budget remaining
- Substitution suggestions
- Buy-first priority ranking

Stock caveat:

- Stock changes constantly.
- If live stock cannot be verified precisely, label availability as `lastChecked`.

Later suppliers:

- goBILDA
- AndyMark
- ServoCity
- McMaster-Carr
- Custom 3D printed parts
- Team inventory

### Budget Optimizer

Inputs:

- Total budget
- Existing inventory
- Must-have mechanisms
- Nice-to-have mechanisms
- Spare parts preference
- Competition deadline
- Supplier preference

Outputs:

- Total estimated robot cost
- Cost by subsystem
- Minimum viable build cost
- Recommended build cost
- Competition-ready build cost
- Upgrade path
- Parts to skip
- Parts to reuse or buy used
- Parts to 3D print
- Parts needing spares

Budget modes:

- Ultra-Low Budget: reuse parts, simpler mechanisms, fewer sensors.
- Balanced Budget: reliable robot with reasonable scoring potential.
- Competitive Budget: stronger drivetrain, sensors, spares, refined mechanisms.

### Strategy Engine

Inputs:

- Scoring table
- Match timing
- Autonomous opportunities
- Endgame scoring
- Penalties
- Robot constraints
- Alliance interactions
- Team skill level
- Budget
- Build timeline
- Driver skill
- Programming skill

Outputs:

- Recommended scoring priorities
- What to ignore
- What to specialize in
- Autonomous strategy
- TeleOp strategy
- Endgame strategy
- Driver practice goals
- Alliance compatibility
- Risk/reward analysis

Beginner default:

- Build reliable drivetrain first.
- Score one or two repeatable tasks instead of chasing every task.
- Avoid high-complexity endgame unless essential.
- Use a simple autonomous path that parks or scores reliably.
- Prioritize driver practice over mechanism complexity.

### Physics And Math Verifier

Blueprint must show the math behind mechanical recommendations.

MVP calculations:

- Torque required
- Motor torque available
- Gear ratio
- RPM
- Wheel speed
- Linear speed
- Acceleration estimate
- Lift force
- Arm torque
- Stall safety margin
- Current draw estimate
- Battery load estimate
- Center of gravity estimate
- Tipping risk estimate
- Chain/belt speed
- Pulley ratio
- Servo torque margin
- Intake roller speed
- Linear slide load

Core formulas:

```text
wheel_rpm = motor_rpm / gear_ratio
wheel_circumference = pi * wheel_diameter
linear_speed = wheel_rpm * wheel_circumference

wheel_torque = motor_torque * gear_ratio * efficiency
force = wheel_torque / wheel_radius

required_torque = load_weight * arm_length
recommended_torque = required_torque * safety_factor

required_force = mass * gravity
pulley_lift_torque = required_force * pulley_radius

safety_margin = available_torque / required_torque
```

For every mechanism, output:

- Assumptions
- Formula
- Inputs
- Calculation
- Result
- Safety factor
- Recommendation
- Warning if margin is too low

### CAD / Blueprint Generator

Do not promise manufacturing-ready CAD in MVP.

MVP CAD output:

- Subsystem layout
- Robot dimensions
- Drivetrain layout
- Mechanism placement
- Mounting points
- 2D blueprint views
- Exploded assembly diagrams
- Basic 3D model concept
- STEP/Onshape-compatible part references where possible
- CAD assembly instructions

Recommended technical path:

- Three.js / React Three Fiber for browser preview.
- Parametric layout JSON as intermediate representation.
- CadQuery/OpenCascade later for STEP/STL export.
- REV CAD links from catalog where available.
- Optional Onshape API later.

CAD reality check:

> Conceptual CAD starter. Verify dimensions, clearances, fasteners, and legality before manufacturing.

Important boundary:

- The attached CAD file is developer/reference material, not app data.
- Blueprint should not ingest or expose local reference CAD/code in project state.

### Build Instructions

Build guide should feel like LEGO-style instructions.

Each step includes:

- Step number
- Title
- Parts needed
- Tools needed
- Estimated time
- Image/diagram
- Instructions
- Safety warning if needed
- Checkpoint
- Common mistake
- Test before continuing

Build phases:

- Prepare parts
- Build drivetrain
- Mount control hub
- Wire drivetrain
- Test drivetrain
- Build intake
- Build scoring mechanism
- Add sensors
- Cable management
- Upload code
- Configure hardware map
- Test subsystems
- Tune autonomous
- Driver practice
- Inspection checklist

Example drivetrain test:

- Robot moves forward when left stick moves forward.
- Mecanum robot strafes correctly.
- Motors are not reversed incorrectly.
- No wires drag.
- Battery is secure.
- Wheels spin freely.
- Robot can be disabled quickly.

### Code Generator

MVP target:

- FTC SDK Java
- Android Studio project structure
- TeamCode classes
- LinearOpMode starter code
- TeleOp OpMode
- Autonomous OpMode
- Hardware mapping
- Subsystem classes
- Basic telemetry
- Safety checks

Generated files:

- `RobotHardware.java`
- `DriveSubsystem.java`
- `LiftSubsystem.java`
- `IntakeSubsystem.java`
- `TeleOpMain.java`
- `AutoMain.java`
- `Constants.java`
- `README.md`
- Hardware configuration checklist

Code safety requirements:

- Motor power clipping
- Emergency stop behavior
- Servo range limits
- Encoder reset options
- Telemetry status
- Hardware initialization guidance
- Battery voltage warnings if available
- Clear comments explaining where constants are tuned
- Case-sensitive hardware configuration names

Later code targets:

- Blocks export
- OnBot Java export
- Road Runner integration
- Pedro Pathing integration
- AprilTag vision
- OpenCV pipelines
- Dashboard tuning

### Autonomous Assistant

Inputs:

- Starting position
- Alliance color
- Desired scoring action
- Drivetrain type
- Sensors available
- Vision available
- Reliability preference

Outputs:

- Autonomous strategy
- Path sequence
- Pseudocode
- Java starter code
- Tuning constants
- Testing plan

MVP autonomous:

- Drive forward/park
- Score preload
- Turn to heading
- Encoder-based movement
- Time-based fallback
- Basic sensor stop
- Optional AprilTag if supported

Warnings:

- Wheel diameter
- Encoder ticks per revolution
- Gear ratio
- Track width
- Battery voltage
- Floor traction
- Robot weight

### Driver-Control Optimization

The app should accept uploaded logs as CSV/JSON in MVP.

Logged events:

- Button presses
- Stick movement
- Trigger values
- Mode toggles
- Action timestamps
- Match phase
- Robot state
- Driver errors
- Failed actions
- Repeated actions
- Time between actions

Outputs:

- Better button mapping
- Macros
- Toggle vs hold recommendations
- Deadzone tuning
- Drive speed scaling
- Slow mode button
- Presets for lift positions
- Intake/outtake automation
- Controller layout for driver 1 and driver 2

Example:

> The driver presses A then Right Trigger together repeatedly. Consider binding this as a single score macro on Right Bumper.

### Chatbot

Chatbot modes:

- Rules assistant
- Strategy mentor
- Mechanical design assistant
- Code assistant
- CAD assistant
- Budget assistant
- Grant/outreach assistant
- Driver optimization assistant
- Debugging assistant

Chatbot must know project context:

- Budget
- Selected robot concept
- Parts list
- Code generated
- Build progress
- Known issues
- Team skill level
- Competition timeline

Example questions:

- Is this intake legal?
- Can we make this cheaper?
- Why does our lift stall?
- Generate code for our slide.
- What gear ratio should we use?
- How do we wire this sensor?
- Write an email asking a local company for $500.
- Our driver keeps missing this button. What should we change?

### Grant And Sponsor Assistant

Inputs:

- Team name
- Location
- Mission
- Budget need
- Student demographics
- Past achievements
- Sponsor type
- Donation goal
- Contact name
- Company name

Outputs:

- Sponsor email
- Grant application draft
- Budget justification
- One-page sponsorship packet text
- Follow-up email
- Thank-you email
- Donation tiers
- Outreach tracker

Sponsor CRM fields:

- Organization
- Contact name
- Email
- Status
- Amount requested
- Amount received
- Follow-up date
- Notes

## Agent Architecture

Blueprint should use specialized agents rather than one giant prompt.

Agent order:

1. Intake Agent
2. Rules Agent
3. Strategy Agent
4. Mechanical Design Agent
5. Parts Agent
6. Physics Agent
7. CAD Agent
8. Code Agent
9. Build Guide Agent
10. Driver Optimization Agent
11. Grant Agent
12. Review Agent

Every major output should pass through Review Agent.

Prompt principles:

- Prioritize FTC legality.
- Cite official rules.
- Respect budget and inventory.
- Prefer simpler mechanisms for beginners.
- Avoid unsupported claims.
- Show math.
- Be honest about uncertainty.
- Recommend mentor review.
- Generate editable outputs.
- Preserve student learning.

Current endpoint:

- `GET /api/projects/:id/prompts`
- `POST /api/projects/:id/agents/review-plan`

These prepare local prompt payloads for a future model adapter. The current MVP does not call hosted LLMs.

## Current Tech Stack

Frontend:

- Vite
- React
- TypeScript
- GSAP
- Three.js / React Three Fiber
- Lucide icons
- CSS modules via plain CSS files

Backend:

- Node.js
- Express
- `pdf-parse`
- `cheerio`
- `multer`
- `archiver`
- Public-page REV catalog adapter

Current local URLs:

- Frontend: `http://localhost:5173/`
- API: `http://localhost:8787/`

Current commands:

```bash
npm run dev
npm run build
npm run lint
```

## Current Implementation Status

Legend:

- `[x]` implemented in current repo
- `[~]` partially implemented / prototype quality
- `[ ]` not implemented

### Foundation

- [x] React/TypeScript frontend scaffold
- [x] Express API server
- [x] Blueprint branding
- [x] Landing page
- [x] Stateful workspace screen
- [x] Workspace tabs
- [x] API health endpoint
- [x] Local PDF ingestion for writeup/manual
- [x] Local JSON project snapshot persistence
- [x] Project list/delete API
- [~] Document chunking
- [~] Local JSON project persistence; persistent database still not added
- [ ] Authentication
- [ ] File storage service
- [ ] Background job queue

### Frontend Workspace

- [x] Overview tab
- [x] Strategy tab
- [x] Design tab
- [x] BOM tab
- [x] Physics tab
- [x] Code tab
- [x] Build tab
- [x] Chat tab
- [x] Buttons open workspace instead of hash-jumping
- [~] Responsive workspace layout
- [x] Real project wizard form
- [x] Upload UI for manual/inventory/logs
- [~] Editable team, strategy, budget, and inventory intake artifacts
- [ ] Apply-chat-suggestion workflow

### Rules / RAG

- [x] Ingest attached writeup/manual locally
- [~] Keyword search over chunks
- [~] Rule citation extraction
- [~] Manual-preferred citation scoring
- [ ] Page number preservation
- [ ] Better section parsing
- [ ] Semantic search with embeddings
- [ ] Manual version update detection
- [ ] Official FIRST URL ingestion
- [ ] Conflict/outdated-source detection

### REV Catalog

- [x] REV public product page parser
- [x] SKU/name/price parsing
- [x] Product URL parsing
- [x] Product image parsing
- [x] Stock/purchasability caveat with `lastChecked`
- [x] Docs/CAD link discovery
- [x] Catalog cache in `.cache/rev-catalog.json`
- [~] Search/discovery from seed URLs and REV search pages
- [ ] Full catalog crawl
- [ ] Better category normalization
- [ ] Compatibility graph
- [ ] Supplier abstraction for goBILDA/AndyMark/etc.

### Project Generation

- [x] Create demo project
- [x] Create project API
- [x] Generate three robot concepts
- [x] Select design API
- [x] Generate BOM API
- [x] Generate build guide API
- [x] Generate CAD concept API
- [x] Generate code API
- [~] Deterministic strategy generator
- [~] Deterministic concept generator
- [ ] Real LLM model adapter
- [ ] Review-agent enforcement before final plan

### Physics

- [x] Wheel speed
- [x] Wheel torque / force
- [x] Linear lift torque
- [x] Arm torque
- [x] Assumptions/formulas/results/recommendations
- [ ] Current draw estimate
- [ ] Battery load estimate
- [ ] Center of gravity estimate
- [ ] Tipping risk estimate
- [ ] Chain/belt speed
- [ ] Pulley ratio tuning
- [ ] Servo torque margin with real servo data
- [ ] Intake roller speed
- [ ] Linear slide load model with friction

### CAD

- [x] Browser 3D concept preview
- [x] CAD concept JSON/spec endpoint
- [x] Conceptual CAD disclaimer
- [ ] 2D blueprint views
- [ ] Exploded assembly diagrams
- [ ] Wiring view
- [ ] Parametric CadQuery export
- [ ] glTF/GLB export
- [ ] STEP/STL export
- [ ] Onshape integration

### Code

- [x] FTC SDK Java starter templates
- [x] `Constants.java`
- [x] `RobotHardware.java`
- [x] `DriveSubsystem.java`
- [x] `LiftSubsystem.java`
- [x] `TeleOpMain.java`
- [x] `AutoMain.java`
- [x] `README.md`
- [x] Code ZIP export
- [~] Hardware configuration checklist
- [~] Static generated-code validation endpoint
- [~] CI compile smoke test against FTC compatibility stubs
- [ ] Compile generated code inside sample FTC project
- [ ] Intake subsystem class
- [ ] Battery voltage warning
- [ ] Road Runner/Pedro Pathing optional path
- [ ] AprilTag/OpenCV optional path

### Driver Logs

- [x] Driver log analysis endpoint
- [x] Basic button usage counts
- [x] Basic macro/remap suggestions
- [x] Upload UI
- [ ] CSV parser with schema
- [ ] Match phase analysis
- [ ] Timing gaps
- [ ] Control heatmap
- [ ] Robot state correlation

### Grants

- [x] Sponsor email endpoint
- [x] Grant draft endpoint
- [x] Donation tiers
- [ ] Sponsor CRM UI
- [ ] Follow-up reminders
- [ ] Sponsorship packet export
- [ ] Real grant search

### Verification

- [x] `npm run build`
- [x] `npm run lint`
- [x] Runtime health smoke tests
- [x] REV catalog sync/search smoke test
- [x] Workspace interaction test with Playwright
- [x] API integration test suite
- [~] Generated Java static validation
- [~] Generated Java fixture compile in CI
- [ ] Unit tests
- [ ] Generated Java compile test
- [ ] Accessibility pass

## Recommended Next Milestones

### Milestone 1: Make The Workspace Editable

Goal: teams can create and modify real project data from the UI.

Tasks:

- Add project creation wizard.
- Add team profile form.
- Add budget/inventory editor.
- Add strategy input mode: AI, team-provided, hybrid.
- Add save/update project actions.
- Add local persistence or database.

### Milestone 2: Improve Manual Ingestion

Goal: rules citations become trustworthy.

Tasks:

- Preserve page numbers from PDFs.
- Parse section headings and rule numbers more accurately.
- Add official FIRST URL ingestion.
- Add manual version field and checksum tracking.
- Add refusal behavior for uncited legal claims in UI.

### Milestone 3: Strengthen REV Catalog

Goal: BOM recommendations use richer real supplier data.

Tasks:

- Expand discovery beyond seed URLs.
- Normalize categories.
- Store part mechanical/electrical metadata.
- Add manual price overrides.
- Add compatibility and required-accessory fields.
- Add substitutions UI.

### Milestone 4: Add Model Adapter

Goal: turn deterministic generators into agentic workflows.

Tasks:

- Add provider-neutral model adapter.
- Use structured outputs with schemas.
- Pipe outputs through Review Agent.
- Store generated artifacts per project.
- Add prompt/version audit trail.

### Milestone 5: Generated Code Validation

Goal: starter code should compile.

Tasks:

- Create a sample FTC SDK project fixture or submodule.
- Write generated files into TeamCode.
- Run Gradle compile in CI.
- Surface compile errors in UI.
- Add selected-library guards.

### Milestone 6: CAD Export Pipeline

Goal: move beyond visual concept preview.

Tasks:

- Define parametric robot layout schema.
- Generate CadQuery scripts from schema.
- Export STEP/STL.
- Generate 2D views and simple exploded diagrams.
- Link REV CAD parts where possible.

## Acceptance Criteria

Blueprint MVP is useful when a team can:

- Create a team profile.
- Upload or select the current FTC manual.
- Enter budget and constraints.
- Generate three robot concepts.
- Select one concept.
- Receive a full BOM with estimated cost.
- See rules citations for legal concerns.
- See torque/RPM calculations for major mechanisms.
- View a basic CAD-style robot layout.
- Download starter FTC Java code.
- Follow build steps.
- Ask project-specific chatbot questions.
- Generate a sponsor email.
- Upload driver logs and get control suggestions.

## Known Risks And Mitigations

### Legal/rules hallucination

Mitigation:

- Require citations.
- Prefer official docs.
- Track manual version.
- Refuse uncited claims.
- Add inspector/mentor verification warnings.

### Bad mechanical advice

Mitigation:

- Use deterministic calculators.
- Show assumptions.
- Use conservative safety factors.
- Flag low margins.
- Require mentor review.

### CAD overpromising

Mitigation:

- Label CAD conceptual.
- Generate layout/spec first.
- Verify dimensions and clearances.
- Use real CAD exports later through CadQuery/OpenCascade.

### Code that does not compile

Mitigation:

- Use FTC SDK templates.
- Keep imports conservative.
- Generate hardware names consistently.
- Compile generated code in a fixture before presenting as ready.

### Outdated price/stock data

Mitigation:

- Store product URL.
- Store `lastChecked`.
- Allow manual overrides.
- Avoid presenting availability as guaranteed.

### Students using it as a replacement for learning

Mitigation:

- Explain reasoning.
- Show math.
- Ask teams to choose tradeoffs.
- Add checkpoints and reflection prompts.
- Require design review moments.

## Current Files Of Interest

- `src/App.tsx`: Blueprint frontend and workspace UI.
- `src/App.css`: Visual design and workspace layout.
- `server/index.js`: Runtime bootstrap, cache restore, route registration, and server start.
- `server/routes.js`: Express route registration for projects, artifacts, catalog, chat, and exports.
- `server/documents.js`: PDF ingestion, document chunking, season/manual extraction, and rule lookup.
- `server/catalog.js`: REV adapter, catalog cache, product parsing, and search.
- `server/generators/project.js`: Team defaults, concepts, strategy, BOM, physics, build guide, prompts, and response normalization.
- `server/generators/code.js`: FTC SDK Java starter generation.
- `server/generators/cad.js`: Concept CAD layout and export helpers.
- `server/config.js`: Runtime paths, env loading, and server config.
- `server/persistence.js`: Local `.cache/projects.json` project snapshots.
- `server/javaValidation.js`: Static validation for generated FTC Java output.
- `.cache/rev-catalog.json`: Local REV catalog cache, ignored by git.
- `context.md`: This living project context.

## Development Notes

- The attached FTC code repo and CAD file are developer references only.
- Do not ingest local reference CAD/code into project state.
- Do not expose local reference CAD/code through API endpoints.
- App-generated CAD/code should be based on team constraints, selected architecture, catalog metadata, and explicit prompt/context objects.
- Keep UI buttons action-oriented. They should open or mutate workspace state, not just bounce users around landing-page anchors.
