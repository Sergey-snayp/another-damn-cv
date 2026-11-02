# CV Platform

A job-application workspace: save postings from any site, track them on a board,
and tailor a resume to each one without ever claiming something you have not done.

```
backend/     NestJS API + Postgres (Prisma)
frontend/    React + Vite web app
extension/   Chrome side panel: autofills applications, sends jobs to the app
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
Reading job pages and tailoring use the local Claude CLI (`CLAUDE_BIN`), signed in once.

The extension is loaded separately: `chrome://extensions` → Developer mode →
**Load unpacked** → select `extension/`. See `extension/README.md`.

## Workspace

- **Dashboard** tracks active and archived applications in Board, List or Chart
  view. Search by role/company; filter by applied dates, job type, status and
  favorites. Drag cards or use their Move menu; recent moves and archives offer Undo.
- **Documents** holds resumes, previews, editing, history and tailoring review.
  Old `/resumes` bookmarks redirect here.

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
| `profiles` | `GET/PUT /api/profile`, `GET/POST /api/profile/sync-token`, `GET /api/profile/sync` | What application forms ask for; synced to the extension |
| `cv-import` | `POST /api/import/cv` | Reads PDF, DOCX, TXT or Markdown into an unsaved draft for review |
| `resumes`, `resume-rewrite` | `GET/POST /api/resumes`, `GET /api/resumes/:id`, `POST /api/resumes/:id/save`, history, diff, revert, rewrite | Versioned resumes: changed saves add snapshots; unchanged saves add none |
| `jobs` | `POST /api/jobs/capture` (extension token), `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id`, `POST /api/jobs/:id/reread`, `POST /api/jobs/:id/status/undo` | Saved postings. JSON-LD first, the Claude CLI when a page has none. Status runs Saved → Applied → Screening → Interview → Offer → Accepted / Rejected / Declined, or Dismissed; every move is logged and the latest can be undone |
| tailoring | `POST /api/jobs/:id/tailor`, `GET/DELETE /api/resumes/:id/tailoring` | Copies a resume per job and suggests a summary and bullets in the posting's words. A word-level check discards any number or technology a role does not contain; every line is reviewed before saving |
| applications | `POST /api/jobs/applications`, `GET /api/jobs/applications/export`, `POST /api/jobs/applications/import`, `PATCH /api/jobs/applications/preferences`, `PATCH /api/jobs/applications/:id/resume` | Structured application entry, CSV tools, account favorites/archives and versioned resume attachments |

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

[Backend architecture](docs/backend-clean-architecture-plan.md) explains the structure.
The [rewrite plan](docs/plan.md) tracks the migration steps and checks.

## Non-negotiable rules

1. Never state anything absent from the resume it came from.
2. Never move a technology between roles, and never back-date one.
3. No version numbers on a CV, unless crossing majors *is* the achievement.
4. Selection, reordering and rephrasing are the job. Invention is not.
5. Always report what could not be supported. That half matters more.
