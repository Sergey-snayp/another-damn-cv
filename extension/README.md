# CV Autofill

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

The panel opens inside the page, on its right edge, over the page content.
Open it with the D! button on the page edge or the toolbar icon; collapse it with
its `>` button or Esc. The D! button's × offers **Hide until next visit**, **Disable
on this domain** or **Disable on all pages**; Settings in the panel turns the
last two back on. Collapsing the panel always brings the D! button back on
that page, even where it was hidden. It reopens after you move to another page in the same tab.

- The extension runs on every site, so the panel opens anywhere from the
  toolbar icon. Chrome lists this as "Read and change all your data on all
  websites". It only reads form fields, and only sends data when you press a button.
- Your own app (`localhost:5173`, `localhost:3001`) is excluded.
- Chrome pages (`chrome://`, the Web Store) cannot show it.

## When the D! button appears

`src/job-form.js` decides, on every site, whether the page looks like a job
application form:

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

The app makes PDFs only through the browser's print, so the extension does the
same: it opens the CV in a background tab of the app, where you are signed in
and your CV style is stored, and saves it as a PDF with Chrome's debugger
(`Page.printToPDF`). Chrome shows a "CV Autofill started debugging this
browser" bar for those few seconds. The PDF is kept and remade only after the
CV changes in the app. `src/resumes.js` and `makeCvPdf` in `src/background.js`
hold this logic; the list comes from `GET /api/extension/resumes`.

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

- **Teamtailor.** Recognised by its page structure, so company domains such as
  careers.zexter.com work, and filled by its field names (`src/sites.js`).
  On a job page whose form is still closed, the panel offers **Open
  application form**, which presses the site's Apply button.
- **Upload boxes.** Drag-and-drop boxes without a file input (Dropzone and
  similar) get the CV dropped on them, then are watched until the site shows
  the upload as finished. The fill result says "uploaded" or why not.
- **Suggestion boxes.** Address pickers and React-style dropdowns: the value
  is typed, and the suggestion sharing the most words is clicked. Address
  pickers search by "city, country". With no match the text stays and the
  result asks you to pick a suggestion.
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

Consent checkboxes ("I agree", privacy policy, terms) are never ticked.
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

After Autofill, a small icon sits just outside each field it touched or
checked (`src/marks.js`), on the right of the box you see as the field (on
forms that draw the border around the label and input, that wrapper), or on
the left when the right has no room. Hover for the reason.

- **✓ green**: filled from your profile, diversity answers or an exact saved
  answer, or your CV attached.
- **! yellow**: filled, but check it: an AI draft, a similar saved answer, an
  address with no suggestion picked, an upload still finishing.
- **× red**: required and still empty (the same list as "Still empty and
  required"), or not filled, with the reason.

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
upload pulses until it finishes. Each field takes about a quarter of a second,
and the page ends on the last filled field. Scrolling by hand during a fill
stops the follow-along for that fill. With the system's "Reduce motion" on,
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

Plain JavaScript, no build step, so edits are immediate:

1. Edit a file
2. Press reload on the extension card in `chrome://extensions`
3. Refresh the application page

Content script errors appear in the **page's** console. Panel errors appear when
you right-click inside the panel → **Inspect**. Toolbar and reopen errors are in
the service worker's console (`chrome://extensions` → **service worker**).

TypeScript would need a bundler emitting to `dist/`; worth it once this grows,
unnecessary now.
