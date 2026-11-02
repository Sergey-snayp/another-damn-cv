# CV Autofill

A local Chrome extension that fills job application forms from a profile stored
in your browser. Greenhouse, Lever and Ashby.

Nothing leaves your machine. There is no server, no account, no telemetry.

## Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the icon, click it, fill in your details, attach your resume PDF, **Save**

After updating the extension files, click **Reload** on its card in
`chrome://extensions`, then reload the pages you had open.

## The panel

The panel opens inside the page, on its right edge, over the page content.
Open it with the D! button on the page edge or the toolbar icon; collapse it with
its `>` button or Esc. The D! button's × offers **Hide until next visit**, **Disable
on this domain** or **Disable on all pages**; Settings in the panel turns the
last two back on. Collapsing the panel always brings the D! button back on
that page, even where it was hidden. It reopens after you move to another page in the same tab.

- On supported job boards it is always available.
- On any other site, the toolbar icon adds it to that tab only (Chrome's
  temporary "active tab" access). Moving to a different site in that tab ends
  that access, so the panel cannot reopen there until you click the icon again.
- Chrome pages (`chrome://`, the Web Store) cannot show it.

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

Open any application page on a supported board, for example:

```
https://boards.greenhouse.io/<company>/jobs/<id>
https://jobs.lever.co/<company>/<id>/apply
https://jobs.ashbyhq.com/<company>/<id>/application
```

A panel appears bottom-right showing which fields were recognised and whether
you have a value for each. Press **Fill this form**, then review everything
before submitting.

**It never submits anything.** That is deliberate.

## Send a job to the app

On any job page — LinkedIn, Indeed, a company's careers page — open the
panel and press **Send this job to the app**. Sign in on the Profile tab first.

- The first time on a site, Chrome asks to let the extension read it. It reads
  that tab only when you press the button.
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
panel-host.js  puts the panel frame into the page; opens and closes it
background.js  toolbar icon, adding the panel to other sites, reopening after loads
sidepanel.js   the panel itself; stores your profile in chrome.storage.local
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
