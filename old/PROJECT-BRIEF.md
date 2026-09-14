# Project brief: an evidence-backed job application system

## The problem

Every resume tool on the market treats a CV as text to rewrite. That is why they
hallucinate: nothing anchors a claim to reality, so "tailoring" slides into
invention. It is also why they forget: edits a user makes by hand never travel back
into the source, so the next generation silently undoes them.

## The idea

Treat a career as a **verified fact base with provenance**, not a document.

1. **Scan** the user's repositories and extract facts with evidence — commit share,
   schema size, stack, date ranges, ticket ranges.
2. **Select** per job posting: score the posting, choose the facts that answer it,
   and report honestly what could *not* be supported.
3. **Learn** from the user's own edits, folding them back into the fact base.

Nothing is generated that is not already in the base. The base can only grow through
scanning or explicit human confirmation.

---

## What already exists

All paths relative to `/Users/sergeypronyuk/Projects/CVs/`. This code works today and
should be reused, not rewritten.

### `sergey_proniuk_cv.json` (92 KB) — the fact base

The core data model. Top-level keys: `meta`, `profile`, `contact`, `summaries`,
`skills`, `projects`, `education`, `training`, `languages`.
Currently holds 79 skills, 8 projects, 25 achievements, 6 anchors.

**Skill shape:**
```json
{ "name": "PostgreSQL", "category": "database-sql", "years": 4, "level": "advanced",
  "usedIn": ["paymorrow", "symphonyai", "mavelich"],
  "aliases": ["Postgres"], "verified": true,
  "evidence": "invhub-api prisma postgresql; paymorrow card-scheme-api pg + db-migrate" }
```

**Achievement shape:**
```json
{ "id": "sy-tags", "problem": "...", "action": "...", "result": "...",
  "bullet": "dense one-line CV version",
  "technologies": [...], "keywords": [...],
  "verified": true, "evidence": "INVHUB-3845; migration 20240208124112",
  "weight": 5,
  "anchor": { "modelling": "...", "indexing": "...", "talkingPoints": [...] } }
```

Three fields carry the whole design:
- **`verified`** — true only with an `evidence` string naming a repo, commit, file or
  migration. False means self-reported.
- **`evidence`** — the provenance pointer. This is what makes the base auditable.
- **`weight`** (1–5) — how much the user wants this surfaced.

`anchor` holds interview-depth detail that never appears on the CV: architecture,
data model, known weak spots, and `talkingPoints`.

### `cv-tailor.mjs` (19.5 KB) — scoring, selection, rendering

Zero dependencies, Node 18+. Flags: `--report --anchors --compact --all --out
--role --summary --training`.

Reusable pieces:
- **`boldTech()`** — bolds real tooling inside bullets, ignores concepts
- **`analyse()`** — splits posting concepts into evidenced / self-reported / missing,
  weights by category and mention frequency, self-reported counts half
- **`rank()`** — scores projects and achievements against the posting
- **unique-coverage rule** — a project that is the only evidence for a required
  concept displaces the weakest survivor when trimming
- **`renderAnchors()`** — generates an interview brief instead of a CV

### `skills-taxonomy.json` (34.5 KB) — synonym dictionary

1,481 concept groups across `hardSkills`, `languages`, `softSkills`,
`toolsAndFrameworks`. Each group is a list of surface forms, so "Angular",
"Angular.js" and "AngularJS" collapse to one concept. Ambiguous acronyms carry
explicit word-boundary regexes.

### `md2pdf.mjs` (3.8 KB) — Markdown to PDF

Renders through headless Chrome. One column, Letter, ATS-safe, reports page count.

### `AGENT-BRIEF.md` (18 KB)

The complete verified career record in prose, with per-role "NOT present" sections.

---

## What to build

### 1. Scanner — the piece nobody else has

Walks a directory of repositories and proposes facts with evidence.

Extraction rules, all proven manually:

| Source | Fact produced |
|---|---|
| `package.json` dependencies | stack, frameworks, databases |
| `git shortlog -sn --all` | **your commits vs total** — the number nobody can fake |
| `git log --author --format` | date range, and achievements from commit subjects |
| `prisma/schema.prisma`, `migrations/`, `models/` | model and migration counts |
| `serverless.yml`, `cdk/`, `buildspec.yml`, `.gitlab-ci.yml` | deployment and CI |
| `*.feature`, `jest.config`, `test/` | testing approach and suite counts |
| `docker-compose.yml`, `kafka/topics*.json` | infrastructure, topics, partitions |
| file and line counts | scale |
| `.git/config` remote | employer or client attribution |

