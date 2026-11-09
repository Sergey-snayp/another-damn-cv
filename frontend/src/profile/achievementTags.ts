/**
 * What an achievement is about, from its own words: tags to filter a long list.
 * Worked out on the page, no AI and nothing stored; an achievement can have several.
 */
const TAGS: [string, RegExp][] = [
  ['Payments', /\b(?:payments?|cards?|tokeni[sz]\w*|3-?d secure|acquir\w*|merchants?|iso 8583|transactions?|billing|checkout|visa|mastercard|amex)\b/i],
  ['Security', /\b(?:secur\w*|vulnerab\w*|oauth|saml|jwt|rbac|encrypt\w*|kms|secrets?|tls|certificates?|pkce|audits?|compliance|pci)\b/i],
  ['Reliability', /\b(?:alert\w*|monitor\w*|incidents?|on-call|uptime|retr(?:y|ies)|failover|outages?|observab\w*|resilien\w*|reliab\w*)\b/i],
  ['Cloud & infra', /\b(?:aws|gcp|azure|lambda|step functions|kubernetes|k8s|docker|terraform|cdk|cloudformation|route ?53|ec2|s3|ci\/cd|pipelines?|deploy\w*|serverless)\b/i],
  ['APIs', /\b(?:apis?|rest|graphql|integrat\w*|webhooks?|endpoints?|sdks?|microservices?)\b/i],
  ['Data', /\b(?:databases?|sql|postgre\w*|mysql|mongo\w*|dynamodb|kafka|etl|analytics|schemas?|migrations?|prisma)\b/i],
  ['Performance', /\b(?:latency|throughput|performance|faster|optimi[sz]\w*|cach\w*|bottlenecks?|paralleli[sz]\w*)\b/i],
  ['Leadership', /\b(?:led|lead\w*|mentor\w*|coach\w*|onboard\w*|hired|managed|stakeholders?|cross-functional)\b/i],
  ['Testing', /\b(?:tests?|testing|jest|cypress|playwright|qa|coverage|code reviews?)\b/i],
  ['AI', /\b(?:ai|llms?|gpt|claude|openai|machine learning|rag|embeddings?)\b/i],
];

export function tagsOf(text: string): string[] {
  return TAGS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

/** The tags of a job's achievements with how many each has, most used first. */
export function tagCounts(texts: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const text of texts) for (const name of tagsOf(text)) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
