import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadCompanies } from '../config.js';
import { detectAts } from '../sources/ats.js';
import { runAgent, type Tool, type AgentRun } from './runtime.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/125.0 Safari/537.36';
const COMPANIES = join(ROOT, 'profile/companies.yaml');

/**
 * Company discovery is the one part of this project that genuinely suits an
 * agent. The path cannot be written in advance: a guessed token either resolves
 * or does not, a careers page may name its ATS or hide it behind JavaScript, and
 * the right next move depends entirely on what the last attempt returned.
 */

const probeAts: Tool<{ token: string }> = {
  name: 'probe_ats',
  description: 'Test one token against Greenhouse, Lever and Ashby. This is the ground truth — a token only counts if this resolves.',
  args: { token: 'the board slug to try, e.g. "shopify" or "shopify-external"' },
  async run({ token }) {
    if (!token || !/^[a-z0-9][a-z0-9._-]{1,60}$/i.test(token)) {
      throw new Error('token must be a slug like "wealthsimple"');
    }
    const hit = await detectAts(token);
    return hit
      ? { found: true, token, ats: hit.ats, jobCount: hit.count }
      : { found: false, token, hint: 'try a variant: hyphenated, no-suffix, legal name, or the brand as one word' };
  },
};

const inspectCareersPage: Tool<{ url: string }> = {
  name: 'inspect_careers_page',
  description: "Fetch a company's careers page and report which ATS it links to and any board slug in those links.",
  args: { url: 'full https URL of the careers or jobs page' },
  async run({ url }) {
    if (!/^https:\/\/[\w.-]+(\/|$)/.test(url)) throw new Error('url must be a full https URL');
    const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const slugs = [...html.matchAll(
      /(?:boards|job-boards)\.greenhouse\.io\/([\w-]+)|jobs\.lever\.co\/([\w-]+)|jobs\.ashbyhq\.com\/([\w-]+)/g)]
      .map((m) => ({ ats: m[1] ? 'greenhouse' : m[2] ? 'lever' : 'ashby', token: m[1] ?? m[2] ?? m[3] }));

    // Embedded boards keep the company's own domain and betray the ATS only
    // through a query parameter — the case that made this tool miss Shopify.
    const embedded = [
      { ats: 'ashby', re: /[?&]ashby_jid=/i },
      { ats: 'greenhouse', re: /[?&]gh_jid=|grnhse_?jid/i },
      { ats: 'lever', re: /[?&]lever_?jid=/i },
    ].filter((e) => e.re.test(html)).map((e) => e.ats);

    const mentions = [...new Set(
      (html.match(/greenhouse|jobs\.lever\.co|ashbyhq|myworkdayjobs|smartrecruiters|icims|workable|bamboohr/gi) ?? [])
        .map((s) => s.toLowerCase()))];

    const note = slugs.length > 0
      ? undefined
      : embedded.length > 0
        ? `Board is EMBEDDED on the company's own site via ${embedded.join('/')}. The org slug is not in the HTML — guess it from the company name and probe_ats.`
        : mentions.length > 0
          ? 'ATS named but no slug in the HTML — the board is loaded by JavaScript. Guess tokens and probe_ats them.'
          : 'No ATS detected. They may use Workday or a custom board, which this project does not support.';

    return {
      slugsFound: [...new Map(slugs.map((s) => [`${s.ats}:${s.token}`, s])).values()].slice(0, 8),
      embeddedAts: embedded,
      atsMentioned: mentions,
      note,
    };
  },
};

const listKnown: Tool<Record<string, never>> = {
  name: 'list_known_companies',
  description: 'The companies already configured. Never add one that is already here.',
  args: {},
  async run() {
    return loadCompanies().map((c) => `${c.token} (${c.ats})`);
  },
};

const saveCompany: Tool<{ token: string; name: string }> = {
  name: 'save_company',
  description: 'Add a verified company to the config. Re-probes before writing, so it fails if the token does not actually resolve.',
  args: { token: 'the verified board slug', name: 'human-readable company name' },
  async run({ token, name }) {
    // Guardrail: the tool re-verifies rather than trusting the agent's claim.
    // Never let an agent write unchecked data into your config.
    const hit = await detectAts(token);
    if (!hit) throw new Error(`refusing to save "${token}": it does not resolve on any ATS`);

    const existing = loadCompanies();
    if (existing.some((c) => c.token.toLowerCase() === token.toLowerCase())) {
      return { saved: false, reason: 'already present' };
    }
    const raw = readFileSync(COMPANIES, 'utf8').trimEnd();
    writeFileSync(COMPANIES, `${raw}\n  - { token: ${token}, name: ${name}, ats: ${hit.ats} }\n`, 'utf8');
    return { saved: true, token, name, ats: hit.ats, jobCount: hit.count };
  },
};

export const DISCOVERY_TOOLS: Tool[] = [
  listKnown as Tool, probeAts as Tool, inspectCareersPage as Tool, saveCompany as Tool,
];

export function discoveryAgent(
  companies: string[], onStep?: Parameters<typeof runAgent>[0]['onStep'],
): Promise<AgentRun> {
  return runAgent({
    goal: `Find the public ATS job board for each of these companies and save the ones that resolve: ${companies.join(', ')}.

For each company: guess the likely board slug and probe_ats it. If guesses fail, inspect_careers_page on the company's careers URL to see which ATS they use and whether the slug appears in the HTML. Then probe the slug and, only once probe_ats confirms it, save_company.

Skip any company already in list_known_companies. Report which resolved and which you could not find.`,
    tools: DISCOVERY_TOOLS,
    maxSteps: 30,
    maxSeconds: 420,
    onStep,
  });
}
