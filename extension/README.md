# CV Autofill

A local Chrome extension that fills job application forms from a profile stored
in your browser. Greenhouse, Lever and Ashby.

Nothing leaves your machine. There is no server, no account, no telemetry.

## Load it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select this `extension/` folder
4. Pin the icon, click it, fill in your details, attach your resume PDF, **Save**

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

## How it works

```
fields.js    finds inputs and guesses what each one is
filler.js    writes values in a way React accepts
content.js   the panel, and the manual fill action
popup.js     stores your profile in chrome.storage.local
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

Add to `CATEGORIES` in `src/fields.js`, add an input to `src/popup.html` with a
matching `name`, and it works. No other changes.

## Development

Plain JavaScript, no build step, so edits are immediate:

1. Edit a file
2. Press reload on the extension card in `chrome://extensions`
3. Refresh the application page

Content script errors appear in the **page's** console, not the extension's.

TypeScript would need a bundler emitting to `dist/`; worth it once this grows,
unnecessary now.