**Critical design rule: the scanner proposes, the human confirms.** Code cannot tell
whether the user introduced a dependency or merely worked beside it. Unconfirmed
facts enter as `verified: false` with no `evidence`. This is the difference between
this tool and a plausible-lie generator.

Handle broken repositories: some have corrupted packfiles (`git log` fails). Fall
back to the working tree and `package.json`, losing attribution but keeping stack.

Run it while repository access still exists — the most valuable experience lives in
client repos the user loses on leaving. Store facts, never client code.

### 2. Edit sync — captures the user's own work

```
generate → user edits externally → sync back → diff → confirm → commit
```

Diff the edited resume against the last generated version and classify each change:

- **Rephrasing** → update `bullet` in the fact base; the user's wording wins from
  then on
- **New content** → ask "is this true, and where is the evidence?" before admitting
  it, as `verified: false` until answered
- **Deletion** → lower `weight`, never delete. Three deletions in a row teaches the
  system that role is not wanted

Record authorship per bullet: generator or human. Human wording is never overwritten.

### 3. Browser extension — autofill

Manifest V3, content scripts on ATS platforms. Start with **Greenhouse, Lever,
Ashby** — they cover most startup applications. Skip Workday initially; it is
multi-step with iframes and shadow DOM and consumes disproportionate effort.

Field matching is mostly heuristic: normalise `<label>`, `name`, `id`, `aria-label`,
`placeholder` and match against a category synonym list. A per-site selector file
handles only the non-standard cases.

Two mechanics that are not obvious:

```js
// React-controlled inputs ignore input.value = x — the field clears on submit
const setter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'value').set;
setter.call(input, value);
input.dispatchEvent(new Event('input', { bubbles: true }));

// Attaching the resume PDF
const dt = new DataTransfer();
dt.items.add(new File([pdfBlob], 'Name - Role Resume.pdf', { type: 'application/pdf' }));
fileInput.files = dt.files;
fileInput.dispatchEvent(new Event('change', { bubbles: true }));
```

Also inject an on-page banner using `cv-tailor.mjs` output. Show the **covered and
missing lists, not a score** — the number is a vanity metric, the missing list is
what the user acts on.

Field categories, taken from a real implementation: Personal Information, Location,
Documents, Education, Experience, EEO, Work Authorization, Social & Links.

### 4. Version history and application log

`git init` in the data directory gives history and diffs for free.

Per application, store a manifest alongside the generated files:

```json
{ "company": "MaintainX", "role": "Backend Engineer, Platform Engineering",
  "appliedAt": "2026-09-11", "masterCommit": "a3f9c21",
  "coverage": 95, "summaryVariant": "highload",
  "claimed": ["GraphQL at scale", "Nx monorepo platform work"],
  "notClaimed": ["Kubernetes in production", "built a developer platform"],
  "sentFile": "Sergey Proniuk - Backend Engineer Resume.pdf" }
```

`masterCommit` lets any sent resume be reproduced exactly weeks later.
`notClaimed` is the interview-prep list for that specific application.

### 5. Cover letters

From the same base, no separate logic. Three paragraphs: why this company and role;
the one project answering their hardest requirement; the honest gap and what is
being done about it. Naming the gap outperforms hiding it.

---

## Non-negotiable rules

1. Never state anything absent from the fact base.
2. Never move a technology between roles, and never back-date one. A framework
   version pins work to a year.
3. **No version numbers on a CV** — "NestJS", not "NestJS 11". Exception: when
   crossing major versions *is* the achievement.
4. Selection, reordering and rephrasing are the job. Invention is not.
5. Always report what could not be supported. That half matters more than the resume.

## Output format rules (Canadian/US market)

Two pages. One column, for ATS parsing. Header repeats the vacancy title verbatim.
Quantify everything. Impact over duties. Consistent bullet punctuation. No languages
section, no hobbies, no personal data. Contract work under one employer with projects
nested inside.

## Privacy

The fact base holds phone, email and full employment history. Keep the repository
local or private, never public.
