# Brand guide

Approved by Sergey on 1 November 2026. Use this guide for future site design
and UI changes. The logo is used in the app header, sign-in page, and browser
tab. The app uses the color palette below.

## Logo

Use the supplied **D!** logo: a tilted acid-yellow badge with a thick dark
border and dark lettering. Keep its shape, proportions, and angle.

The original artwork is [d-stamp-logo.png](../frontend/public/brand/d-stamp-logo.png).
It is served at `/brand/d-stamp-logo.png`. Use this file rather than drawing a
replacement. Keep shared public brand assets in `frontend/public/brand/`.

## Color palette

The frontend source of truth is [colors.css](../frontend/src/theme/colors.css),
loaded once in `main.tsx`. Change the nine main CSS variables there to update
the app. Component styles and charts use `var(--color-...)`; do not add new
hard-coded UI colors. Soft backgrounds, borders, and shadows follow the main
colors automatically.

| Role | Color | HEX | Where to use |
| --- | --- | --- | --- |
| Primary accent | Acid yellow | `#E6FF00` | Main buttons, selected states, highlights |
| Main text | Near-black | `#141414` | Headings, body text, icons |
| Page background | Warm white | `#FAFAF5` | Main background |
| Cards and inputs | White | `#FFFFFF` | Forms, CV previews, cards |
| Secondary text | Dark gray | `#62625C` | Descriptions, helper text |
| Subtle borders | Light gray | `#DDDED5` | Card borders and dividers |
| Accent hover | Darker yellow | `#D0E600` | Primary button hover |
| Success | Deep green | `#187345` | Completed actions |
| Error | Deep red | `#B42318` | Validation errors |

## Usage

- Use near-black text and icons on yellow buttons and highlights.
- Keep most surfaces warm white or white. Use yellow for the main action and
  selected states.
- Use the same colors across Dashboard, Documents, Interview Prep, and Profile.
- Keep success and error messages clear with text or icons as well as color.
- This palette belongs to the app interface. CV document themes can keep their
  own colors for previews and exports.
