# Product business logic

Status: agreed product direction. This document describes the intended behavior;
it does not mean every feature is built.

The proposed first feature is described in the [interview preparation plan](interview-preparation-plan.md).

## 1. Purpose

Help people apply for jobs and prepare for interviews using their real experience.
The core is a work history in Profile that grows as the user answers questions.
CVs, cover letters, application answers, and interview preparation use this history.

Interview support happens **before the interview**. Live answers, listening during
interviews, and live system design hints are outside the product scope.

## 2. The growing experience profile

Users can describe their work in plain text or bring existing CVs, documents,
project notes, and task descriptions. Future integrations can collect material
from GitHub and Jira for review.

For each company, role, and project, keep:

- Dates, responsibilities, and the user's personal contribution.
- Problems, actions, technical decisions, results, and lessons learned.
- Skills and technologies used in that specific role.
- Original notes, answers, and source links behind each claim.

Keep source material, user-confirmed facts, and AI drafts separate. Imported
material and AI suggestions need user review before they become confirmed facts.
A generated CV or answer must not become evidence for a new claim.

The profile owns the work history. A CV is a selected version of that history
for a particular job.

## 3. Learn through useful questions

1. The user adds a job opening or asks to improve their profile.
2. Compare the job requirements with the saved experience.
3. Ask a few focused questions about relevant work and missing details.
4. Let the user review and correct the proposed additions.
5. Save confirmed answers under the correct role or project and reuse them later.

Users can skip questions and return later. Remember previous answers and ask
deeper questions when useful. When new information conflicts with saved facts,
ask the user which is correct before replacing anything.

## 4. Product features

| Feature | Expected behavior |
| --- | --- |
| Application assistant | Fill forms from confirmed profile information and the selected CV. Suggest application answers for review; the user submits the application. |
| CV tailoring | Select relevant achievements and improve bullets and summaries for the job. Show changes and unsupported requirements for review. |
| Cover letters and communication | Draft letters, recruiter replies, and question answers using the user's experience and the specific application. |
| Interview preparation | Explain relevant strengths, missing information, and confirmed gaps. Prepare introductions, STAR stories, likely questions, and questions to ask the company. |
| System design preparation | Practise requirements, scale estimates, architecture, data models, failure handling, and trade-offs. Connect exercises to the user's real projects where relevant. |

Preparation uses the job opening, company information, interview stage, previous
conversation notes, and the exact CV sent. A screening call and a technical round
need different preparation.

The interview strategy explains which experience to highlight, which examples
to practise, which topics to study, and how to discuss gaps honestly. STAR means
Situation, Task, Action, and Result.

Show preparation as short hint cards with links to the relevant CV experience
and research sources. Company/product research can include web and Reddit
findings; community reports stay labelled separately from company facts.

## 5. Accuracy rules

- Never invent responsibilities, ownership, results, numbers, or technologies.
- Keep achievements attached to the correct company, role, and project.
- Distinguish personal contribution from team achievements.
- Keep unknown results unknown; ask for details instead of guessing.
- Separate company/job facts from predictions about likely interview questions.
- Keep the submitted CV version with its application. Later profile updates do
  not silently change documents already sent.

When comparing experience with a job, use three findings:

| Finding | Meaning and next action |
| --- | --- |
| Strong match | Confirmed experience supports the requirement. Prepare a clear example. |
| Missing information | The profile does not explain this yet. Ask the user. |
| Confirmed gap | The user confirms limited or no experience. Suggest study or practice and an honest explanation. |

Missing information alone is not a weakness. Practising a topic does not count
as professional experience.

## 6. Example: payments experience

A job asks for reliable payment systems. The profile mentions a payment platform
but lacks detail. Ask what the user personally built, whether they handled failed
payments or duplicate requests, which decisions they made, and what improved.

After review, save the answers under that project. Reuse them for relevant CV
bullets, a screening introduction, a STAR story, and technical preparation.
Each preparation session can add useful detail to the profile for future jobs.
