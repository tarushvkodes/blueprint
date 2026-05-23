<!-- orchestrate handoff
task: rules-rag-upgrade
branch: orch/blueprint/rules-rag-upgrade
agentId: bc-ee60d91d-66c8-4d0c-be07-c33a1091b955
runId: run-f6c7567d-50ef-4287-864d-2bb2bd37ee8e
resultStatus: finished
finishedAt: 2026-05-23T19:12:45.870Z
-->

## Status
success

## Branch
`orch/blueprint/rules-rag-upgrade`

## What I did
- Upgraded `server/modules/rules.js` with rules-owned ingestion, per-page chunking, heading-derived sections, FTC `R/Q/G###` rule extraction, source URLs, version extraction, sha256 checksums, outdated replacement marking, FIRST URL allow-list validation, citation formatting, and citable assertion support.
- Added chat refusal wiring through `server/modules/chat.js` and `server/routes/chat.js`.
- Updated `server/routes/documents.js` for upload ingestion, official URL ingestion, checksum/outdated document responses, replacement IDs, and project-aware rules search citations.
- Added `server/__tests__/rules.test.mjs`.
- Added `npm run test:rules`.

## Measurements
- `npm run test:rules`: 0 passing → 4 passing
- `npm run lint`: exit code 0 == 0
- `npm run build`: exit code 0 == 0
- `npm run test:smoke`: exit code 0 == 0
- `citation fields tested`: 7 == 7
- `checksum length tested`: 64 hex chars == 64 hex chars
- `FIRST allow-list domains tested`: 3 == 3

## Verification
unit-test-verified

## Notes, concerns, deviations, findings, thoughts, feedback
- Official URL ingest accepts HTTPS only for `firstinspires.org`, `www.firstinspires.org`, `ftc-resources.firstinspires.org`, and `cdn.firstinspires.org`.
- Chat refuses rules-flavored questions without indexed citations using the required copy.
- `npm run build` passes with the existing Vite large chunk warning.

## Suggested follow-ups
- Add API integration coverage for real multipart PDF upload and allowed-domain URL ingest using a small PDF fixture.