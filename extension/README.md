# Another Damn CV

A Chrome extension that recognises job application forms on any site and fills
them from your profile, with a CV from the app. It also sends job postings to the app.

It talks only to your own app (`localhost:3001` and `:5173`); there is no telemetry.

## Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the icon, click it, sign in on the **Profile** tab, and choose a CV in
   the **Resume** tab

After updating the extension files, click **Reload** on its card in
`chrome://extensions`, then reload the pages you had open.

## The panel

The panel opens automatically when a job application form is detected, including
forms loaded later or embedded in an iframe. It opens inside the page, on its
right edge, over the page content. Closing it keeps it closed on that page;
it can open automatically again on another application page.
Open it again with the D! button on the page edge or the toolbar icon; collapse it with
its `>` button or Esc. The D! button's × offers **Hide until next visit**, **Disable
on this domain** or **Disable on all pages**; Settings in the panel turns the
last two back on. These choices also stop automatic opening. Collapsing the panel always brings the D! button back on
that page, even where it was hidden. It reopens after you move to another page in the same tab.

- The extension runs on every site, so the panel opens anywhere from the
  toolbar icon. Chrome lists this as "Read and change all your data on all
  websites". Opening reads the form and prepares the panel; saving a job and
  filling its application are actions you choose.
- Your own app (`localhost:5173`, `localhost:3001`) is excluded.
- Chrome pages (`chrome://`, the Web Store) cannot show it.

The job logo, title and company sit inside one clickable frame: green with a
check when saved, or gray with a plus when unsaved. Both open the same details
form on a separate panel page. Saved jobs load their current backend details;
**Save changes** updates that job. **Save Job** adds an unsaved job. **Back**
returns to Autofill and keeps an edited draft; **Cancel** discards it. The frame
also supports Enter and Space. Opening it never redirects to the web app.

## When the panel opens automatically

`src/job-form.js` decides, on every site, whether the page looks like a job
application form and should open the panel (or show the D! button after you close it):

- a CV/resume upload together with name or email fields, or a CV upload on a
  page with a job sign;
- or one form with 3+ applicant fields (name, email, phone, LinkedIn, location…)
  on a page with a job sign: apply, application, job, career, vacancy, position,
  CV, resume, вакансія, резюме… in the address, title, headings or buttons;
- on the known job boards in `src/sites.js`, a resume field or any 2 fields.

