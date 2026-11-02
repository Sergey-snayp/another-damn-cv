# Interview preparation plan

Status: the Interview Prep collection and filled preparation workspace are built.
Preparation generation and the growing work history remain planned.
Product rules are in [business-logic.md](business-logic.md).

## Goal

Add preparation inside the app for a selected job and interview stage. Help the
user explain relevant experience, identify what needs clarification or practice,
and decide what to highlight. Everything is used before the interview.

## First version

Entry point: **Interview Prep** in the main navigation, beside Dashboard and
Documents. Active jobs in Screening or Interviewing appear automatically.
Saved, Applied, closed, and archived jobs stay out of this collection. The page
uses the same saved jobs as Dashboard; no separate copies are created.

Available now: search, status filters, original postings, and links to the exact
application CV version. Open a card to enter its preparation workspace. Dashboard
card menus also open that workspace for active interview jobs. Change application
status on Dashboard to manage the list.

Each job can also keep its next interview date, optional time, and time zone.
Set, change, or remove it from Interview Prep or the job details. Dates save to
the account and sort upcoming interviews first, then undated jobs, then past
interviews. A date without a time does not imply a midnight appointment.
Separate schedules and preparation for multiple rounds remain planned.

The workspace is filled with the saved job opening, schedule, application CV,
and previous preparation. It shows experience from the exact attached CV version.
Set the interview type and interviewer, then save recruiter instructions, personal
notes, and questions to ask. Preparation saves to the account. Unsaved changes
stay as a browser draft until saved or discarded; they do not update Profile.

Application status and interview type are separate. Screening is the initial
screening stage and may involve a recruiter or a technical screen. Interviewing
covers later rounds. Choose the specific type in the workspace; it is not guessed
from application status.

The next step is generated preparation guidance inside this workspace:

- A short introduction outline and a strategy for this role and stage.
- Relevant strengths, linked to the user's actual experience.
- Missing information and user-confirmed gaps, shown separately.
- Likely questions with speaking outlines and relevant examples to prepare.
- Questions to ask the company and an ordered practice checklist.
- A few follow-up questions that help explain the user's work in more detail.

For system design, include practice prompts for requirements, scale, architecture,
data, failures, and trade-offs. Suggested study topics are not work experience.

## Build order

1. **Workspace (done):** filled job context, schedule, CV reference, interview
   type, and account-saved notes, with browser draft recovery.
2. **Preparation guidance (planned):** generate and save a report for the chosen
   interview type. Preserve the exact CV version and source material used.
3. **Work history in Profile:** save user-written notes under company, role, and
   project. Let the user review follow-up answers before adding them. Support
   editing and removal; keep these notes independent of a particular job.
4. **Improve preparation:** use confirmed answers in the next report, avoid
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
