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
docker compose up -d                                                        # Postgres on :5433
cd backend  && npm install && cp .env.example .env && npx prisma migrate deploy && npm run start:dev   # :3001
cd frontend && npm install && npm run dev                                   # :5173
```

The frontend proxies `/api` to the backend, so there is no CORS setup in dev.
Sign-in is Google; set `GOOGLE_CLIENT_ID` and `SESSION_SECRET` in `backend/.env`.
Reading job pages and tailoring use the local Claude CLI (`CLAUDE_BIN`), signed in once.

The extension is loaded separately: `chrome://extensions` → Developer mode →
**Load unpacked** → select `extension/`. See `extension/README.md`.

## Backend

| Module | Routes | What it does |
|---|---|---|
| `auth` | `GET /api/auth/config`, `POST /api/auth/google`, `POST /api/auth/extension`, `GET /api/auth/me`, `POST /api/auth/logout` | Google ID-token sign-in, sessions in Postgres. The extension uses a bearer sync token instead |
| `profile` | `GET/PUT /api/profile`, `GET/POST /api/profile/sync-token`, `GET /api/profile/sync` | What application forms ask for; synced to the extension |
| `import` | `POST /api/import/cv` | Reads a PDF or DOCX into a draft resume for review |
| `resume` | `GET/POST /api/resumes`, `GET /api/resumes/:id`, `POST /api/resumes/:id/save`, history, diff, revert, rewrite | Versioned resumes: every save is a snapshot, nothing is overwritten |
| `jobs` | `POST /api/jobs/capture` (extension token), `GET/POST /api/jobs`, `GET/PATCH/DELETE /api/jobs/:id`, `POST /api/jobs/:id/reread`, `POST /api/jobs/:id/status/undo` | Saved postings. JSON-LD first, the Claude CLI when a page has none. Status runs Saved → Applied → Screening → Interview → Offer → Accepted / Rejected / Declined, or Dismissed; every move is logged and the latest can be undone |
| tailoring | `POST /api/jobs/:id/tailor`, `GET/DELETE /api/resumes/:id/tailoring` | Copies a resume per job and suggests a summary and bullets in the posting's words. A word-level check discards any number or technology a role does not contain; every line is reviewed before saving |

Checks: `npm run check` runs the type check, lint, format check and tests.

## Non-negotiable rules

1. Never state anything absent from the resume it came from.
2. Never move a technology between roles, and never back-date one.
3. No version numbers on a CV, unless crossing majors *is* the achievement.
4. Selection, reordering and rephrasing are the job. Invention is not.
5. Always report what could not be supported. That half matters more.
