/**
 * Keyword match between a job posting and a CV.
 *
 * Keywords come from a fixed skills list, so the score is predictable and free:
 * no model reads the posting. It answers "does my CV mention what the posting
 * asks for?", not "how deep is my experience?" — the card says so.
 *
 * Each skill has spellings that count as the same thing ("node", "nodejs",
 * "Node.js"). Short words that are also English ("Go", "Swift", "Spark") only
 * count when written with a capital, as product names are.
 */

const SKILLS = [
  // languages
  ['JavaScript', 'javascript', 'js', 'ecmascript', 'es6'], ['TypeScript', 'typescript', 'ts'], ['Python', 'python'],
  ['Java', 'java'], ['Kotlin', 'kotlin'], ['Scala', 'scala'], ['Go', 'golang', { exact: 'Go' }], ['Rust', { exact: 'Rust' }],
  ['C++', 'c++', 'cpp'], ['C#', 'c#', 'csharp'], ['.NET', '.net', 'dotnet', 'asp.net'], ['PHP', 'php'], ['Ruby', 'ruby'],
  ['Swift', { exact: 'Swift' }], ['Objective-C', 'objective-c'], ['Dart', { exact: 'Dart' }], ['Elixir', 'elixir'],
  ['Erlang', 'erlang'], ['Clojure', 'clojure'], ['Haskell', 'haskell'], ['Perl', 'perl'], ['Lua', { exact: 'Lua' }],
  ['Bash', 'bash', 'shell scripting'], ['SQL', 'sql'], ['PL/SQL', 'pl/sql', 'plsql'], ['Solidity', 'solidity'],
  // frontend
  ['React', 'react', 'react.js', 'reactjs'], ['Next.js', 'next.js', 'nextjs'], ['Vue', 'vue', 'vue.js', 'vuejs'], ['Nuxt', 'nuxt', 'nuxt.js'],
  ['Angular', 'angular', 'angularjs'], ['Svelte', 'svelte', 'sveltekit'], ['Redux', 'redux'], ['MobX', 'mobx'], ['RxJS', 'rxjs'],
  ['HTML', 'html', 'html5'], ['CSS', 'css', 'css3'], ['Sass', 'sass', 'scss'], ['Tailwind', 'tailwind', 'tailwindcss'],
  ['Webpack', 'webpack'], ['Vite', { exact: 'Vite' }], ['jQuery', 'jquery'], ['React Native', 'react native'], ['Flutter', 'flutter'],
  ['Electron', 'electron'], ['Storybook', 'storybook'], ['Web Components', 'web components'],
  // backend & runtimes
  ['Node.js', 'node.js', 'nodejs', { exact: 'Node' }], ['NestJS', 'nestjs', 'nest.js'], ['Express', 'express.js', 'expressjs', { exact: 'Express' }],
  ['Fastify', 'fastify'], ['Deno', 'deno'], ['Bun', { exact: 'Bun' }], ['Django', 'django'], ['Flask', 'flask'], ['FastAPI', 'fastapi'],
  ['Spring', 'spring boot', 'spring framework', { exact: 'Spring' }], ['Hibernate', 'hibernate'], ['Ruby on Rails', 'rails', 'ruby on rails'],
  ['Laravel', 'laravel'], ['Symfony', 'symfony'], ['ASP.NET Core', 'asp.net core'], ['Gin', { exact: 'Gin' }],
  ['Prisma', 'prisma'], ['TypeORM', 'typeorm'], ['Sequelize', 'sequelize'], ['Mongoose', 'mongoose'], ['SQLAlchemy', 'sqlalchemy'],
  // APIs & architecture
  ['REST', 'restful', 'rest api', 'rest apis', { exact: 'REST' }], ['GraphQL', 'graphql'], ['gRPC', 'grpc'], ['WebSockets', 'websocket', 'websockets'],
  ['OpenAPI', 'openapi', 'swagger'], ['Microservices', 'microservices', 'microservice'], ['Event-driven', 'event-driven', 'event driven'],
  ['Serverless', 'serverless'], ['Domain-Driven Design', 'domain-driven design', 'ddd'], ['CQRS', 'cqrs'], ['Event sourcing', 'event sourcing'],
  ['Clean Architecture', 'clean architecture', 'hexagonal architecture'], ['System design', 'system design', 'distributed systems'],
  ['OAuth', 'oauth', 'oauth2', 'openid connect', 'oidc'], ['JWT', 'jwt'], ['SSO', 'sso', 'saml'],
  // data stores
  ['PostgreSQL', 'postgresql', 'postgres', 'psql'], ['MySQL', 'mysql'], ['MariaDB', 'mariadb'], ['SQL Server', 'sql server', 'mssql'],
  ['Oracle', { exact: 'Oracle' }], ['SQLite', 'sqlite'], ['MongoDB', 'mongodb', 'mongo'], ['Redis', 'redis'], ['Elasticsearch', 'elasticsearch', 'elastic search', 'opensearch'],
  ['Cassandra', 'cassandra'], ['DynamoDB', 'dynamodb'], ['ClickHouse', 'clickhouse'], ['Snowflake', 'snowflake'], ['BigQuery', 'bigquery'],
  ['Redshift', 'redshift'], ['Neo4j', 'neo4j'], ['Firebase', 'firebase', 'firestore'], ['Supabase', 'supabase'], ['Memcached', 'memcached'],
  // messaging & streaming
  ['Kafka', 'kafka'], ['RabbitMQ', 'rabbitmq'], ['SQS', 'sqs'], ['SNS', { exact: 'SNS' }], ['Kinesis', 'kinesis'], ['NATS', { exact: 'NATS' }],
  ['Pub/Sub', 'pub/sub', 'pubsub'], ['BullMQ', 'bullmq', 'bull queue'], ['Celery', 'celery'],
  // cloud & infrastructure
  ['AWS', 'aws', 'amazon web services'], ['GCP', 'gcp', 'google cloud'], ['Azure', 'azure'], ['Lambda', 'aws lambda', { exact: 'Lambda' }],
  ['EC2', 'ec2'], ['S3', { exact: 'S3' }], ['ECS', { exact: 'ECS' }], ['EKS', { exact: 'EKS' }], ['CloudFormation', 'cloudformation'],
  ['Docker', 'docker', 'containers', 'containerization'], ['Kubernetes', 'kubernetes', 'k8s'], ['Helm', { exact: 'Helm' }],
  ['Terraform', 'terraform'], ['Pulumi', 'pulumi'], ['Ansible', 'ansible'], ['Linux', 'linux', 'unix'], ['Nginx', 'nginx'],
  ['CI/CD', 'ci/cd', 'continuous integration', 'continuous delivery', 'continuous deployment'], ['GitHub Actions', 'github actions'],
  ['GitLab CI', 'gitlab ci', 'gitlab-ci'], ['Jenkins', 'jenkins'], ['CircleCI', 'circleci'], ['ArgoCD', 'argocd', 'argo cd'],
  ['Infrastructure as Code', 'infrastructure as code', 'iac'], ['Vercel', 'vercel'], ['Heroku', 'heroku'], ['Cloudflare', 'cloudflare'],
  // observability & reliability
  ['Prometheus', 'prometheus'], ['Grafana', 'grafana'], ['Datadog', 'datadog'], ['New Relic', 'new relic'], ['Sentry', 'sentry'],
  ['OpenTelemetry', 'opentelemetry'], ['ELK', { exact: 'ELK' }], ['Observability', 'observability', 'monitoring'], ['SRE', 'sre', 'site reliability'],
  ['High availability', 'high availability', 'high-load', 'highload', 'high load', 'scalability'], ['Performance optimization', 'performance optimization', 'performance tuning'],
  // testing & quality
  ['Unit testing', 'unit testing', 'unit tests'], ['Integration testing', 'integration testing', 'integration tests'], ['TDD', 'tdd', 'test-driven'],
  ['Jest', 'jest'], ['Mocha', 'mocha'], ['Vitest', 'vitest'], ['Cypress', 'cypress'], ['Playwright', 'playwright'], ['Selenium', 'selenium'],
  ['Pytest', 'pytest'], ['JUnit', 'junit'], ['Code review', 'code review', 'code reviews'],
  // data & ML
  ['Machine learning', 'machine learning', 'ml'], ['Deep learning', 'deep learning'], ['LLM', 'llm', 'llms', 'large language models'],
  ['NLP', 'nlp'], ['PyTorch', 'pytorch'], ['TensorFlow', 'tensorflow'], ['scikit-learn', 'scikit-learn', 'sklearn'], ['Pandas', 'pandas'],
  ['NumPy', 'numpy'], ['Spark', 'pyspark', { exact: 'Spark' }], ['Airflow', 'airflow'], ['dbt', { exact: 'dbt' }], ['ETL', 'etl', 'elt'],
  ['Data modeling', 'data modeling', 'data modelling'], ['Tableau', 'tableau'], ['Power BI', 'power bi'], ['OpenAI', 'openai'], ['RAG', { exact: 'RAG' }],
  // security & payments
  ['Security', 'application security', 'appsec', 'owasp'], ['PCI DSS', 'pci dss', 'pci-dss'], ['GDPR', 'gdpr'], ['SOC 2', 'soc 2', 'soc2'],
  ['Payments', 'payments', 'payment', 'stripe', 'fintech'],
  // tools & practices
  ['Git', 'git'], ['Agile', 'agile', 'scrum', 'kanban'], ['Jira', 'jira'], ['Figma', 'figma'], ['Mentoring', 'mentoring', 'mentorship'],
  ['Technical leadership', 'tech lead', 'technical leadership', 'team lead'],
];

