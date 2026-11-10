/**
 * How a line reads for a recruiter who is not technical: too many tool names in
 * one line, or an acronym they would not know and the CV never spells out.
 * Checked on the page, no AI; each note says what to do about it.
 */

/** Acronyms a recruiter reads without help. */
const KNOWN = new Set(
  'API APIS AWS GCP SQL NOSQL REST HTTP HTTPS JSON XML CSV PDF UI UX AI ML LLM LLMS NLP QA CI CD SDK SAAS B2B B2C CRM ERP KPI KPIS SLA SLAS SEO IT HR CEO CTO CFO MVP US UK EU USA GDPR PCI SOC ISO IOS CSS HTML JWT TLS SSL DNS SSO MFA VPN IOT ETL BI DEVOPS OAUTH SAML RBAC SMS PR PHP TV ID IDS OK AM PM'.split(' '),
);
/** Tool names that read like ordinary words, so the patterns below would miss them. */
const TOOLS = /\b(?:Kafka|Redis|Docker|Kubernetes|Terraform|Lambda|Jest|Cypress|Playwright|Postgres|PostgreSQL|MySQL|MongoDB|DynamoDB|React|Angular|Vue|Express|NestJS|Prisma|Python|Java|Kotlin|Swift|Rust|Ruby|Rails|Django|Flask|Spring|GraphQL|Grafana|Prometheus|Datadog|Sentry|Jenkins|CircleCI|GitHub|GitLab|Webpack|Vite|Elasticsearch|RabbitMQ|EventBridge|CloudWatch|Serverless|Snowflake|Airflow|Spark|Hadoop|Tableau|Figma|Jira|Step Functions|Secrets Manager|Cucumber|Mocha|Chai|Sinon|Sequelize|TypeORM|Nginx|Linux|Bash|Helm|Ansible|Pulumi|CloudFormation|Firebase|Supabase|Vercel|Netlify|Stripe|Twilio|Salesforce|SAP)\b/g;
/** CamelCase (TypeScript), .js names (Node.js), letters with digits (Route53, EC2), and acronyms. */
const SHAPED = /\b(?:[A-Za-z]+\.js|[A-Z][a-z]+[A-Z][A-Za-z]*|[A-Za-z]+\d+[A-Za-z\d]*|[A-Z]{2,}[a-z]*)\b/g;
const ACRONYM = /\b[A-Z][A-Z0-9]{1,6}s?\b/g;

/**
 * Notes for one line; `context` is the rest of the CV, where an acronym may be spelled out.
 * `countTerms: false` for the Profile, which keeps every achievement in full technical
 * detail; a CV line, chosen for one posting, is held to fewer.
 */
export function recruiterFlags(line: string, context = '', options: { countTerms?: boolean } = {}): string[] {
  const text = line.replace(/\*\*/g, '');
  const terms = new Set([...text.matchAll(TOOLS), ...text.matchAll(SHAPED)].map((match) => match[0].toLowerCase()));
  const notes: string[] = [];
  // A bullet may show its mechanism (the standard), but a line that is mostly names loses a recruiter.
  if (options.countTerms !== false && terms.size > 6)
    notes.push(`${terms.size} technical terms in one line. Keep the ones that show how it worked; the rest fit the tech stack line.`);
  const spelled = `${context}\n${text}`;
  const unknown = [
    ...new Set(
      [...text.matchAll(ACRONYM)]
        .map((match) => match[0])
        .filter((word) => !/\d/.test(word) && !KNOWN.has(word.toUpperCase()) && !KNOWN.has(word.replace(/s$/, '').toUpperCase()))
        .filter((word) => !new RegExp(`\\(${word}\\)|\\b${word}\\s*\\(`).test(spelled)),
    ),
  ].slice(0, 2);
  if (unknown.length)
    notes.push(`A recruiter may not know ${unknown.join(' or ')}. Spell it out once, or leave it out.`);
  return notes;
}
