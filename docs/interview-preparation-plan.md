# Interview preparation plan

Status: the workspace is built. Company research and AI hint cards are planned.
Product rules are in [business-logic.md](business-logic.md).

## 1. Available now

**Interview Prep** lists active Screening and Interviewing jobs. Click or tap a
card to open preparation. Cards show the company, role, status, location, date,
and whether a CV is attached. **Original posting** stays a separate link. Users
change the schedule and CV inside preparation. **View job opening** and **View
application CV** open separate reference pages, each with **Back to preparation**.
The CV page shows the exact attached version. Users save
the interview type, interviewer, instructions, notes, and questions. Unsaved
changes stay as browser drafts.

Application status and interview type are separate. Screening can involve HR or
a technical screen; users choose the specific type. Multiple rounds remain planned.

## 2. Two new actions in the workspace

| Action | Inputs | Result |
| --- | --- | --- |
| **Research company** | Company, public job context, optional company website | Short company/product cards and relevant web or Reddit findings, with sources and research date |
| **Generate my hints** | Saved job description, interview type, attached CV version, saved instructions and notes; existing research if available | Short prompts about what to highlight, examples to prepare, topics to review, and questions to ask |

Hints also work without research. Select a CV and interview type, and save edited
notes before generation. Browser drafts are not used as saved inputs.

Use at most three cards per section and one to three short bullets per card.
Keep source details expandable. Use speaking prompts rather than long reports
or answer scripts.

Example hint card structure:

- **Highlight:** payment reliability, if the opening asks for it.
- **Your evidence:** the relevant CV bullet, with its company, role, and version.
- **Talking cues:** the problem, your own contribution, and the supported result.
- **Clarify:** a focused question about details the CV does not explain yet.

## 3. Company and project research

- Match the company using the job's product, role, location, and website. Ask for
  clarification when the company is ambiguous.
- Start with the posting, official company pages, product information, and public
  technical material. Explain what the product does and why it matters to this role.
- Label Reddit and other community accounts as personal reports, with links and
  dates where available. One post does not establish the company's interview process.
- Keep source links with each finding. Show missing or uncertain information
  clearly; do not invent findings or links when research fails.
- Turn unknown internal project, architecture, or team details into questions.
- Research uses public company/job context. Keep CV details and personal work
  notes out of web search queries.

## 4. Personal hints

| Section | What to show |
| --- | --- |
| What to highlight | A job requirement matched to an actual CV achievement, plus a short speaking prompt |
| Examples to prepare | Likely questions and brief answer outlines, using the user's own projects |
| Topics to review | Relevant topics to practise and missing details to clarify |
| Questions to ask | Questions about the company, product, team, and role |

Adapt hints to the interview type. For HR, focus on a short introduction,
motivation, and relevant experience. For technical or system design rounds,
focus on decisions, requirements, scale, data, failures, and trade-offs.

Never invent technologies, metrics, ownership, or results, or move achievements
between employers. Missing information is not a confirmed weakness. Keep CV
statements, user notes, company facts, and community reports distinguishable.
Predicted interview questions are practice suggestions, not inside information.

Follow-up answers stay in preparation notes until the future work-history feature
allows reviewed additions to Profile. AI output is never evidence for new claims.
All support is used before the interview.

## 5. Claude CLI now, API later

Reuse the existing Claude CLI connection through replaceable research and hint
interfaces in `interviews`. CLI code belongs in outbound adapters.

The current runner disables web tools. Add a research mode limited to web search
and page reading; keep file, shell, and MCP tools disabled. Hint generation uses
only supplied context. Existing CV operations keep their current settings.

Use the signed-in Claude account locally. Calls consume account usage; API-key
authentication can use separate API billing. See [Anthropic's authentication guidance](https://support.claude.com/en/articles/12304248-manage-api-key-environment-variables-in-claude-code).
Add an API adapter later behind the same interfaces. [Claude CLI supports non-interactive execution](https://code.claude.com/docs/en/headless).

## 6. Keep usage small

- Run AI only when the user clicks an action, never on page load or every edit.
- Save research separately from personal hints. Changing a CV should not repeat
  company research. Reopening a preparation reuses saved results.
- Send only relevant context, limit search steps and output size, and return
  structured cards instead of long prose.
- Save the research date, source links, CV version, and input identity with results.
  If inputs change, mark hints as needing an update; regeneration stays manual.
- Failed calls keep previous results and user notes. Prevent duplicate running
  requests for the same action and job.

## 7. Build and check

- [x] Interview collection, workspace, schedule, CV reference, and manual notes.
- [ ] Add provider interfaces and separate CLI modes; check login, model, and web
      tool availability with clear errors for missing access or usage limits.
- [ ] Add sourced company research, compact personal hints, and independent caches.
- [ ] Add the two workspace actions, hint cards, source details, and update states.
- [ ] Verify structured output, valid source references, ownership, cache reuse,
      changed CV/notes, failed searches, and desktop/mobile behaviour using fakes.
- [ ] Later: reviewed work history in Profile, GitHub/Jira imports, multiple
      interview rounds, and an API provider.

`interviews` owns these use cases and saved outputs. Read jobs and CV versions
through public interfaces and follow [the architecture guide](backend-clean-architecture-plan.md).
Generation must not edit the CV or Profile. Badge job `4449681804` can be used to
review the proposed experience without assuming its interview format.