Some pages (Greenhouse's job boards, built with React/Remix) replace their
whole `<html>` element while starting, which removed the D! button. The page
watcher observes the document itself, and the button, panel and icons put
themselves back after any change. `test/rebuild.html` covers this.

Forms with a password, card fields or a search box never count. Ordinary sites
are rescanned less often than job boards, and pages without inputs are skipped.
`test/job-form.html` checks these rules against sample pages:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --virtual-time-budget=3000 \
  --dump-dom "file://$PWD/test/job-form.html" | grep -o '<pre id="result">.*</pre>'
```

The panel is `src/sidepanel.html` in an iframe. The page cannot read inside it,
and page styles do not reach it. Sites can tell the extension is installed by
probing that file; they cannot see your data.

The D! logo is packaged in `assets/brand/d-stamp-logo.png` so the extension works
on its own. It is an unchanged copy of the approved artwork in
`../frontend/public/brand/d-stamp-logo.png`. Chrome scales it for its icon sizes.

## Colors

The extension uses the main app's palette from `frontend/src/theme/colors.css`.
The web app's `npm run dev` and `npm run build` copy it into the extension.
To sync colors directly, run `node extension/scripts/sync-theme.cjs` from the
project root, then reload the extension. The generated copy in
`extension/assets/theme/colors.css` is packaged for standalone use; do not edit it.

## Use it

Open any job application form, for example:

```
https://boards.greenhouse.io/<company>/jobs/<id>
https://jobs.lever.co/<company>/<id>/apply
https://jobs.ashbyhq.com/<company>/<id>/application
```

The D! button appears on the page's right edge. Open the panel to see which
fields were recognised and whether you have a value for each. Press **Autofill
This Page**, then review everything before submitting.

**Nothing is filled until you press Autofill This Page, and it never submits
anything.** Opening the panel, rescanning and page loads only read the form.
`content.js` accepts a fill request only from the panel.

## CVs

The **Resume** tab shows the CV that **Autofill This Page** uploads, as
`<CV name>.pdf` (sign in on the Profile tab first). **Change** opens the list
of CVs from the app's Documents to pick another. Your primary CV is chosen
until you pick another. The Autofill tab's Resume card has the same switcher. Text fields still come
from your profile, not from the CV.

The list comes from `GET /api/extension/resumes`, the same backend collection
as Documents, including job-tailored copies. Each panel fetches it before
showing CVs, on reopening, after app changes, and every 15 seconds while open
and visible. A list from an older visit is never displayed. Empty responses,
deletions and failed requests clear the picker; requests from an earlier
sign-in cannot restore that account's documents.

Quick Tailor names its application copy `full_name_CV_company_job_role`, for
example `Sam_Lee_CV_Paymorrow_Payments_Engineer`. It uses the name on the chosen
CV (or your profile if the CV's name is missing) and the saved job details.
Its exported PDF uses the same name with `.pdf`, including company and role.
Generated names use single underscores for spaces and punctuation. The role
omits parenthetical, team and location suffixes and
is limited to six words and 40 characters; the entire name stays under 120
characters. Previewing remains read-only; Save upgrades older automatic names.
Reopening a copy keeps a name you chose yourself.

Opening Quick Tailor only reads the source CV into an unsaved draft. It creates
no CV document, snapshot or PDF, and does not add anything to Documents or the
extension's CV list. Closing without saving discards that draft.

**Undo** and **Redo** move through edits in the current tailoring session,
including skills, education and accepted AI suggestions. They stay available
after Save and never save or generate a PDF themselves. Ctrl/⌘ Z undoes a
committed edit; Ctrl/⌘ Shift Z or Ctrl Y redoes it. While typing in a line, the
browser's normal text undo applies. A new edit after Undo replaces the redo path.
**Reset** restores the CV as it was when this tailoring session opened, including
all sections. Reset can be undone and only changes the draft; press **Save** to
replace already saved edits with the restored content.

Education entries can leave **Degree** blank for courses and training. The CV
and PDF show the provider and course without a degree placeholder or extra
comma. Hover or focus an entry and use its small **+** to add a degree later;
clear an existing degree to omit it again.

Quick Tailor's **Save** button creates the CV with the edited content first,
then creates its PDF and makes that CV the extension's choice. Saving again
reuses that document. Export becomes available after Save succeeds.

The app stores PDFs made by an explicit Save action. The extension only
downloads them from `GET /api/extension/resumes/:id/pdf`; it never starts PDF
generation. If a PDF is missing or no longer matches the saved content/design,
save the CV in Quick Tailor (or use **Save & export PDF** in the full editor)
before uploading it. Other fields can still fill when a PDF is not ready.

`node --test extension/test/*.test.mjs` from the repository root checks keyword
matching, display text and backend document synchronization. Open
`extension/test/profile-tab.html?sync` in Chrome with file access enabled to
check the real panel against empty, added, renamed and deleted backend CVs.

PDFs added to the extension by hand before 0.13.0 are removed on update.

## Keyword match

On a job description page, the Autofill tab shows how many of the posting's
keywords your chosen CV mentions, as a 0-100 score: Strong (80+), Good (60+),
Fair (40+) or Low. It counts keywords only and does not judge experience depth.

- Keywords come from a fixed list of about 250 skills in `src/match.js`, with
  spellings that count as one ("node", "nodejs", "Node.js"). Skills under
  Requirements or mentioned twice count double; "nice to have" counts once.
- The page is read with the same capture as Send job. The card appears only for
  the page's own JobPosting data, a site rule (LinkedIn, Indeed…), or a
  description with requirement/responsibility sections and 3+ skills.
- Each CV's text (no contact details) comes from
  `GET /api/extension/resumes/:id/text` and is kept until the CV changes. If
  another CV scores 10+ points higher, the card offers to switch.
- **Improve my match** saves the job and opens it in the app with the chosen CV
  selected for tailoring. Tailoring runs only when you press its button there.

`node --test test/match.test.mjs` checks the matching rules.

## Send a job to the app

On any job page — LinkedIn, Indeed, a company's careers page — open the
panel and press **Send this job to the app**. Sign in on the Profile tab first.

- It reads the page only when you press the button.
- On search pages (LinkedIn, Indeed, Glassdoor) it captures the open job, not
  the list beside it. The rules for that are in `src/capture-sites.js`; when a
  site changes its layout, that is the file to update.
- Sending the same job again updates it and keeps your edits and status.

`test/capture.html` runs the capture script against a LinkedIn-shaped page:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --virtual-time-budget=3000 \
  --dump-dom "file://$PWD/test/capture.html?site=linkedin"
```

## How it works

```
fields.js    finds inputs and guesses what each one is
filler.js    writes values in a way React accepts
content.js     answers the panel's scan and fill requests
launcher.js    the D! button on the page edge
job-form.js    decides whether a page looks like a job application form
match.js       keyword match between a posting and your CVs
panel-host.js  puts the panel frame into the page; opens and closes it
background.js  toolbar icon, adding the panel to other sites, reopening after loads
sidepanel.js   the panel itself; stores your profile in chrome.storage.local
resumes.js     your app CVs, which one Autofill uploads, and its PDF
```

**Field detection** gathers every signal an input carries — its `<label>`,
`name`, `id`, `aria-label`, `placeholder`, `autocomplete` — and matches the
combined string against a synonym list. Longest match wins, so "first name"
beats the bare "name" entry instead of every field looking like a full name.

**Writing values** is the part that is not obvious. Assigning `input.value`
updates the DOM but not React's internal state, so the form submits empty. The
fix is to call the native setter and dispatch the events React listens for:

```js
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
setter.call(element, value);
element.dispatchEvent(new Event('input', { bubbles: true }));
```

**File uploads** cannot be assigned either. A `DataTransfer` is the one
supported route, which is why the resume is stored as a data URL rather than a
path — a content script cannot read your disk.

**Re-scanning** uses a `MutationObserver`, not a timeout. Application forms
render after load and change as you scroll.

## Filling harder fields

- **Typing.** Text goes in through the browser's own "insert text" editing
  command, so pages get real input events, as from typing or pasting, and
  React, Angular and plain pages all register it. Fields that refuse it get a
  keyboard-like sequence (key down, key press, value, input, key up, change).
  Typing never moves the page; the follow-along decides where it is.
  `test/typing.html` covers both paths.
- **Forms inside iframes.** The page scripts run in every frame, so a form
  embedded from another site (a Greenhouse form on a company's careers page)
  is recognised and filled. The D! button and panel stay on the top page; a
  frame with a form tells the top page to show the button. The panel scans
  every frame (`webNavigation` lists them), fills each frame holding the form
  and combines the results; "Go to", saved answers and AI drafts reach the
  right frame. Ad-sized frames are ignored. `test/iframe.html` covers this.

- **Teamtailor.** Recognised by its page structure, so company domains such as
  careers.zexter.com work, and filled by its field names (`src/sites.js`).
  On a job page whose form is still closed, the panel offers **Open
  application form**, which presses the site's Apply button.
- **Upload boxes.** Drag-and-drop boxes without a file input (Dropzone and
  similar) get the CV dropped on them, then are watched until the site shows
  the upload as finished. The fill result says "uploaded" or why not.
- **Suggestion boxes.** Address pickers and React-style dropdowns: the value
  is typed like a keyboard does (key down, text, key up: Greenhouse's
  Location (City) opens its results only on key-up), the city alone first,
  and the list is left to settle (search results arrive in stages).
  The best suggestion wins: one starting with your city ("Vancouver, British
  Columbia, Canada" over "North Vancouver…"), then the most words shared. It
  is highlighted and picked with Enter, as with a keyboard, or clicked if that
  does not take, and the box is checked to show it. React dropdowns that
  ignore simulated events get a last resort: `src/page-world.js`, which runs
  in the page's own world (manifest `"world": "MAIN"`), calls the option's own
  React click handler. It receives only a tag on the option element, never
  profile data. `test/react-pick.html` covers this. If not, the city alone is
  tried. Address pickers search by "city, country". With no pick, a typed
  value is yellow ("pick a suggestion"); a box that clears it shows red.
- **Yes/no questions.** Radio buttons are matched by their question (fieldset
  legend or group label), then the option that matches the profile answer.
- **Number fields** take only the number from a profile value.
- **React-style dropdowns** (react-select, used on Greenhouse's new boards):
  the chosen option shown beside the empty input counts as the value, the
  hidden "required" helper input is ignored, and icons sit at the right of the
  visible box. `test/greenhouse.html` covers this.
- **Whole-address questions** ("City, State/Province, Country and Zip Code")
  get "city, state, country, postal code" from the profile.
- **Consent questions** are never answered, whether checkbox or dropdown.
- **Still empty and required.** After Autofill, the panel lists required
  fields that are still blank (required, aria-required, or "*"/"Required" in
  the label), with **Go to** buttons and **Check again**.
- **Fields to fill** in Settings switches off groups: contact, location,
  links, CV and cover letter, experience and education, work authorization,
  salary and availability.

- **Eligibility per country.** Sponsorship and work-authorization questions
  note the country they name ("…to work legally for Box in Poland"). A
  per-country answer is used; the profile's general answer only for the
  profile's own country or a question naming none. Missing answers appear in
  the Autofill tab as **Answer once** (Yes/No), kept in this browser and
  listed in Settings with Remove.
- **Worked here before.** "Have you ever been employed at Box…" is answered
  from the chosen CV: Yes when that company is one of its employers, otherwise
  No, always with a yellow "check it" icon.
- **Required acknowledgements** (Settings → *Acknowledge required privacy
  notices*, off by default): required privacy-notice, terms and
  consent-to-process acknowledgements are ticked or answered with the
  acknowledging option, with a yellow icon to read them. Never marketing
  opt-ins, refusals, or anything that also mentions eligibility, background
  or salary. `test/eligibility.html` covers these three.

Otherwise consent checkboxes ("I agree", privacy policy, terms) are never ticked.
Diversity questions are filled only when you opt in (below); sexual
orientation, date of birth and age are never filled.

`test/teamtailor.html` runs the real detection and filling code against a
Teamtailor-shaped form with stand-in widgets:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --virtual-time-budget=15000 \
  --dump-dom "file://$PWD/test/teamtailor.html" | grep -o '<pre id="result">.*</pre>'
```

## Saved answers

The company's own questions ("How did you hear about us?", "Fintech
experience") have no profile field. After you answer them on a form, press
**Save answers from this form** in the Autofill tab, tick the ones to keep and
**Save selected**. They are stored on your account and editable in the app
under **Profile → Saved answers**.

On the next form, Autofill asks the server for matches (`src/answers.js`,
`POST /api/extension/answers/match`) and fills only empty fields:

- the same question, ignoring case, punctuation and "Required", fills as is;
- similar wording ("Telegram account" / "Your Telegram") fills and is listed
  under the result as "check it";
- an answer naming the company it was written for is not used for another
  company, and the result says so;
- for dropdowns and yes/no questions the answer must match one of the options.

Settings → Fields to fill → **Saved answers** switches this off. Telegram is
now a normal profile field (Links).

## AI drafts

Questions with no saved answer appear in **Questions to answer** on the
Autofill tab. **Draft with AI** (or **Draft all**) asks the server to draft
one with the Claude CLI (`POST /api/extension/answers/draft`), from the chosen
CV without contact details and the job posting on the page. Drafts run one at
a time and only on your click, or when you press Autofill with Settings →
**Draft unknown questions with AI** switched on (off by default).

- Claims come only from the CV. Motivation, salary, availability, handles and
  similar personal facts come back as questions for you, not as answers;
  "why us" drafts leave `[add your reason]`.
- Choice questions get one of the form's options, number fields a number, and
  text stays within the field's character limit.
- A draft goes into an empty field with a yellow "AI draft" icon until you
  edit it. A field you already filled is left alone; copy
  the draft instead. **Save as answer** keeps a good draft for next time.

## Fill status icons

Autofill makes one pass down the form in page order. Each stop gets its icon
the moment it is done: profile fields, saved answers and (when switched on)
required acknowledgements are filled and turn green or yellow; any other
required field still empty turns red with the reason as the pass reaches it.
This is the same with animation on or off. A final check catches fields that
appeared meanwhile. `test/flow.html` checks fields above are already marked
while a later one fills.

After Autofill, a small icon sits just outside each field it touched or
checked (`src/marks.js`), level with the middle of the box you see as the
field. That box is the nearest wrapper drawing a frame (border, outline as on
Greenhouse, outer shadow, or a ::before/::after border) and holding only that
field. The icon goes on the right, or on the left when the right is off the
page or on a neighbouring field (Country beside Phone). Hover for the reason.

- **✓ green**: filled from your profile, diversity answers or an exact saved
  answer, or your CV attached.
- **! yellow**: filled, but check it: an AI draft, a similar saved answer, an
  address with no suggestion picked, an upload still finishing.
- **× red**: required and still empty (the same list as "Still empty and
  required"), or not filled. It says why and what fixes it: the profile has
  no value for it, its group is off in Settings, sponsorship for a country
  needs "Answer once", consent is the person's to give (or the acknowledge
  setting), the company's own question (save an answer or draft one), a
  personal question Autofill never answers, no option matched, the upload
  did not finish, or a field it did not recognise. `test/reasons.html`.

The reason shows at once in a bubble above and to the left of the icon (away from the panel on the right; below only when there is no room above) on hover or click, and the panel's
"Still empty" list shows it under each field; its **Go to** opens the bubble
beside the field.

Icons are drawn in a shadow root over the page, so the site's layout is
untouched, and follow their fields on scroll and resize. Green and yellow icons
go when you edit that field (Autofill's own changes do not count); red ones go
once the field has a value. All clear on reload. Settings → **Show fill status
icons** (on by default) turns them off. `test/marks.html` covers them and
leaves the icons visible for a screenshot.

## Follow-along animation

Settings → **Animate filling** (on by default). Fields fill in page order. The
page scrolls smoothly to each field that is off screen (fields already on
screen do not make it jump), and the field glows in its result colour; a CV
upload pulses until it finishes. Each field takes about a quarter of a second.
At the end the page scrolls on to the form's Submit button (Next or Continue
on a step without one) and rings it in blue; it is only shown, never pressed.
Only buttons inside the form count, so a page's "Apply" button at the top is
not chosen. Scrolling by hand during a fill
stops the follow-along for that fill (only your own scrolling counts, not
the key presses Autofill sends to dropdowns). With the system's "Reduce motion" on,
nothing scrolls and the glow does not move. Filling no longer scrolls the page
when it focuses a field, so with animation off the page stays put.
`test/animation.html` covers all four cases.

## Multi-step forms

Settings → **Keep filling the next steps** (off by default). After you press
**Autofill This Page**, the panel arms that tab in the background script for 30
minutes on that site. Fields that appear later, on the next step or the next
page, fill from the same profile, CV and saved answers. Fields already seen are
never touched again, so anything you cleared or changed stays as you left it.
Switching the setting off stops it at once. `test/steps.html` runs the real page
script against a stand-in for Chrome's APIs.

## Diversity questions

Voluntary self-identification (gender, Hispanic/Latino, race or ethnicity,
veteran status, disability) is filled only when **Diversity questions** is
ticked under Settings → Fields to fill (off by default). **Edit my diversity
answers** sets each answer; all start as "Prefer not to answer". The answers are
kept in this browser only (`diversityAnswers` in `chrome.storage.local`) and are
never sent to the app or to Claude. Each choice matches the form's own wording
("Decline to self-identify", "Female", "No, I do not have a disability"), and a
race question listing "Hispanic or Latino" stays the race question.
`test/diversity.html` covers this.

## What it does not do yet
- **Workday.** Multi-step, iframes, shadow DOM. Disproportionate effort.
- **Forms inside iframes** from another site (a Greenhouse form embedded on a
  company page).

## Adding a field

Add to `CATEGORIES` in `src/fields.js`, add its label and group in
`src/sidepanel.js` (`FIELD_LABELS`, `PROFILE_GROUPS`), and it works.

## Development

### LinkedIn job descriptions

Open a LinkedIn job page or select a posting in Jobs search. The extension
opens for the selected posting, reads its company, title, location and full
description, and compares its keywords with your selected CV. **Quick Tailor**
and **Full Tailoring** use that posting through the existing backend flow.
Opening Quick Tailor keeps the CV as a draft; **Save** creates the CV and PDF.

The selected job description is read automatically. Its keyword match and
missing skills appear in the existing **Resume** card. Reading and analysis
create no job, CV or PDF.

When the signed-in page does not expose its description, the extension reads
that same job ID from LinkedIn's public posting. These requests omit login
cookies, share an in-flight read and are cached briefly. Loading failures are
retried automatically while the panel is visible.

The shared reader is `src/linkedin.js`. It supports signed-in detail panes
and public job pages, including `/jobs/search-results/` layouts whose
description is identified by its **About the job** heading. It expands only
the selected description and excludes
search results and recommended jobs. The panel follows selection changes
even when LinkedIn keeps the same search URL. A missing description or
sign-in screen is never captured as a job.

After editing, reload the extension in `chrome://extensions` and refresh
LinkedIn. Run the synthetic browser checks with Node 22 and Chrome installed:

```sh
node extension/test/linkedin.cjs
```

Run this command from the repository root after installing backend dependencies.
Set `CHROME_PATH` when Chrome is installed somewhere other than its macOS path.

### Autofill layout

Keep this view compact and calm:

- Show the current job in one frame; open its add/edit form inside the panel.
  Below its title, show **Company · Posted date**. Use the page's explicit
  posting date or the saved job's posting date; omit it when unavailable.
  Keep its original calendar day when a timestamp uses a different time zone.
- Autofill is the main action. Below it, a collapsible **Resume** card groups
  CV choice, a separate PDF preview icon, the real keyword-match gauge, and
  **Tailor Resume**. Tailoring opens the existing workflow in the app.
- Keep errors and missing required fields visible. Show keyword details when
  the match count is clicked; routine fill notes and field previews also expand.
- Keep sections open after a redraw. Use space and thin dividers to separate
  tasks, rather than adding more boxes or smaller text.

This follows NN/g's guidance on [proximity](https://www.nngroup.com/articles/gestalt-proximity/)
and [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).
Use `test/profile-tab.html?cvs&layout` to preview the initial Autofill state.

### Text previews

Display labels and previews use a shared **64-character limit** in
`src/text-display.js`: job/company names, CV names, status messages, field
previews and Profile cards. Long text ends in `…`; hover to read the full text.
CV pickers instead shorten the middle, so similar names keep their distinctive
endings. The selected name uses small, single-line text with an ellipsis;
dropdown options wrap. The PDF preview icon stays at the right of the name;
the default CV is marked in the dropdown list.
Open **Full CV name** to read or copy the complete selected name; the search
list also shows the focused option's complete name below its options.
The full-name views are deliberate exceptions to the preview limit.
Profile copy actions, searches, saved data, form inputs and uploaded filenames
keep their complete values. Multi-line headings and statuses also stay within
two lines. Change `UI_TEXT_LIMIT` to adjust the default for the whole panel.

Autofill and Resume use the same chosen CV. You can change it on either tab;
if Autofill already attached a CV, changing it replaces that PDF on the form
when the site allows replacement. Both tabs show the result.

The name layout follows [Maersk's truncation guidance](https://designsystem.maersk.com/content/truncation/index.html):
wrap where possible, keep both ends of filenames, and offer access beyond hover.
For new CV names, prefer **Role · Company · Version**, for example
**Lead Engineer · Hilo Labs · v2**. Existing CVs keep their original names.

Plain JavaScript, no build step, so edits are immediate:

1. Edit a file
2. Press reload on the extension card in `chrome://extensions`
3. Refresh the application page

Content script errors appear in the **page's** console. Panel errors appear when
you right-click inside the panel → **Inspect**. Toolbar and reopen errors are in
the service worker's console (`chrome://extensions` → **service worker**).

TypeScript would need a bundler emitting to `dist/`; worth it once this grows,
unnecessary now.
