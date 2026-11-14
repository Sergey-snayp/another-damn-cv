/**
 * Apply on LinkedIn opens the company's page in a new tab. Which new tab a
 * click opened: one opened from the clicked LinkedIn tab within a few seconds
 * of the click, before or after it (the click's message and the new tab can
 * reach the background in either order).
 */
export const LINKEDIN_PAIRING_MS = 15_000;

/** The new tab ({ tabId, opener, at }) the click ({ tabId, at }) opened, or null. */
export function tabOpenedBy(clicked, opened, now = Date.now()) {
  if (!clicked || now - clicked.at >= LINKEDIN_PAIRING_MS) return null;
  return opened.find((entry) => entry.opener === clicked.tabId && Math.abs(entry.at - clicked.at) < LINKEDIN_PAIRING_MS) ?? null;
}
