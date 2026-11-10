# Chrome Web Store listing: Another Damn CV

What to paste into each tab of the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
for item `dpahdkbangngocepcejjekglbjdgnhpi`. Keep this in step with the extension: a new
permission needs a new justification here and on the Privacy tab.

## Package

Upload `extension/dist/another-damn-cv-<version>.zip`, built with:

```bash
cd extension
node scripts/pack-store.cjs --app https://anotherdamn.cv \
  --client-id 438564820644-k8322jej27bs9dvht8jham16v4t5i9ub.apps.googleusercontent.com
```

The live Google OAuth client must list `https://dpahdkbangngocepcejjekglbjdgnhpi.chromiumapp.org/`
under Authorized redirect URIs, or signing in from the extension fails.

## Store listing

**Description**

```
The Another Damn CV extension fills job application forms for you, using your profile and CVs from your Another Damn CV account (anotherdamn.cv).

• Fills applications on company career sites and applicant tracking systems (Greenhouse, Lever, Ashby, Workday and more), including multi-step forms and forms embedded in other pages.
• Attaches the CV you choose and answers common questions from your saved answers.
• Saves job postings to your Another Damn CV account in one click, from the panel or the right-click menu, so you can track applications.
• Opens Quick tailoring next to the posting: adjust your CV's summary and bullets for the job before you apply.
• Marks a saved job as Applied when you submit its application.

You need an Another Damn CV account to use the extension. It talks only to anotherdamn.cv. There are no ads, no analytics and no tracking.

Privacy policy: https://anotherdamn.cv/privacy.html
```

- **Category:** Productivity → Tools (or Workflow & Planning)
- **Language:** English
- **Screenshots:** at least one, 1280×800 or 640×400 PNG/JPEG: the panel open on an application
  form, and Quick tailoring next to a posting.
- **Small promo tile (440×280):** optional for an unlisted item.
- **Official URL / Homepage:** `https://anotherdamn.cv`
- **Support URL:** `mailto:sergeypronyuk@gmail.com` (or leave empty)

## Privacy practices

**Single purpose**

```
Fill job application forms with the user's own profile and CVs from their Another Damn CV account, and save the job postings they apply to into that account.
```

**Permission justifications**

| Permission | Justification |
| --- | --- |
| `storage` | Keeps the user's sign-in token, settings, a copy of their profile and the chosen CV on the device, so forms can be filled without asking the server each time. |
| `unlimitedStorage` | CV files are attached to application forms from local storage; several CVs with their file data can exceed the default storage quota. |
| `activeTab` | Reads the current page when the user clicks the toolbar icon, to open the panel and find the application form. |
| `scripting` | Injects the form-filling panel and filler into the page (and its frames) where the user opens it, including pages opened before the extension was installed. |
| `tabs` | Reads the current tab's address and title to check whether that job is already saved, and opens the user's job in the Another Damn CV app. |
| `identity` | Signs the user in with Google (chrome.identity.launchWebAuthFlow) so the extension can reach their own account. |
| `webNavigation` | Follows multi-step application forms and forms inside frames, so each step is filled as it loads. |
| `contextMenus` | Adds "Save job to Another Damn CV" to the right-click menu on a page. |
| Host permission `http://*/*`, `https://*/*` | Job application forms are on any company's career site or applicant tracking system, so the extension must be able to detect and fill forms on any site. It reads and fills forms only in the browser; page content is sent to the user's own account only when they save a job, fill or submit an application, or tailor a CV. |

**Remote code:** No, I am not using remote code. (All JavaScript ships in the package.)

**Data usage: what the extension collects** (tick these)

- Personally identifiable information: name, email, address, phone (the user's profile).
- Health information: optional disability status the user saves for diversity questions.
- Authentication information: the sign-in token.
- Location: the address in the user's profile.
- Web history: the address of job pages the panel is opened on, to look up saved jobs.
- User activity: the answers the user filled in an application form they submit.
- Website content: the text of job postings the user saves.

Leave unticked: financial and payment information, personal communications.

**Certifications** (all three are true): data is not sold or transferred to third parties outside
the approved use cases; not used for purposes unrelated to the single purpose; not used to determine
creditworthiness or for lending.

**Privacy policy URL:** `https://anotherdamn.cv/privacy.html`

## Distribution

- **Visibility:** Unlisted while sign-in is invite-only (`ALLOWED_EMAILS` on Render). Anyone with
  the store link can install it.
- **Regions:** all.