const REQUIRED = /requirements|qualifications|must[- ]have|what you('|’)ll need|what we('|’)re looking for|you (have|bring)|skills|experience|вимоги|обов['’]язково|необхідн|требования|обязательно/i;
const NICE = /nice[- ]to[- ]have|bonus|is a plus|would be a plus|preferred|good to have|буде плюсом|плюсом|желательно|будет плюсом/i;
const OTHER = /responsibilities|what you('|’)ll do|about (us|the (role|team|company))|benefits|we offer|perks|обов['’]язки|пропонуємо|про (нас|компанію)|мы предлагаем|обязанности/i;
const JOB_SECTIONS = [REQUIRED, NICE, OTHER, /\b(role|position|vacancy|apply|salary|remote|hybrid|full[- ]time)\b|ваканс|зарплат|віддален/i];

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function patternFor(spelling) {
  const exact = typeof spelling === 'object';
  const word = exact ? spelling.exact : spelling;
  // Not inside a longer word: "Java" is not in "JavaScript", "ts" not in "tests".
  return new RegExp(`(?<![\\p{L}\\p{N}+#.])${escape(word)}(?![\\p{L}\\p{N}+#]|\\.[\\p{L}\\p{N}])`, exact ? 'u' : 'iu');
}
const COMPILED = SKILLS.map(([name, ...spellings]) => ({ name, patterns: (spellings.length ? spellings : [name.toLowerCase()]).map(patternFor) }));
const mentions = (skill, text) => skill.patterns.some(pattern => pattern.test(text));

/**
 * The skills a posting asks for, most important first. Weight 2 when listed
 * under requirements or mentioned on 2+ lines; weight 1 otherwise, and always
 * 1 when only listed as nice to have.
 */
export function findKeywords(jobText, limit = 20) {
  const lines = String(jobText ?? '').split(/\n+/).map(line => line.trim()).filter(Boolean);
  const found = new Map();
  let section = 'other';
  lines.forEach((line, index) => {
    const skills = COMPILED.filter(skill => mentions(skill, line));
    // A heading ends with ':' or is a short line naming no skill ("Requirements").
    const heading = /:$/.test(line) || (line.length <= 45 && !skills.length && !/[.!?]$/.test(line));
    if (heading && NICE.test(line)) section = 'nice';
    else if (heading && REQUIRED.test(line)) section = 'required';
    else if (heading && OTHER.test(line)) section = 'other';
    const where = NICE.test(line) && !heading ? 'nice' : section;
    for (const skill of skills) {
      // Reading order: line first, then position in the line.
      const at = index * 100_000 + Math.min(...skill.patterns.map(pattern => line.search(pattern)).filter(position => position >= 0));
      const entry = found.get(skill.name) ?? { name: skill.name, lines: 0, required: false, nice: false, first: at };
      entry.lines += 1;
      if (where === 'required') entry.required = true;
      if (where === 'nice') entry.nice = true;
      found.set(skill.name, entry);
    }
  });
  return [...found.values()]
    .map(entry => ({ name: entry.name, weight: entry.required || (entry.lines >= 2 && !entry.nice) ? 2 : 1, first: entry.first }))
    .sort((a, b) => b.weight - a.weight || a.first - b.first)
    .slice(0, limit)
    .map(({ name, weight }) => ({ name, weight }));
}

/** How much of the posting's keywords this CV text covers. */
export function scoreCv(keywords, cvText) {
  const text = String(cvText ?? '');
  const matched = [], missing = [];
  let have = 0, total = 0;
  for (const keyword of keywords) {
    const skill = COMPILED.find(entry => entry.name === keyword.name);
    total += keyword.weight;
    if (skill && mentions(skill, text)) { matched.push(keyword.name); have += keyword.weight; }
    else missing.push(keyword.name);
  }
  return { score: total ? Math.round((100 * have) / total) : 0, matched, missing };
}

export function matchLabel(score) {
  return score >= 80 ? 'Strong' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Low';
}

/** The job text from a capture: the page's JobPosting data when present. */
export function jobFromCapture(capture) {
  const posting = findPosting(capture?.jsonLd);
  if (posting?.description) {
    const description = String(posting.description)
      .replace(/<\/(p|li|h\d|div|ul|ol)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
      .replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim();
    return { title: posting.title ?? capture.pageTitle, text: `${posting.title ?? ''}\n${description}`, structured: true };
  }
  return { title: capture?.pageTitle ?? '', text: capture?.text ?? '', structured: false };
}

function findPosting(value) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) { for (const item of value) { const hit = findPosting(item); if (hit) return hit; } return null; }
  const type = [].concat(value['@type'] ?? []);
  if (type.includes('JobPosting')) return value;
  return findPosting(value['@graph']);
}

/**
 * Whether the page holds a job description worth scoring: the page's own
 * JobPosting data, a site rule for the open job (LinkedIn, Indeed…), or
 * description-like sections plus enough skills.
 */
export function looksLikeJobPosting(capture, job, keywords) {
  if (keywords.length < 3) return false;
  if (job.structured) return true;
  if (capture?.matched && !/whole page|main content/.test(capture.matched)) return true;
  const text = job.text.slice(0, 40_000);
  return JOB_SECTIONS.filter(pattern => pattern.test(text)).length >= 3;
}
