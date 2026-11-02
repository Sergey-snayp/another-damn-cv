# Backend rewrite plan

Status: not started. Follow [the architecture guide](backend-clean-architecture-plan.md).
Move one working action at a time and keep current clients and data compatible.
All implementation tasks below are still open.

## 1. Starting point

Last checked: 2026-11-01, using the installed Node 20.17 runtime.

- 31 unit tests passed. Backend/frontend type checks and backend formatting passed.
- Lint has two existing `console.log` errors in `backend/src/main.ts:73` and `:74`.
- 11 database service/guard tests were read but not run. They do not test real HTTP
  routes or Nest startup. Browser, live-provider and build checks were not run.
- Keep existing uncommitted resume/tailoring work. The legacy `old/` folder is
  outside this rewrite. No backend implementation has moved yet.

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

### Phase 0 — prepare tests and tools

- [ ] Record the current working tree; preserve unrelated changes.
- [ ] Pin a supported Node version, align shell/npm/CI, fix the two lint errors,
      and make `npm run check` reliable.
- [ ] Update test discovery before adding nested suites; `test/*.test.ts` misses them.
- [ ] Add a real HTTP/Nest startup test setup with fake Google/AI providers and a
      dedicated `*_test` Postgres database. Run existing database tests.
- [ ] Record the API cases above. Add synthetic resume/proposal fixtures and tests
      for saves, no-op/partial saves, history, diff, revert, rebuild and rollback.

Done when: checks pass and the current code has tests for the first action we move.

### Phase 1 — GetJob, then status changes

Start from `jobs.controller.ts`, `jobs.service.ts`, and `jobs.dto.ts`.

- [ ] Extract GetJob into a plain use case, user-scoped port, Prisma adapter and
      presenter. Keep the current controller; switch only its `get` handler first.
- [ ] Compare old/new results, history and foreign/missing 404s. Check the app
      starts with both new and old handlers.
- [ ] Move status/undo next. Test same-status no-op, event order, stale undo and
      rollback. Keep mixed field/status PATCH on one existing path until Phase 3.
- [ ] Add import checks for migrated code. Record any existing concurrency failure.

Done when: one read and one write work through the current API and clients.

### Phase 2 — auth and profiles

- [ ] Extract identity verification, account and token operations. Move tokens from
      profiles to auth, keeping existing routes, session/cookie and token behavior.
- [ ] Extract EnsureProfile/GetProfile/UpdateProfile through storage, identity and
      career-reader ports. Use a temporary adapter for the old resume career query.
- [ ] Keep stored-profile wiring separate from the combined profile view to avoid
      module cycles. Test login/logout, rotated tokens, defaults, career fields,
      profile save, extension sync and access by two different users.

Done when: existing web and extension authentication/profile flows still work.

### Phase 3 — remaining jobs and background reading

Start from JobsService, JobCaptureService, JobReaderService and their helpers.

- [ ] Move list/edit/delete/capture/manual/reread. Preserve URL identity, field
      protection and response shapes. Move mixed field/status edits atomically.
- [ ] Separate JSON-LD/AI parsing, worker startup and scheduling. Wrap the existing
      Claude runner until Phase 5; keep one active reader worker.
- [ ] Put resume associations behind a port, using old storage until Phase 4.
- [ ] Test duplicate/failed/pending captures, edits during reads, recapture, late AI
      results, deletion and restart recovery. Keep race fixes in separate changes.

Done when: jobs use cases do not import Nest, Prisma or a concrete Claude runner.

### Phase 4 — versioned resumes

Start from ResumeService, DiffService, schemas/types, owner guard and copy helpers.

- [ ] Define plain document/revision types and mappers. Extract pure matching,
      comparison, copy and diff rules; keep Prisma details in the database adapter.
- [ ] Move reads/history first, then save/revert/rebuild. Keep the complete save
      in one transaction and preserve all metadata, defaults and lineage links.
- [ ] Publish career, copy, resume-link and proposal operations. Replace temporary
      adapters from Phases 2 and 3 without changing selection rules.
- [ ] Test old snapshots/JSON, no-op/partial/deletion saves, copied IDs, source
      preservation, rollback, rebuild and competing saves/copies.

Done when: documents and history match the old behavior without data resets or
mass re-saving. Record existing races and fix them separately.

### Phase 5 — Claude, import and rewrite

- [ ] Move the process runner into shared code, keeping old/new callers on the
      same provider. Replace the temporary runner adapter from Phase 3.
- [ ] Extract ImportCv and RewriteResumeLine through file, transcription and
      rewrite ports. Keep prompts/parsers outside business rules.
- [ ] Test synthetic files and fake AI/process success, failure and timeout through
      HTTP. Preserve limits, fallback, proposal fields and no automatic content save.
      Keep live Google/Claude checks separate from normal tests.

Done when: import/rewrite use cases run without external credentials in unit tests,
and the existing import/editor UI still works.

### Phase 6 — tailoring

- [ ] Separate typed candidate parsing from claim/role/fallback/order rules.
- [ ] Extract TailorResume using public job, resume-workspace and AI ports. Keep
      copy selection/reuse, fresh IDs, pending proposals, one retry and discard.
- [ ] Test access, empty/pending jobs, missing/cross-role bullets, malformed replies,
      failure, changed snapshots and concurrent runs. Record existing bugs separately.
- [ ] Check tailor → accept/reject/reorder → save → discard in the existing client.
      Adding a server acceptance endpoint is separate work.

Done when: source resumes stay unchanged and proposals retain their review behavior.

### Phase 7 — remove old code and check the whole app

- [ ] Remove old services/adapters/providers only after their callers move. Keep
      one Prisma connection owner, one Claude runner and one reader worker.
- [ ] Enforce import/module boundaries and remove temporary exceptions. Check
      routes are registered once and test commands discover every suite.
- [ ] Run backend checks/build, database/HTTP suites and frontend build. Check
      login/profile/sync, extension capture, board/edit/status/undo, import,
      tailor/review/save/history/revert and deletion retaining resume copies.
- [ ] Update setup notes and record results here.

Done when: existing clients work, data/history remain compatible, and no old
adapter bridges remain.

## 4. Check and rollback each change

1. Test the current behavior before replacing it. Keep schema/migration history
   unchanged for the structural rewrite. Do not reset databases, renumber snapshots,
   bulk re-save resumes, or rewrite stored JSON to fit new types.
2. Switch one handler/provider. Run unit, real HTTP/startup and affected database
   tests. Compare the same fixtures; ignore only expected differences in generated
   IDs and timestamps.
3. Make sure the previous application version can still read the data. Let active
   worker/AI calls finish before changing the worker; preserve pending
   rows for recovery and run only one scheduler implementation.
4. If checks fail, restore that change's old wiring or revert its isolated code
   change. Keep unrelated edits and data. Fix existing bugs separately from moving code.

A step is finished when its API, ownership, data rules, app startup and client
flow pass. Use fake ports for business tests and real Postgres for transactions.
Ask before deciding unclear behavior or adding scope. Check tasks only when done.

## 5. Progress

Documentation is split into architecture and this plan. Backend migration has
not started. Next: Phase 0, then GetJob in Phase 1.
