# Another Damn CV

A Chrome extension that recognises job application forms on any site and fills
them from your profile, with a CV from the app. It also saves job postings to the app.

In development it talks to your own app (`localhost:3001` and `:5173`). The Chrome
Web Store build talks to the live app instead (`scripts/pack-store.cjs`). There is
no telemetry. A few other requests are made: the job site you are on (to read its
job page or its own lists), LinkedIn's public job page, and Google's icon service
when a company logo is not found on the page.

## Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the icon, click it, sign in on the **Profile** tab, and choose a CV in
   the **Resume** card on the **Autofill** tab

After updating the extension files, click **Reload** on its card in
`chrome://extensions`, then reload the pages you had open.

## The panel

The panel opens automatically when a job application form is detected, including
forms loaded later or embedded in an iframe. It opens inside the page, on its
right edge, over the page content. Closing it keeps it closed on that page;
it can open automatically again on another application page.
Open it again with the D! button on the page edge or the toolbar icon; collapse it with
its `>` button or Esc. Collapsing the panel always brings the D! button back on
that page, even where it was hidden. It reopens after you move to another page in the same tab.

The D! button's × opens a menu:

- **Hide until next visit** removes the button from this page.
- **Disable on this domain** or **Disable on all pages** keeps the button, in grey.
  The panel no longer opens by itself, and later form steps are no longer filled
  by themselves. Pressing the button still opens the panel, and **Autofill This
  Page** still works when you press it.
