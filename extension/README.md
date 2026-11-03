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

## What it does not do yet

- **Custom dropdowns.** Greenhouse and Ashby use `react-select`, not `<select>`.
  You cannot set a value: you have to click to open, type to filter, then click
  the option, with waits in between. This is the largest remaining piece.
- **EEO and demographics.** Radio groups with opaque values. Left alone on purpose.
- **Workday.** Multi-step, iframes, shadow DOM. Disproportionate effort.
- **Per-site rules.** One heuristic for all three boards. Sites that need
  exceptions would get a small selector file each.

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
