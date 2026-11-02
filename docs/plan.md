# Backend rewrite plan

Status: implementation and automated verification complete.
See [the architecture guide](backend-clean-architecture-plan.md) for code placement.

## 1. Starting point

Before the rewrite: 31 unit tests passed on Node 20.17. Lint had two console-log
errors; real HTTP/startup coverage was missing. Existing resume/tailoring work
was saved before moving it into the new modules. The unrelated `old/` folder
was left alone.

## 2. What must stay compatible

Use these cases for tests before replacing their code. Also follow the business
rules in [the architecture guide](backend-clean-architecture-plan.md#6-business-and-data-rules).

| Area                 | Keep working                                                                                                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth                 | Existing `/api/auth` routes, `{ credential }` sign-in, web user response, extension `{ user, syncToken }`, logout `{ ok: true }`. Keep sessions in `user_sessions`, login session rotation, cookie settings, token rotation, `SESSION_SECRET`, and 401 behavior.                                        |
| Profiles             | Current `/api/profile`, sync and token routes. Keep flat fields, empty-string defaults, derived career fields, and the combined save response. Profile token routes return `{ token }`. Web uses cookies; extension sync uses bearer tokens.                                                            |
| Capture and jobs     | Bearer capture body `{ url, pageTitle?, html?, text?, jsonLd? }` and `{ job, created }` result. Keep URL identity/edit protection, lowercase enums, ISO dates/nulls, newest-first history, and `tailoredResumeId`. Lists omit descriptions and raw captured pages.                                      |
| Resume API           | Nested achievement reads, flat achievement saves linked by lineage, summaries as a map on reads and a list on saves. Accept client-created lineage IDs. Preserve snapshots, history query table names, diff `before`/counts/labels, optional metadata and old stored JSON.                              |
| Import and tailoring | Multipart field `file`, 10 MiB upload limit, PDF/DOCX/TXT/MD support, `{ id, proposed, charsRead, notFound }`. Keep current tailor/rewrite/proposal routes, `basedOnSnapshot`, blocked fallback, `cannotClaim`, and rewrite `{ original, suggestion, cannotDo }`. Keep client-side review/save/discard. |
| HTTP setup           | `/api`, origins/extension access, JSON 2 MiB limit, capture field limits, long AI request allowance, and JSON error `message`. Preserve 200 undo/tailor, 204 job/proposal deletion, and other current success statuses.                                                                                 |

Test missing versus null/empty values, request validation, response fields and
ordering. Include aliases, education full name, evidence, author/weight fields
and all version metadata. A frontend type may omit a field the server returns.
Do not silently drop it or tighten validation while moving code.

## 3. Migration steps

### Phase 0 — tests and tools

- [x] Save the working tree and preserve existing resume/tailoring changes.
- [x] Pin Node 22.23.2, fix lint, and add CI and recursive test discovery.
- [x] Add real Nest/HTTP tests, fake Google/AI providers and an isolated test DB.
- [x] Add synthetic fixtures for metadata, no-op/partial saves, history, diff,
      revert, rebuild and rollback.

### Phase 1 — job reads and status

- [x] Extract GetJob, repository ports, Prisma mapping and HTTP presentation.
- [x] Compare old/new data, ownership failures, history and status/undo behavior.
- [x] Keep mixed field/status updates atomic and test failed-write rollback.
- [x] Add architecture import checks and record existing concurrency limits.

### Phase 2 — auth and profiles

- [x] Extract Google identity, accounts and sync-token operations.
- [x] Extract EnsureProfile/GetProfile/UpdateProfile through ports.
- [x] Keep stored-profile wiring separate from the combined career/profile view.
- [x] Test sessions, logout, rotation, defaults, save, sync and two-user access.

### Phase 3 — jobs and background reading

- [x] Extract list/edit/delete/capture/manual/reread and URL/edit rules.
- [x] Separate structured/AI parsing, scheduling and startup recovery.
- [x] Use the public resume query for links; register one reader worker.
- [x] Test duplicates, failures, pending reads, recapture, edits during reads,
      late results and deletion.

### Phase 4 — versioned resumes

- [x] Extract plain document/revision types, matching, copy and diff rules.
- [x] Move reads/history/save/revert/rebuild; keep each save transactional.
- [x] Publish career, copy, resume-link and proposal operations.
- [x] Test metadata, old stored JSON/rows, partial/no-op/removal saves, fresh copy
      IDs, source preservation and rollback. Keep frozen legacy data fixtures.

### Phase 5 — Claude, import and rewrite

- [x] Share one Claude process runner; preserve flags, environment and timeouts.
- [x] Extract ImportCv and RewriteResumeLine through document/AI/access ports.
- [x] Test PDF/DOCX/TXT/MD, upload limits, HTTP errors, prompts and fallbacks.
- [x] Test fake process success, failure and timeout; clean its temporary directory
      after active calls finish on application close. Return suggestions without saving.

### Phase 6 — tailoring

- [x] Separate candidate parsing from claim, role, fallback, order and retry rules.
- [x] Extract TailorResume through public job, resume-workspace and AI ports.
- [x] Test malformed replies, pending/empty jobs, cross-role claims and retries.
- [x] Test tailor → accepted/reordered content → normal save → discard through
      the complete app HTTP API. Confirm the source resume stays unchanged.

### Phase 7 — cleanup and whole-app checks

- [x] Connect the new modules in AppModule and remove old services/bridges.
- [x] Enforce boundaries and test single database/AI/reader providers.
- [x] Finish backend checks/build, database/HTTP suites and frontend build.
- [x] Update setup notes and architecture links.

## 4. Data and rollback rules

Keep the Prisma schema and migration history unchanged. Do not reset data,
renumber snapshots or bulk rewrite stored JSON. Run checks before changing
providers, and let the previous worker finish before starting another version.

If a change fails, restore its previous wiring/code from version control or the
saved working-tree checkpoint. Preserve unrelated edits and data. The checkpoint
is at `/private/tmp/job-agent-before-rewrite-gJqCYP`; it contains the original
source and staged/unstaged patches, without environment secrets.

## 5. Results and remaining checks

The new modules are active. Old services and temporary bridges are removed.
Backend type, lint and format checks and both builds passed after cleanup:

| Suite                          | Passed |
| ------------------------------ | -----: |
| Unit and architecture          |     95 |
| Isolated HTTP                  |     15 |
| Database and complete-app HTTP |     32 |

All 142 tests passed. Before deleting the old services, all 31 database
compatibility tests also passed against the old/new implementations.
No database schema or migration files changed.

Browser clicks with real Google/Claude have not been run. The full-app HTTP
suite uses real sessions/Postgres and fake providers. It checks login/profile,
extension capture, board/status/undo, import, rewrite, tailoring review/save,
history/revert and deletion retaining copies.

Existing limits kept for separate fixes:

- Parallel saves can compete for the next snapshot number.
- Parallel tailoring can create competing copies/proposals.
- Job status is read before its write transaction.
- An older AI read can finish while a newer capture is still pending.
- Profile creation is lazy and can race on the first requests.

The frontend still handles proposal review and stale-proposal checks. No server
acceptance endpoint was added. Live provider/browser checks remain a manual
follow-up; they are separate from the completed automated checks.