- On a disabled site the same menu says **Enable on this domain** or **Enable on
  all pages**, which turns it back on. Settings → **Turned off on these sites**
  lists the disabled sites too.

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
- on a known job system, a resume field or any 2 fields. A system is known by its
  address or by a mark in the page, so it also works on a company's own domain
  (Lululemon's careers site is Avature). See `src/sites.js` and `src/site-fields.js`.

Some pages (Greenhouse's job boards, built with React/Remix) replace their
whole `<html>` element while starting, which removed the D! button. The page
watcher observes the document itself, and the button, panel and icons put
themselves back after any change. `test/rebuild.html` covers this.

Forms with card fields, or a search box and no contact fields, never count. A form
with a password counts only when it also asks for 4 or more applicant details: that
is an application that also makes an account (Lululemon's). A plain sign-in or
sign-up page does not count. Ordinary sites are rescanned less often than job
boards, and pages without inputs are skipped.
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

**Nothing is filled until you press Autofill This Page, and Autofill never submits
anything.** Opening the panel, rescanning and page loads only read the form.
`content.js` accepts a fill request only from the panel. The one exception is
**Keep filling the next steps**, which you switch on yourself (see Multi-step forms).

After Autofill, the panel shows the form's own next button under the result, with
the form's own words: **Continue**, **Next**, **Save & Continue**, **Submit**. It
presses that button on the page, and only when you press it. If the button may send
the application, the panel says to check your answers first. It is found by the
site's own rule or by its words, never in the page's header, menu or footer, and
never Back, Cancel or Sign in (`advanceButton` in `src/sites.js`, `test/advance.cjs`).

## Your profile stays current

The server holds your profile. The panel reads your profile, default answers and work
history when it is about to use them: when it opens, when it is shown again, when you
come back to its tab, and right before **Autofill This Page**. As in Simplify and
Jobright, there is no timer, and a read from the last 5 seconds is reused. If the
server does not answer within 3 seconds, Autofill uses the saved copy.
`test/profile-sync.cjs` covers this.

## CVs

The **Resume** card on the **Autofill** tab shows the CV that **Autofill This Page** uploads, as
`<CV name>.pdf` (sign in on the Profile tab first). **Change** opens the list
of CVs from the app's Documents to pick another. Your primary CV is chosen
until you pick another. **Open Documents** opens your CVs in the app. Text fields still come
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
- The page is read with the same capture as saving a job. The card appears only
  for the page's own JobPosting data, a site rule (LinkedIn, Indeed…), or a
  description with requirement/responsibility sections and 3+ skills.
- A form page has no description of its own. The match then uses the job's page,
  the LinkedIn posting you came from, or the saved job's description (see One job
  through the whole application).
- Each CV's text (no contact details) comes from
  `GET /api/extension/resumes/:id/text` and is kept until the CV changes. If
  another CV scores 10+ points higher, the card offers to switch.
- **Quick Tailor** and **Full Tailoring** save the job and open it with the chosen
  CV. Quick Tailor opens an unsaved draft, line by line. Full Tailoring opens the
  full CV editor in the app.

`node --test test/match.test.mjs` checks the matching rules.

## Save a job to the app

On any job page (LinkedIn, Indeed, a company's careers page) open the panel. The
job card at the top shows the job: green with a check when it is saved, gray with a
plus when it is not. Press it, then **Save Job**. You can also right-click the page
and choose **Save job to Another Damn CV**. Sign in on the Profile tab first.

- A job is also saved when Quick Tailor, Full Tailoring or a new cover letter needs it.
- On search pages (LinkedIn, Indeed, Glassdoor) it captures the open job, not
  the list beside it. The rules for that are in `src/capture-sites.js`; when a
  site changes its layout, that is the file to update.
- Saving the same job again updates it and keeps your edits and status.

`test/capture.html` runs the capture script against a LinkedIn-shaped page:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --allow-file-access-from-files --virtual-time-budget=3000 \
  --dump-dom "file://$PWD/test/capture.html?site=linkedin"
```

## One job through the whole application

An application has many pages: the job page, the upload page, sign-in, then each form
step. Some of them do not say which job they are for. Lululemon's steps after
sign-in have no description and no link back to the job. As Simplify does, the
extension keeps one job across all of them. It looks in this order:

1. The saved job with this exact address.
2. The saved job on the same site with the same job number. `?jobId=65847` on a form
   is `/JobDetail/…/65847` on the job page. The server does this
   (`GET /api/jobs/lookup`, `postingKey` in the backend).
3. The last job found in this browser tab, on the same site, when this page shows no
   job number. A page with a different number never gets it (`jobOfThisTab` in
   `src/sidepanel.js`).

The keyword match, the cover letter and Quick Tailor then use the saved job's
description, and the job card shows the saved job's logo on every step.
`test/job-memory.cjs` covers this.

## How it works

```
On the page
  fields.js          finds inputs and guesses what each one is
  filler.js          writes values in a way the page accepts
  sites.js           known job systems, their buttons and steps
  site-fields.js     per-system facts: how to know it, and its field names
  content.js         answers the panel's scan and fill requests; runs the fill
  workday-history.js the lists on a form: Workday's My Experience, Avature's rows
  account-form.js    finds and fills a job site's Create Account or Sign In form
  job-form.js        decides whether a page looks like a job application form
  job-details.js     reads the job's title, company and description on a page
  logo.js            finds the company logo
  linkedin.js        reads the selected LinkedIn job
  marks.js           the icons beside fields, and the fill animation
  launcher.js        the D! button on the page edge
  panel-host.js      puts the panel frame into the page; opens and closes it
  top-layer.js       keeps our elements usable over a page's top-layer window
  page-world.js      runs in the page's own world, for widgets we cannot reach
  bridge.js          runs only on the web app's page, to talk to the extension

Added only when needed
  capture.js, capture-sites.js   read the job page when a job is saved

The panel and background
  sidepanel.js       the panel itself
  background.js      toolbar icon, right-click menu, next-step filling
  auth.js            sign-in
  resumes.js         your app CVs, which one Autofill uploads, and its PDF
  career.js          your jobs, schools, skills and languages from the server
  jobs.js            saves and finds jobs
  job-capture.js     keeps the job description, never the form's text
  linkedin-handoff.js  carries the LinkedIn job to the company's site
  cover-letters.js   writes and reads the cover letter
  answers.js         saved answers
  defaults.js        default answers, per country or company
  site-login.js      your job-site login
  match.js           keyword match between a posting and your CVs
  text-display.js    shortens long text for display
  icons.js           the icon set
  tailor.js          holds Quick Tailor in a window over the job page
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
  On a job page whose form is still closed, the panel offers **Start
  Application**, which presses the site's Apply button. This works on the other
  known job systems too.
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
- **Dropdowns behind a widget** (select2 and jQuery UI, used by Avature, iCIMS and
  BrassRing): the real list is hidden, so the value is set there and the widget is
  told. A select2 that loads its options only as you search is opened, your answer is
  typed, and the match is pressed, as Simplify does. A **Location** list of countries
  gets your country. `test/widget-selects.cjs`, `test/select2-search.cjs`.
- **Answers drawn as buttons** are pressed like radio buttons. `test/choice-buttons.cjs`.
- **Whole-address questions** ("City, State/Province, Country and Zip Code")
  get "city, state, country, postal code" from the profile.
  "State/Province/City" alone is one box for your state or province.
- **One answer, one field.** A contact or address value goes into the first field of
  a form that asks for it, not into a second one. Address lines 2 and 3 stay empty.
  A second field is filled only when its label says "confirm", "repeat" and so on,
  or "legal". **Legal First Name** gets your first name, as Simplify and Jobright do.
- **Read back.** After a fill, each field is read again. A value the site cleared or
  calls invalid gets a yellow icon. `test/fill-checks.cjs`.
- **CV first.** Sites that read your CV into the form (Lever, iCIMS and others) get
  the CV first; the other fields are filled when the site has finished reading it.
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
  the Autofill tab as **Answer once** (Yes/No), saved on your account and
  listed in Settings → **Default answers**.
- **Work status questions.** Citizen or permanent resident, SIN starting with 9,
  and permit expiry are answered from the work status saved in the app's Profile.
  With no status saved they are left for you, and the panel says what is missing.
  `test/workday-questions.cjs`.
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

## Job systems with their own steps

- **Workday.** My Information is filled, including phone type and "How did you hear".
  My Experience adds one panel per job and school from the CV or Profile Autofill
  uses, removes extra panels, replaces a wrong school or field of study, picks the
  degree from Workday's own list, and adds the skills Workday knows and your
  websites. Fields that already hold a value are kept. `test/workday-experience.cjs`,
  `test/workday-information.cjs`.
- **Avature** (Lululemon and others). **UPLOAD RESUME** takes the CV and goes on. On
  "More about me", Work History gets one row per job, with rows added by **add
  another** and extra rows removed by **remove**: company, title, Is Current
  Position, and month dates. Education gets the school, Type of Qualification and
  Qualification. Languages gets one row per language from your Profile.
  `test/avature-upload.cjs`, `test/avature-history.cjs`.
- **LinkedIn.** Autofill works only inside the Easy Apply window.

## Job-site accounts and passwords

Many job sites make you create an account. The extension keeps one job-site login
for you, on your account on the server, encrypted. It never stores the password in
the browser. See it in Settings → **Job-site login**.

- On a Create Account or Sign In page, the panel offers **Create Account & Autofill**
  or **Sign In & Autofill**. It fills the form and shows the button. You press it.
  The first time, a strong password is made and saved.
- If you change a password on one site and it works, the panel asks **Update your
  job-site password?**, for that site only or for all sites.
- An application that also asks for a password (Lululemon's Password and Password
  Confirm) gets the same login when you press **Autofill This Page**. **Keep filling
  the next steps** does not fill passwords.

`test/account-step.cjs`, `test/site-login.test.mjs`.

## Cover letters

If the form has a cover letter box, required or not, and this job has no letter yet,
**Autofill This Page** writes one from your chosen CV and attaches it. This uses the
AI, so it takes a little time. The **Cover Letter** card shows the letter; you can
read it, edit it, or generate it again. Switch this off in Settings → Fields to fill
→ **CV and cover letter**. That group also stops the CV upload.

## Saved answers

The company's own questions ("How did you hear about us?", "Fintech experience") have
no profile field. After Autofill, such a question gets a gray **+** icon. Click it,
write your answer, then press **Save answer** to keep it, or **Just this time** to
use it only on this form. Answers are stored on your account and can be edited in the
app under **Profile → Saved answers**.

On the next form, Autofill asks the server for matches (`src/answers.js`,
`POST /api/extension/answers/match`) and fills only empty fields:

- the same question, ignoring case, punctuation and "Required", fills as is;
- similar wording ("Telegram account" / "Your Telegram") fills and is marked
  "check it";
- an answer naming the company it was written for is not used for another
  company, and the result says so;
- for dropdowns and yes/no questions the answer must match one of the options.

Settings → Fields to fill → **Saved answers** switches this off. Telegram is
now a normal profile field (Links).

## AI answers

In the same icon menu, **✦ Generate answer** asks the server to write an answer with
the Claude CLI (`POST /api/extension/answers/draft`), from the chosen CV without
contact details and from the job. It runs only when you press it, one question at a
time, and it is offered only for large text boxes.

- Claims come only from the CV. Motivation, salary, availability, handles and
  similar personal facts come back as questions for you, not as answers;
  "why us" answers leave `[add your reason]`.
- Read it, then save it or use it just this time.

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
- **+ gray**: the form asks for it and you have no value yet, but it is not
  required. Click to add one.
- **× red**: required and still empty (the same list as "Still empty and
  required"), or not filled. It says why and what fixes it: the profile has
  no value for it, its group is off in Settings, sponsorship for a country
  needs "Answer once", consent is the person's to give (or the acknowledge
  setting), the company's own question (save an answer or draft one), a
  personal question Autofill never answers, no option matched, the upload
  did not finish, or a field it did not recognise. `test/reasons.html`.

Click an icon to set or change the answer for that field: save it to your Profile or
default answers, use it just this time, or take what you chose on the form. Which
choices appear depends on the field.

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
Switching the setting off stops it at once. So does disabling the extension on that
site or on all pages. `test/steps.html` runs the real page script against a stand-in
for Chrome's APIs.

## Diversity questions

Voluntary self-identification (gender, Hispanic/Latino, race or ethnicity,
veteran status, disability) is filled only when **Diversity questions** is
ticked under Settings → Fields to fill (off by default). The answers are the ones
in the app's Profile, saved on your account, and are not sent to Claude. **Edit my
diversity answers** and a field's icon change them there too. A question with no
answer uses "Prefer not to answer". An answer chosen in this browser before 0.82.0
(`diversityAnswers` in `chrome.storage.local`) still counts until the Profile has
one; it is not uploaded unless you save it. The Profile's LGBTQ+ answer is never put
on a form. Each choice matches the form's own wording ("Decline to self-identify",
"Female", "No, I do not have a disability"), and a race question listing "Hispanic
or Latino" stays the race question. `test/diversity.html`, `test/profile-sync.cjs`.

## What it does not do yet

- Site rules ship inside the extension, so a broken site needs a new version.
- Lists (jobs, schools, languages) are filled on Workday and Avature only, not on
  other job systems.
- Company questions are answered with AI one at a time, on your click.
- Fields with no usable label are not recognised.
- Sign-up pages such as Avature's Register do not show the D! button. Open the panel
  from the toolbar icon there.

The full list is in [docs/autofill-plan.md](../docs/autofill-plan.md).

## Adding a field

Add to `CATEGORIES` in `src/fields.js`, add its label and group in
`src/sidepanel.js` (`FIELD_LABELS`, `PROFILE_GROUPS`), and it works.

## Development

### Tests

From `extension/`, with Chrome installed and the backend's packages installed:

```sh
node test/run.cjs                  # every test except the end-to-end ones
node test/run.cjs advance job-form # only these
node test/run.cjs --jobs 6         # up to 6 at once (default 4)
node test/run.cjs --all            # end-to-end ones too (the app must be running)
```

The unit tests (`*.test.mjs`) need Node 22. Test pages use made-up forms and a fake
server, so no account is used. `test/auto-open.html` also has `?domain` and
`?disabled` modes for disabled sites; the runner opens only the normal mode, so open
those by hand.

`node scripts/real-forms.cjs <url>` tries the scanner and filler on a live form and
submits nothing. `node scripts/pack-store.cjs` builds the Chrome Web Store package.

### LinkedIn job descriptions

Open a LinkedIn job page or select a posting in Jobs search. The extension
opens for the selected posting, reads its company, title, location and full
description, and compares its keywords with your selected CV. **Quick Tailor**
and **Full Tailoring** use that posting through the existing backend flow.
Opening Quick Tailor keeps the CV as a draft; **Save** creates the CV and PDF.

Clicking **Apply** to open a company site keeps the original LinkedIn posting
in browser session storage for that application tab, through every page of the
application with the same job number. Quick Tailor saves its
description as the backend job description immediately, with clean text,
HTML and structured data. Application field labels and state/country options
never replace that posting. Jobvite can also read the description from its
job overview when the application page has none. The handoff is bound to the
destination posting, so another job on the same ATS cannot reuse it.

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
- Autofill is the main action. After a fill, the form's own next button sits under
  it. Below, a collapsible **Resume** card groups CV choice, a separate PDF preview
  icon, the real keyword-match gauge, **Quick Tailor** and **Full Tailoring**.
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

If Autofill already attached a CV, changing the chosen CV replaces that PDF on the
form when the site allows replacement. The Resume card shows the result.

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
