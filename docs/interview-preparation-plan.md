# Interview preparation plan

Status: proposal for review. Implementation has not started.
Product rules are in [business-logic.md](business-logic.md).

## Goal

Add preparation inside the app for a selected job and interview stage. Help the
user explain relevant experience, identify what needs clarification or practice,
and decide what to highlight. Everything is used before the interview.

## First version

Entry point: **Prepare for interview** on a saved job. Keep Dashboard and
Documents as the main navigation items.

The user chooses:

- Interview stage: screening, technical, behavioural, system design, or final.
- The CV sent with the application, or another saved CV.
- Optional interview instructions, company notes, and work experience in text.

The preparation page shows:

- A short introduction outline and a strategy for this role and stage.
- Relevant strengths, linked to the user's actual experience.
- Missing information and user-confirmed gaps, shown separately.
- Likely questions with speaking outlines and relevant examples to prepare.
- Questions to ask the company and an ordered practice checklist.
- A few follow-up questions that help explain the user's work in more detail.

For system design, include practice prompts for requirements, scale, architecture,
data, failures, and trade-offs. Suggested study topics are not work experience.

## Build order

1. **Preparation page:** choose inputs, generate a report, save it with the job,
   and reopen it later. Preserve the exact CV version and source material used.
2. **Work history in Profile:** save user-written notes under company, role, and
   project. Let the user review follow-up answers before adding them. Support
   editing and removal; keep these notes independent of a particular job.
3. **Improve preparation:** use confirmed answers in the next report, avoid
   repeated questions, and show when inputs changed since generation.

Use the existing AI connection. For the first version, company context comes
from the job posting and user-supplied notes. Automatic company research and
GitHub/Jira imports can be planned separately.

## Code and data ownership

- `interviews` owns preparation use cases, reports, and saved interview inputs.
- `experience` owns user-confirmed work notes and their sources, shown in Profile.
- Read jobs and CV versions through their public module interfaces. Follow the
  existing [backend architecture](backend-clean-architecture-plan.md).
- Generated text stays separate from confirmed experience. Regenerating a report
  does not edit a CV or add facts to Profile automatically.

## Done when

- A user can prepare for a saved job and reopen the report after refreshing.
- Stage selection changes the preparation; missing experience leads to questions.
- Each experience example shows its source and stays with the correct role.
- A reviewed answer becomes a Profile note and helps future preparation.
- Failed generation keeps the previous report and the user's entered answers.
- Users can access only their own jobs, CVs, notes, and reports.
- Backend checks and desktop/mobile browser checks pass.

## First example to review

Badge — Software Engineer, Product (Fullstack), LinkedIn job `4449681804`.
Added to Dashboard as Interviewing; the user said the interview is tomorrow
(November 2, 2026, America/Vancouver). Interview time and stage are not specified.
Use the supplied posting to review whether the proposed preparation is useful;
do not assume Badge's interview format.
