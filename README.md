# CV Platform

An evidence-backed job application system. A career is kept as a verified fact
base with provenance, not a document.

```
backend/     NestJS API — fact base, tailoring, scanner, application log
frontend/    React + Vite — the web UI
extension/   Chrome side panel — autofills applications
old/         everything from before the restructure
```

## Run it

```bash
cd backend  && npm install && cp .env.example .env && npm run start:dev   # :3001
cd frontend && npm install && npm run dev                                  # :5173
```

The frontend proxies `/api` to the backend, so there is no CORS setup in dev.

The extension is loaded separately: `chrome://extensions` → Developer mode →
**Load unpacked** → select `extension/`.

## Backend

`.env` points at the fact base and the scan root:

```
PORT=3001
FACTBASE_PATH=/Users/sergeypronyuk/Projects/CVs/sergey_proniuk_cv.json
DATA_DIR=./data
SCAN_ROOT=/Users/sergeypronyuk/Projects
```

Four modules, mirroring the brief:

| Module | Routes | State |
|---|---|---|
| `factbase` | `GET /api/factbase`, `/stats`, `/skills`, `/achievements`, `/profile`, `PUT /api/factbase` | **working** — reads and writes the real JSON |
| `applications` | `GET/POST /api/applications`, `PATCH /api/applications/:id` | **working** — flat JSON log |
| `scanner` | `GET /api/scanner/repos`, `POST /api/scanner/scan` | partial — package.json and git remote; commit attribution still to do |
| `tailor` | `POST /api/tailor/analyse`, `POST /api/tailor` | **stub** — port `CVs/cv-tailor.mjs` |

`src/shared/` holds the types that describe the whole design: `verified`,
`evidence` and `weight` on every fact.

### Porting the tailorer

`TailorService` deliberately returns everything as **missing** until the real
logic lands. A stub that over-reports coverage would put unsupported claims on a
real application, so it fails closed.

What to bring across from `CVs/cv-tailor.mjs`:

- `analyse()` — split posting concepts into evidenced / self-reported / missing
- `rank()` — score projects and achievements against the posting
- unique-coverage rule — a project that is the only evidence for a required
  concept displaces the weakest survivor when trimming
- `boldTech()` — bold real tooling inside bullets, leave concepts alone
- `renderAnchors()` — interview brief instead of a CV

## Frontend

A shell that proves the wiring: it reads `/api/factbase/stats` and shows the
counts. The screens from the brief go in from here — fact review, coverage per
posting, scanner confirmation, the application log.

## Extension

Chrome Side Panel, MV3. Greenhouse, Lever, Ashby. Profile lives in
`chrome.storage.local`, so it works with the backend off; `GET /api/factbase/profile`
exists for when you want to sync instead. See `extension/README.md`.

## Non-negotiable rules

1. Never state anything absent from the fact base.
2. Never move a technology between roles, and never back-date one.
3. No version numbers on a CV, unless crossing majors *is* the achievement.
4. Selection, reordering and rephrasing are the job. Invention is not.
5. Always report what could not be supported. That half matters more.

## old/

Everything prior to the restructure: the job-agent harvester and scorer
(`old/src`), the earlier monorepo attempt (`old/apps`, `old/packages`), the
project brief, and the harvested SQLite database. Nothing here is wired to the
new apps.
