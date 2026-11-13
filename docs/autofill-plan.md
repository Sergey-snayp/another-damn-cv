# Autofill plan: catching up with Simplify

Status: research done (2026-11-12), nothing built yet.

How the extension recognizes and fills application fields today, how other autofill
extensions do it, and the work to close the gaps. The research comes from reading each
extension's shipped code (downloaded from the Chrome Web Store), not from their marketing.

## 1. Ours compared with Simplify

| | Simplify (3.1.14) | Ours |
| --- | --- | --- |
| Sites it fills on | Only its 58 known job sites. Elsewhere: "Autofill isn't supported on this site". | Any site, including company career pages with their own forms. |
| How it knows a field | Hand-written XPath rules per site and field: by `id`, then `name`, then label text. | Site rules for 47 sites ([site-fields.js](../extension/src/site-fields.js)), then guessing from the label ([fields.js](../extension/src/fields.js) `detectFields`) everywhere. |
| Depth of site rules | 61 entries for Greenhouse alone: second and third copies of a question, widgets inside sections, buttons to press. | "This `id` or `name` is this field". |
| Field types | About 164 (`veteran_v2`, `phone_stripped`, `city_state_full`, `behance`…). | About 35, plus diversity, "how did you hear", work setup and relocation. |
| How it fills a widget | Each rule names the method: `react`, `click`, `selectCheckboxOrRadio`, `uploadResume`. | Works out the control and uses a general filler: text, select, radio, combobox, file, drop zone. |
| Repeating sections | Presses "Add another" and fills each job and school. | Only current company, title, school and degree. |
| Custom questions | Collects every leftover field (label, section, options), sends them in one batch; AI answers all of them, optionally automatically. | Saved answers matched on the server automatically; an AI draft only on click, one question at a time. |
| Multi-step forms, frames | Per-site "Continue" buttons and embedded-form rules. | `all_frames` + `webNavigation`: each frame and step filled as it loads. |
| Knowing you applied | Per-site rules for the "submitted" page. | Notices the submit and marks the saved job Applied. |
| Wrong fills | "Report bad autofill" sends the case to Simplify. | No reporting. |
| Updating rules | Rules ship in the package (38 MB `remoteConfig.json`); the code also keeps a newer server-sent copy with a version. | In the code: every fix needs a release and a store review. |
| Site access | `*://*/*` | `http://*/*`, `https://*/*` |

## 2. How the others do it

| Extension (version read) | How it finds fields | Where its rules live | Custom questions | Unknown sites |
| --- | --- | --- | --- | --- |
| **Simplify** (3.1.14) | Per-site XPath rules, 164 field types, a fill method per rule. | In the package, plus a server-sent copy. | Batch to its server, AI answers all. | Not supported. |
| **Jobright** (1.26.3) | Per-site rules from the server, and **field discovery**: walks any form (shadow DOM too), gives each control and each piece of text an ID, matches labels by rules, and asks an AI model only for the fields the rules can't label. The model may only pick from the given IDs, and its answer is checked and thrown away if the page changed meanwhile. | Server (`/swan/autofill/site-rules`, refreshed every 15 min with ETag). | Server fills the form and streams answers back (`/swan/autofill/fill-v2-stream`); a server call also picks the right dropdown option (`autofill-option-resolve`). | Works: discovery is generic. |
| **Careerflow** (2.20.9) | Two modes. (1) For some sites it runs **Simplify's rule format** — the code calls it `createJobFormQuestionInstanceForSimplify`. (2) Its own per-site selectors for question blocks, labels and inputs; label texts go to its server, which returns a category for each ("First Name", "Sponsorship"…). Then a chain: same label answered before → category → fixed selector. | CDN JSON (`formSelectors.json` etc.), cached with a version check and a one-week limit. | Previously typed answers, matched by exact label. | Only sites with a published rule. |
| **Huntr** (2.0.45) | Per-site list of steps: `{ cssSelector, inputType, profileField, transforms, delay }`, with groups for repeating sections (`containerCssSelector`, `addFirstButtonCssSelector`, `addMoreButtonCssSelector`). Site picked by host or by a CSS selector being present. Special fill types per site (`workdayDropdown`, `icimsSearchableDropdown`, `smartRecruitersPhone` inside shadow DOM). | Server (`/job-source/application-autofills`). | None (AI is used only to read job postings). | Not supported. |
| **LazyApply** (0.8.95) | Collects every field as `{ question, type, options, placeholder }` and sends them with the whole resume to its server, which answers **every** field with AI. Board-specific bots for LinkedIn, Indeed and others; it submits on its own. | Server (`/workday-content/ids` and so on). | All answered by AI. | Only listed boards. |
| **ApplyAI** (1.3.0, small) | Keyword match on label + name + placeholder; open-ended questions go to Gemini with the user's own API key. | In the code. | Gemini. | Works, roughly. |
| **Teal** (4.0.8) | No form filling: it's a job tracker. | — | — | — |

**What everyone serious does:** keeps site rules as data on the server, so a broken site is
fixed the same day without a store review. Chrome allows this: the rules are data, not code
(remote code is forbidden, remote configuration is not).

