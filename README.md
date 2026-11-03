# CV Platform

A job-application workspace: save postings from any site, track them on a board,
and tailor a resume to each one without ever claiming something you have not done.

```
backend/     NestJS API + Postgres (Prisma)
frontend/    React + Vite web app
extension/   Chrome extension: in-page panel that autofills applications, sends jobs to the app
```

## Run it

```bash
nvm use                         # Node version from .nvmrc
docker compose up -d             # Postgres on :5433
cd backend
npm ci
cp .env.example .env             # first setup only
npx prisma generate
npx prisma migrate deploy
npm run start:dev                # :3001
```

In a second terminal, run `nvm use` from the repository root, then
`cd frontend`, `npm ci` and `npm run dev` (:5173).

The frontend proxies `/api` to the backend, so there is no CORS setup in dev.
Sign-in is Google; set `GOOGLE_CLIENT_ID` and `SESSION_SECRET` in `backend/.env`.
Reading job pages, tailoring and interview questions use the local Claude CLI
(`CLAUDE_BIN`). Sign in locally with `claude auth login`. Interview generation
needs a CLI version supporting `--restricted`, `--tools` and `--no-session-persistence`.
Set `INTERVIEW_MODEL` to override `LLM_MODEL` for preparation. Calls consume your
Claude account usage. Run `npx prisma migrate deploy` in `backend` after updating.

The extension is loaded separately: `chrome://extensions` → Developer mode →
**Load unpacked** → select `extension/`. See `extension/README.md`.

## Workspace

- **Dashboard** tracks active and archived applications in Board, List or Chart
  view. Search by role/company; filter by applied dates, job type, status and
  favorites. Drag cards or use their Move menu; recent moves and archives offer Undo.
- **Documents** holds resumes, previews, editing, history and tailoring review.
  Old `/resumes` bookmarks redirect here.
- **Profile → Import from CV** accepts PDF/DOCX/TXT/Markdown files or a saved CV
  from Documents. Review and correct the extracted information, then choose the
  contact fields, summary, work experience, education and skills to save. Existing
  contact values and previously imported sections start unchecked. Chosen career
  sections replace that section in Profile; other sections stay unchanged.
  Imported sections keep their file name or CV version and stay independent of
  later CV edits. Until a section is imported, Profile still shows the primary CV.
  File parsing uses Claude; choosing a saved CV makes no AI call. Neither action
  changes your documents or CV versions attached to applications.
- **Interview Prep** collects active jobs in Screening or Interviewing, with
  search, status filters, job details and the saved application CV version.
  Jobs appear automatically from Dashboard; archived and other statuses stay out.
  Set, change or remove the next interview date, optional time and time zone from
  an interview card or job details. Schedules save to your account; upcoming dates
  appear first. A date without a time stays date-only.
  Open a preparation card to see the filled workspace: saved posting, schedule,
  exact application CV experience, interview type, recruiter instructions, personal
  notes and questions to ask. Notes save to your account; unsaved browser drafts
  can be resumed or discarded.
  Inside each preparation, **Generate HR questions** and **Generate technical
  questions** create six questions with answer drafts, talking points, follow-ups
  and source references. Attach a saved CV and save edited notes first. Results
  stay in your account; reopening the page does not call AI. Regeneration is manual.
  Personal answers are drafts to check, and missing facts appear as questions for you.
  Company research is still planned.

Interview prompts live in
`backend/src/modules/interviews/adapters/outbound/ai/practice-prompts.ts`.
The `PracticeGenerator` port keeps CLI calls separate from business logic. A future
API adapter can replace the `PRACTICE_GENERATOR` provider; no API adapter is installed yet.
The local runner allows no tools for practice, uses an empty working directory,
and disables session persistence. Only the saved job, CV content without contact
fields, and preparation notes are supplied. Avoid adding private contact details
to free-text notes if you do not want them included.

