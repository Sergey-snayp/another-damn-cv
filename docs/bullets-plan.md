# Bullets plan: why they exist, what goes wrong, what to build

Written 2026-11-13, after Quick Tailor proposed removing a key bullet (the TLS
certificate service) for Varonis and showed every bullet with score chips.

## 1. Why a CV has bullets at all

A bullet is **one piece of evidence for one thing the job asks for.** It has
three readers, in this order:

1. **A recruiter skimming.** Ladders' eye-tracking studies put the first screen
   at about 6 seconds (2012) and 7.4 seconds (2018). Recruiters look longest at
   job titles, then scan down the left edge (an "F" pattern). They read the
   *start* of a bullet, rarely the end.
2. **Keyword search (ATS).** The posting's terms have to appear somewhere, ideally
   inside a bullet that shows them used, not only in the Skills list.
3. **The interviewer.** Each bullet is a question they will ask: "tell me about
   the certificate service". A bullet the candidate can't talk about is a risk.

So a good bullet is **an achievement, not a duty**: what you did, how, and what
changed (Google's "X-Y-Z": accomplished X, measured by Y, by doing Z). It is
readable at a glance: **one idea, one to two lines, the important words first.**
Common guidance: 3 to 5 bullets for recent jobs, 1 to 2 for old ones. That is
advice from resume guides, not research, so treat it as a starting point.

Your own rules (UA Hub guideline, `cv` skill): two pages, impact over duties,
quantified claims, every bullet ends the same way.

## 2. What goes wrong today

| # | Problem | Why it happens (code) |
|---|---|---|
| 1 | **Important bullets get removed.** The TLS certificate service (your best story for workflow roles) was proposed for removal. | `bulletRange()` caps a job by its position: the first two jobs keep 3–5, then 1–3, then 0–2. Your current job has 9, so the AI *must* cut at least 4. The chooser ranks only by fit to the posting; it has no idea which bullets matter most to *you*. Its "starred first" rule reads stars the Profile no longer shows. |
| 2 | **Cuts have no reason you can check.** "Not needed for this job" for every cut. | The chooser returns ids, not reasons; a cut is just a bullet with empty text. |
| 3 | **Trivial rewrites shown as changes.** "DynamoDB/PostgreSQL" → "DynamoDB and PostgreSQL" in red and green. | Every reworded line becomes a suggestion, however small the change. |
| 4 | **Noise in the review.** Word count, a slider and 4 chips (Action verb, Metric, Time, Keywords) under every bullet, plus 3–4 buttons. | The writing meter from the Profile editor is reused in the tailoring review, where it doesn't help a decision. |
| 5 | **Too much bold.** Many tech words bolded per line, so nothing stands out. | Every skill on the CV is bolded wherever it appears. |
| 6 | **Bad job name in the header** ("Tailored for Varonis Careers - Apply for…"). | That job was saved before 0.57.0 fixed Jobvite titles. |

## 3. Principles for the new system

1. **Never lose a key bullet silently.** Some bullets are always kept, whatever
   the posting (your flagship work). Everything else may move or be cut, but a cut
   always says why.
2. **Cut by page budget, not a fixed count per job.** Two pages is the limit;
   when the CV fits, nothing has to go. When it doesn't, cut the weakest lines
   from the oldest jobs first.
3. **A cut needs a reason tied to the posting:** "repeats bullet 2" or "about
   React; this job doesn't use it". Never cut the only bullet that proves one of
   the posting's requirements.
4. **Change a line only when it gains something:** a posting term its facts
   support, or a clear fix. Wording-only edits aren't shown.
5. **Order beats rewording.** Within a job, the bullets the posting cares about
   go first. A recruiter reads the first two.
6. **The review asks for decisions, not scores.** Show what changes and why;
   hide meters.

## 4. What to build (phases)

**Phase 1: a quiet review (small, quick)**
- Remove the meter (word count, slider, chips) from Quick Tailor's review. Keep a
  short note only when a bullet has a real problem ("over 2 lines").
- Hide suggestions whose change is only punctuation or "/" → "and"; the line
  counts as "Already fits".
- One main button per bullet (Use / Keep), the rest in a small "⋯" (Swap, Try again).

**Phase 2: key bullets (the fix for lost bullets)**
- On the Profile, mark a bullet as **Key** (a pin). Key bullets are always kept
  for their job, first in their job, never proposed for removal.
- Until you mark any, the system infers them: bullets with a number *and* a
  named system you built (e.g. "Built from scratch a TLS certificate service…"),
  at most 2 per job. You can unpin.
- The chooser gets key bullets as fixed, and chooses only the remaining places.

**Phase 3: cut by page budget, with reasons**
- Replace `bulletRange()`'s fixed counts with a budget: measure the CV in lines
  (the PDF's page breaks are known), keep everything when it fits two pages, and
  when it doesn't, cut lines from the oldest jobs first, lowest-ranked first.
- The chooser returns a reason for each cut (repeat, not asked, weaker than X).
  A cut that is the only evidence for a requirement is refused.
- The review groups the job: **Changes**, **Kept as is**, **Suggested to drop**
  (collapsed, each with its reason). "Use all" never drops; drops are confirmed
  one by one or with "Drop these".

**Phase 4: readability**
- Order bullets within each job by fit to the posting (key bullets first).
- Bold only the posting's terms inside bullets, at most two per bullet.
- Flag bullets over 2 lines with a one-click "Shorten" (the AI, same facts).

**Phase 5: tidy job names**
- The tailoring header uses the saved job's title and company, and "Edit job" if
  the name looks like a page title ("X Careers - Apply for …").

## 5. How we'll know it works

- On your 9-bullet Ciklum job for Varonis: the TLS certificate service is kept;
  each cut shows a reason; nothing is cut when the CV fits two pages.
- The review shows no meters and no punctuation-only changes.
- Tests: a role with key bullets is never trimmed below them; a cut without a
  reason is rejected; trivial rewrites are filtered.

## Sources

- Ladders eye-tracking study (2018 update, PDF): https://csuglobal.edu/sites/default/files/blog-files/theladders-eyetracking-studyc2.pdf
- HR Dive on the 7.4-second figure: https://www.hrdive.com/news/eye-tracking-study-shows-recruiters-look-at-resumes-for-7-seconds/541582/
- Laszlo Bock's X-Y-Z formula (Inc.): https://www.inc.com/bill-murphy-jr/google-recruiters-say-these-5-resume-tips-including-x-y-z-formula-will-improve-your-odds-of-getting-hired-at-google.html
- Bullets per job and length (resume guides, not research): https://enhancv.com/blog/how-many-bullet-points-should-i-have-per-job-title-on-resume/ and https://www.rezi.ai/posts/how-many-bullet-points-per-job-on-resume
