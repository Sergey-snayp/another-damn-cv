/**
 * The posting's words for work a CV line already shows.
 *
 * Postings name practices ("observability", "event-driven", "reliability");
 * CVs describe the work itself ("CloudWatch alarms and dashboards", "a Kafka
 * event pipeline", "a restored retry"). When a posting asks for a practice and
 * a line shows evidence of it, the AI is told so, and names the work the way
 * the posting does. A practice with no evidence in the line is never offered,
 * so nothing is claimed that the line does not show.
 */

interface Practice {
  /** How a posting asks for it. The first match is the posting's own wording. */
  posting: RegExp;
  /** What in a CV line counts as that work. */
  evidence: RegExp[];
  /** The line already names it this way: nothing to add. Defaults to `posting`. */
  named?: RegExp;
}

const PRACTICES: Practice[] = [
  {
    posting: /\b(?:observability|monitoring)\b/i,
    evidence: [
      /\b(?:CloudWatch|Datadog|Grafana|Prometheus|New Relic|Sentry|OpenTelemetry|Splunk|ELK|Kibana|X-Ray)\b/i,
      /\b(?:alarms?|alerts?|alerting|dashboards?|tracing|traces|metrics|structured logging)\b/i,
    ],
  },
  {
    posting: /\bevent[- ]driven\b|\bevent streaming\b|\basynchronous messaging\b|\bmessage queues?\b/i,
    evidence: [
      /\b(?:Kafka|SQS|SNS|EventBridge|RabbitMQ|Pub\/Sub|Kinesis|NATS)\b/i,
      /\b(?:event pipeline|events|queues?|async(?:hronous)? workflows?)\b/i,
    ],
    named: /\bevent[- ]driven\b/i,
  },
  {
    posting: /\bdistributed systems?\b/i,
    evidence: [
      /\b(?:retry storms?|retries|idempoten\w*|concurren\w*|race conditions?|eventual consistency)\b/i,
      /\b\d+-service\b/i,
    ],
  },
  {
    posting: /\bmicro-?services?\b/i,
    evidence: [
      /\b(?:\d+|three|four|five|six|seven|eight|nine|ten|several|multiple)(?: \w+)? services\b/i,
      /\b\d+-service\b/i,
    ],
  },
  {
    posting: /\b(?:reliab\w*|resilien\w*|fault[- ]toleran\w*|high availability|uptime)\b/i,
    evidence: [
      /\b(?:retry|retries|failover|idempoten\w*|circuit breakers?|incidents?|on-call|outages?|timeouts?|root cause|failure (?:modes|handling)|live production support)\b/i,
    ],
  },
  {
    posting: /\b(?:scalab\w*|at scale|high[- ](?:load|traffic|throughput))\b/i,
    evidence: [
      /\b\d[\d,.]*(?:\s*(?:to|–|-)\s*\d[\d,.]*)?\s*(?:k|million)?\s*(?:requests|transactions|events|messages|users|calls)\s*(?:per|a|each|\/)\s*(?:second|minute|hour|day)\b/i,
      /\b(?:throughput|bottlenecks?|parallelis\w*|paralleliz\w*)\b/i,
    ],
  },
  {
    posting: /\bperformance\b/i,
    evidence: [
      /\b(?:latency|throughput|bottlenecks?|parallelis\w*|paralleliz\w*|caching|faster|response times?)\b/i,
    ],
  },
  {
    posting: /\bAPI design\b|\bAPI-first\b|\bdesign(?:ing)? APIs\b/i,
    evidence: [/\b(?:REST|GraphQL|OpenAPI|Swagger|endpoints?)\b/i],
  },
  {
    posting: /\b(?:integrations?|third[- ]party (?:APIs?|systems|services)|interoperab\w*)\b/i,
    evidence: [/\b(?:partners?|providers?|adapters?|webhooks?|third[- ]party|card networks?)\b/i],
    named: /\bintegrat\w*/i,
  },
  {
    posting: /\b(?:security|secure coding|compliance|SOC ?2)\b/i,
    evidence: [
      /\b(?:PCI DSS|OAuth|SAML|JWT|RBAC|encryption|KMS|Secrets Manager|vulnerabilit\w*|audits?|TLS|X\.509|PKCE)\b/i,
    ],
    named: /\b(?:secur\w*|complian\w*)\b/i,
  },
  {
    posting: /\btest automation\b|\bautomated (?:tests?|testing)\b|\bTDD\b|\bBDD\b/i,
    evidence: [
      /\b(?:Jest|Mocha|Cucumber|Cypress|Playwright|Chai|Sinon|unit tests?|integration tests?|end-to-end tests?|test coverage|regression tests?)\b/i,
    ],
    named: /\btest\w*/i,
  },
  {
    posting: /\bCI\/CD\b|\bcontinuous (?:integration|delivery|deployment)\b|\bdeployment pipelines?\b/i,
    evidence: [/\b(?:GitLab CI|GitHub Actions|Jenkins|CircleCI|release pipelines?|deploy(?:ed|ment)s?)\b/i],
  },
  {
    posting: /\bserverless\b/i,
    evidence: [/\b(?:Lambda|Step Functions|Cloud Functions|Azure Functions)\b/i],
  },
  {
    posting: /\binfrastructure as code\b|\bIaC\b/i,
    evidence: [/\b(?:CDK|Terraform|CloudFormation|Pulumi)\b/i],
  },
  {
    posting: /\bdata model(?:ing|ling|s)?\b|\bschema design\b/i,
    evidence: [/\b(?:schemas?|migrations?|Prisma|entities)\b/i],
  },
  {
    posting: /\bmentor\w*|\bcoach\w*/i,
    evidence: [/\b(?:mentored|onboarded|coached|trained)\b/i],
  },
  {
    posting: /\bcode reviews?\b/i,
    evidence: [/\b(?:reviewed (?:code|pull requests|changes)|pull requests?)\b/i],
  },
  {
    posting: /\bcross[- ]functional\b|\bstakeholders?\b/i,
    evidence: [
      /\b(?:with|alongside|for) (?:the )?(?:product|client|business|analysts?|designers?|QA|compliance)\b/i,
    ],
  },
  {
    posting: /\bend[- ]to[- ]end\b|\bownership\b/i,
    evidence: [/\bfrom (?:technical )?design (?:through|to) (?:release|production|launch)\b/i, /\bowned\b/i],
  },
  {
    posting: /\b(?:LLMs?|generative AI|GenAI|AI[- ]powered|AI features?|AI-enabled)\b/i,
    evidence: [/\b(?:Anthropic|OpenAI|Claude|GPT|LLM|RAG|copilot|embeddings?|MCP)\b/i],
  },
  {
    posting: /\bdocument processing\b|\bdata extraction\b|\bdocument automation\b/i,
    evidence: [/\b(?:OCR|pars(?:ed|ing|er)|extract\w*|PDFs?)\b/i],
  },
];