Add Application saves the chosen resume version with the job. Later resume edits
do not change that attachment. Favorites and archives are stored on your account;
view/filter choices stay in the browser.

For older jobs, applied dates use the first recorded status move, or the capture
date when there is no move history.

CSV import accepts up to 500 rows / 2 MB, with Position Title and Company columns.
It previews rows before saving and skips existing job URLs. Export includes the
currently filtered collection, descriptions, dates and attached resume versions.

## Backend

| Module | Routes | What it does |
|---|---|---|
| `auth` | `GET /api/auth/config`, `POST /api/auth/google`, `POST /api/auth/extension`, `GET /api/auth/me`, `POST /api/auth/logout` | Google ID-token sign-in, sessions in Postgres. The extension uses a bearer sync token instead |
| `profiles` | `GET/PUT /api/profile`, `GET /api/profile/career`, `POST /api/profile/career/import`, sync-token and sync routes | Contact/autofill data and reviewed career imports. Saves selected contacts and career sections together; rejects stale reviews. Imported roles drive current-role autofill independently of CV edits |
| `resumes` | `POST /api/import/cv`, `GET /api/extension/resumes` (extension token), `GET/POST /api/resumes`, `GET /api/resumes/:id`, `POST /api/resumes/:id/save`, `POST /api/resumes/:id/rewrite`, `POST /api/jobs/:id/tailor`, `GET/DELETE /api/resumes/:id/tailoring`, history, diff, revert | CV import, versioned resumes, line rewriting and job-specific tailoring in one module. PDF/DOCX/TXT/Markdown imports return an unsaved draft. Tailoring suggests summaries and bullets for review. Changed saves add snapshots; unchanged saves add none |
| `jobs` | `POST /api/jobs/capture` (extension token), `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id`, `POST /api/jobs/:id/reread`, `POST /api/jobs/:id/status/undo` | Saved postings. JSON-LD first, the Claude CLI when a page has none. Status runs Saved → Applied → Screening → Interview → Offer → Accepted / Rejected / Declined, or Dismissed; every move is logged and the latest can be undone |
| applications | `POST /api/jobs/applications`, `GET /api/jobs/applications/export`, `POST /api/jobs/applications/import`, `PATCH /api/jobs/applications/preferences`, `PATCH /api/jobs/applications/:id/resume` | Structured application entry, CSV tools, account favorites/archives and versioned resume attachments |
| interviews | `GET/PUT /api/jobs/:jobId/preparation` | Account-owned interview type, interviewer, instructions, notes and questions for the next interview. Opening the form does not create a record |

From `backend/`, `npm run check` runs types, lint, formatting and unit/architecture
tests. `npm run test:http` checks routes with fake dependencies. `npm run build`
builds the API; run `npm run build` in `frontend/` to build the web app.

`npm run test:integration` uses real Postgres and fake Google/AI providers. Set
`TEST_DATABASE_URL` to a database ending in `_test`, or it uses `cv_test` on the
same server as `DATABASE_URL`. Create that database once:

```bash
docker compose exec postgres psql -U cv -d postgres -c 'CREATE DATABASE cv_test;'
```

The integration runner applies migrations and adds unique synthetic data. It
does not reset the database. CI runs these checks on a separate test database.

[Product business logic](docs/business-logic.md) describes the growing experience
profile and planned application and interview preparation features.
[Backend architecture](docs/backend-clean-architecture-plan.md) explains the structure.
The [rewrite plan](docs/plan.md) tracks the migration steps and checks.
[Data backups](docs/data-backups.md) records the verified local snapshot and how
to restore saved app data later. The private backup files stay outside Git.
The [brand guide](docs/brand-guide.md) records the approved logo and site colors.

## Non-negotiable rules

1. Never state anything absent from the resume it came from.
2. Never move a technology between roles, and never back-date one.
3. No version numbers on a CV, unless crossing majors *is* the achievement.
4. Selection, reordering and rephrasing are the job. Invention is not.
5. Always report what could not be supported. That half matters more.