**What only Jobright does, and is worth copying:** rules first, AI only for what the rules
can't label, with the model limited to choosing among IDs taken from the page. That keeps
our "works on any site" advantage while fixing unlabeled fields.

## 3. Work to do

Order matters: phase 1 makes every later fix cheap to ship.

### Phase 1 — site rules from the server

- [ ] Move [site-fields.js](../extension/src/site-fields.js) and the per-site parts of
      [sites.js](../extension/src/sites.js) into a JSON document served by the backend
      (`GET /api/extension/site-rules`), with a version and an ETag.
- [ ] The extension caches it in `chrome.storage.local`, refreshes it on start and every
      few hours, and falls back to the copy built into the package.
- [ ] Rules stay pure data (selectors, field keys, fill-type names). No code, no
      expressions that get evaluated: that's what keeps it inside store policy.
- [ ] Tests: an old cache, a failed fetch and a bad document all fall back safely.

### Phase 2 — AI answers for all open questions at once

- [ ] One request with every question the fill left empty: label, section heading,
      control type, options, required flag.
- [ ] Server: saved answers first, then one Claude call for the rest, using the profile
      and the job posting. Return `{ id, answer | declined, reason }` per question;
      decline instead of guessing (salary, legal and diversity questions stay with the user).
- [ ] For choice questions the answer must be one of the given options.
- [ ] Fill them, mark them as AI-written in the panel, and let the user save any of them
      as a saved answer.
- [ ] Setting: "Answer open questions with AI" (off, ask, on).

### Phase 3 — repeating sections

- [ ] Site-rule shape for a section: container, "add first" button, "add another" button,
      and the field rules inside one entry (Huntr's and Simplify's shape).
- [ ] Fill work history and education from the profile, newest first, up to the count
      the user picks.
- [ ] Generic fallback: an "Add another" / "Add experience" button next to a group of
      job fields.

### Phase 4 — field discovery for unlabeled fields (Jobright's approach)

- [ ] Snapshot of the form: each control and each nearby text gets an ID; no raw HTML.
- [ ] Our rules label what they can; only fields left without a label go to the model.
- [ ] The model returns `{ nodeIds, labelEvidenceIds, controlType }` from the given IDs
      only, checked against a schema; any mismatch, or a page that changed meanwhile,
      throws the answer away.
- [ ] Cache results per site and form so the same form doesn't ask twice.

### Phase 5 — deeper site rules

- [ ] More field types where forms ask for them: phone country, phone type, middle name,
      email confirmation, city + state together, more social links.
- [ ] Named fill types for widgets the general filler gets wrong (Workday dropdowns,
      iCIMS searchable dropdowns, SmartRecruiters fields inside shadow DOM, date pickers).
- [ ] Write and check each rule ourselves on a live form; don't copy another product's
      rule file wholesale.

### Phase 6 — report a bad fill

- [ ] "Wrong?" on each filled field in the panel: sends site, label, our field key, the
      control type and what we chose. Redact the value for personal fields.
- [ ] A list of reports in the app, to turn into site-rule fixes (shipped via phase 1).

### Phase 7 — when the panel opens by itself

How each one decides (read from their code):

| | Opens the panel by itself when | Otherwise | User controls |
| --- | --- | --- | --- |
| **Simplify** | The page matches a site rule (address, or a known form found inside the page) **and** the rules found fields to fill, or it read the job's title/company. Job boards (LinkedIn, Indeed) never open it: only the side button. | Side button only ("sticky"). | "Open the panel on job pages" on/off; hide on this site / everywhere; closing it is remembered for that address for the browser session. |
| **Jobright** | The site is one it supports (built-in per-site code), and the user's "Default view" is "Expanded" (the default). | Floating button. | Default view Expanded/Minimized; hide on this site / everywhere. |
| **Huntr** | Its site rules find the form fields, unless the user pressed "Set up later" (hidden until a reset date). | On a job posting (scored: schema.org JobPosting 40, Apply button 25, job-board domain 25, job sections 20…; 50+ = job) the button only animates. | "Set up later". |
| **Careerflow** | The address matches a published form rule; for some sites only after a given element appears (the form after "Apply" is clicked), watched as the page changes. | Floating button. | Per-organization switch. |
| **Ours** | Our check says it's an application form (CV upload + contact fields, or 3+ applicant fields on a job page, or 2+ fields on a known board) — on any site — or LinkedIn's Easy Apply dialog appears (a selected posting only shows the button). Once per address. | D! button, or nothing. | Hide this visit / on this site / everywhere. No "button only" option. |

- [ ] Setting "Open the panel automatically" (on / button only), separate from hiding the button.
- [x] LinkedIn: a selected posting shows the D! button only; the panel opens by itself when
      the Easy Apply dialog appears (2026-11-12).
- [ ] The same for Indeed and other boards: button on a posting, panel on the application form.
- [ ] Remember a closed panel for that address in `sessionStorage`, so a reload doesn't reopen it.
- [ ] With site rules from the server (phase 1), a rule match opens it at once instead of waiting for the form check.

### Later

- Per-site "application submitted" rules, to mark Applied more reliably.
- Per-site "Continue" buttons for multi-step forms.
