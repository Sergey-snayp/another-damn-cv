/**
 * A job's (or its project's) description, checked against the one-sentence
 * standard: 15 to 25 words saying what the product does, who uses it and why,
 * factual, without the person's work, results, technologies, buzzwords or the
 * title above it.
 */
export interface DescriptionCheck {
  key: string;
  label: string;
  ok: boolean;
  /** What to do when it is not met. */
  fix: string;
}
export interface DescriptionInput {
  text: string;
  /** The jobs' technologies: what a description should leave out. */
  keywords: string[];
  title?: string;
  company?: string;
}

export const DESCRIPTION_WORDS = { min: 15, max: 25 } as const;
/** About you, not the product: "I", "we", a past-tense action verb first, or a duty. */
const ABOUT_YOU = /^\s*(?:built|developed|designed|led|created|implemented|worked|managed|maintained|delivered|responsible|helped|wrote|migrated|owned)\b|\b(?:I|me|my|we|our|us)\b|\bresponsible for\b/i;
/** A result, not what the product is: a %, money, or a result verb. */
const RESULT = /\d\s*%|[$€£]\s*\d|\b\d+x\b|\b(?:increased|reduced|improved|saved|cut|grew|boosted|doubled|tripled|decreased|accelerated)\b/i;
/** Generic claims a recruiter skips. */
const BUZZ = /\b(?:innovative|cutting[- ]edge|world[- ]class|best[- ]in[- ]class|state[- ]of[- ]the[- ]art|next[- ]gen(?:eration)?|revolutionary|disruptive|seamless(?:ly)?|leading|award[- ]winning|robust|powerful|unique|dynamic|fast[- ]paced|game[- ]changing)\b/i;
/** Who it is for: an audience ("retailers", "bank fraud teams") or "used by…". */
const AUDIENCE = /\b(?:used by|customers?|clients?|users?|members|subscribers|merchants?|retailers?|stores|shops|restaurants|sellers?|buyers?|shoppers?|consumers?|banks?|lenders?|insurers?|investors?|traders|businesses|companies|enterprises|startups|teams?|employees|staff|recruiters|candidates|applicants|patients?|clinics?|hospitals|doctors|nurses|students?|schools|universities|teachers|parents|families|drivers?|riders|passengers|travell?ers?|guests?|hosts|tenants|landlords|owners|operators|carriers|shippers|suppliers|vendors|providers|partners?|developers|engineers|agencies|brands|publishers|advertisers|marketers|creators|readers|viewers|listeners|players|gamers|citizens|governments?|councils|people)\b/i;

/** The text names this technology, as a word of its own ("Go" not in "Google"). */
const names = (text: string, tool: string) =>
  Boolean(tool.trim()) && new RegExp(`(^|[^\\p{L}\\p{N}])${tool.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text);

export function descriptionChecks(active: DescriptionInput): DescriptionCheck[] {
  const text = active.text.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean).length;
  const tech = active.keywords.filter((keyword) => names(text, keyword));
  const lower = text.toLowerCase();
  const repeated = [active.company, active.title].map((name) => (name ?? "").trim()).find((name) => name.length > 2 && lower.includes(name.toLowerCase()));
  const aboutYou = ABOUT_YOU.exec(text)?.[0]?.trim();
  const result = RESULT.exec(text)?.[0]?.trim();
  const buzz = BUZZ.exec(text)?.[0];
  return [
    {
      key: "length",
      label: "Length",
      ok: words >= DESCRIPTION_WORDS.min && words <= DESCRIPTION_WORDS.max,
      fix: words < DESCRIPTION_WORDS.min ? "Add what the product does or who uses it." : "Cut it to what the product is, who uses it and why: 25 words at most.",
    },
    { key: "sentence", label: "One sentence", ok: sentences === 1, fix: "Make it one sentence: what it is, for whom, to what end." },
    { key: "audience", label: "Who uses it", ok: AUDIENCE.test(text), fix: "Say who uses it: “for 300 retail merchants”, “used by bank fraud teams”." },
    { key: "product", label: "About the product, not you", ok: !aboutYou, fix: `Drop “${aboutYou ?? ""}”: your work goes in the bullets. Start with what the product is.` },
    { key: "tech", label: "No technologies", ok: !tech.length, fix: `Move ${tech.slice(0, 3).join(", ")} to Technologies: the description says what the product is, not how it is built.` },
    { key: "result", label: "No results", ok: !result, fix: `Move “${result ?? ""}” to a bullet: results are achievements, not a description.` },
    { key: "buzz", label: "No buzzwords", ok: !buzz, fix: `Drop “${buzz ?? ""}”: say plainly what it does.` },
    { key: "title", label: "Doesn't repeat the title", ok: !repeated, fix: `Drop “${repeated ?? ""}”: it is already above. Name the product or say what it is.` },
  ];
}