export interface PracticeHint {
  /** The posting's own wording ("observability", "CI/CD"). */
  term: string;
  /** What in the line is that work ("CloudWatch", "alarms"). */
  evidence: string[];
}

/** "Observability" → "observability"; "CI/CD", "TDD", "LLMs" keep their capitals. */
const asWritten = (text: string) => (/[A-Z].*[A-Z]/.test(text) ? text : text.toLowerCase());
const unmarked = (text: string) => text.replace(/\*\*/g, '');

/**
 * Practices the posting asks for that the line shows evidence of and does not
 * name yet, in the posting's words, at most `limit`.
 */
export function practiceHints(jobText: string, lineText: string, limit = 3): PracticeHint[] {
  const line = unmarked(lineText);
  const hints: PracticeHint[] = [];
  for (const practice of PRACTICES) {
    const asked = practice.posting.exec(jobText);
    if (!asked) continue;
    if ((practice.named ?? practice.posting).test(line)) continue;
    const evidence = [
      ...new Set(
        practice.evidence.flatMap((pattern) =>
          [...line.matchAll(new RegExp(pattern.source, 'gi'))].map((match) => match[0]),
        ),
      ),
    ].slice(0, 3);
    if (!evidence.length) continue;
    hints.push({ term: asWritten(asked[0]), evidence });
    if (hints.length === limit) break;
  }
  return hints;
}

/** The hints as lines for a prompt; '' when there are none. */
export function practiceHintText(hints: PracticeHint[]): string {
  if (!hints.length) return '';
  return [
    "The posting's words for work this line already shows. Name the work the way the posting does, where it reads naturally, and keep every fact the line has:",
    ...hints.map((hint) => `- "${hint.term}": the line's ${hint.evidence.join(', ')}`),
  ].join('\n');
}
