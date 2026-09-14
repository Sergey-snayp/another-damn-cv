/**
 * Keyword scanners are lexical, so a posting asking for "K8s" scores a miss
 * against a CV that says "Kubernetes" — a false gap that pushes people to pad
 * their resume with words they already, in substance, have.
 *
 * Each row is one concept: any member satisfies a requirement for any other.
 */
const GROUPS: string[][] = [
  ['javascript', 'js', 'ecmascript', 'es6'],
  ['typescript', 'ts'],
  ['node.js', 'node', 'nodejs'],
  ['nestjs', 'nest.js', 'nest'],
  ['next.js', 'nextjs'],
  ['react', 'react.js', 'reactjs'],
  ['react native', 'reactnative', 'rn'],
  ['vue', 'vue.js', 'vuejs'],
  ['angular', 'angular.js', 'angularjs'],
  ['postgresql', 'postgres', 'psql'],
  ['mysql', 'my sql'],
  ['mongodb', 'mongo'],
  ['elasticsearch', 'elastic search', 'elastic', 'opensearch'],
  ['redis', 'elasticache'],
  ['dynamodb', 'dynamo'],
  ['kubernetes', 'k8s', 'eks', 'gke', 'aks'],
  ['docker', 'containers', 'containerization', 'containerisation'],
  ['terraform', 'iac', 'infrastructure as code', 'cdk', 'cloudformation', 'pulumi'],
  ['aws', 'amazon web services'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure'],
  ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment',
    'github actions', 'gitlab ci', 'jenkins', 'circleci'],
  ['rest', 'rest api', 'rest apis', 'restful', 'restful api', 'restful apis', 'rest api design'],
  ['graphql', 'apollo', 'apollo server'],
  ['grpc', 'protobuf', 'protocol buffers'],
  ['websockets', 'websocket', 'socket.io', 'socketio'],
  ['openapi', 'swagger', 'api documentation', 'api documentation tools', 'api docs'],
  ['microservices', 'microservice', 'micro-services', 'service oriented architecture', 'soa'],
  ['event driven', 'event-driven', 'event driven architecture', 'pub/sub', 'pubsub',
    'message queue', 'message queues', 'kafka', 'rabbitmq', 'sqs', 'sns'],
  ['serverless', 'lambda', 'aws lambda', 'faas', 'cloud functions'],
  ['distributed systems', 'distributed system', 'distributed computing'],
  ['unit testing', 'unit tests', 'jest', 'mocha', 'vitest', 'testing'],
  ['bdd', 'cucumber', 'cucumber-js', 'gherkin'],
  ['e2e', 'end to end testing', 'integration testing', 'playwright', 'cypress', 'selenium'],
  ['observability', 'monitoring', 'datadog', 'grafana', 'prometheus', 'cloudwatch',
    'new relic', 'splunk'],
  ['authentication', 'auth', 'authn', 'oauth', 'oauth2', 'jwt', 'sso', 'saml', 'auth0', 'okta'],
  ['authorization', 'authz', 'rbac', 'abac', 'access control'],
  ['sql', 'relational database', 'relational databases', 'rdbms'],
  ['nosql', 'non-relational', 'document database'],
  ['agile', 'scrum', 'kanban', 'sprint planning'],
  ['git', 'github', 'gitlab', 'bitbucket', 'version control'],
  ['linux', 'unix', 'bash', 'shell scripting'],
  ['python', 'py'],
  ['golang', 'go lang'],
  ['c#', 'csharp', 'c sharp', '.net', 'dotnet', 'asp.net'],
  ['machine learning', 'ml', 'deep learning'],
  ['llm', 'llms', 'large language model', 'large language models', 'generative ai', 'genai'],
  ['prompt engineering', 'prompting'],
  ['langchain', 'langgraph', 'llamaindex', 'agentic ai', 'ai agents'],
  ['openai', 'gpt', 'chatgpt', 'anthropic', 'claude'],
  ['payments', 'payment processing', 'fintech', 'financial services', 'bfsi'],
  ['pci', 'pci dss', 'pci-dss'],
  ['tls', 'ssl', 'pki', 'certificates', 'x.509', 'acme'],
  ['high availability', 'ha', 'fault tolerance', 'fault-tolerant', 'resilience', 'reliability'],
  ['scalability', 'scalable', 'high load', 'high-load', 'high traffic', 'high-traffic'],
  ['performance optimization', 'performance tuning', 'performance optimisation'],
  ['code review', 'code reviews', 'peer review'],
  ['mentoring', 'mentorship', 'coaching', 'onboarding engineers'],
];

/** Postings write the same term as "event-driven", "event driven" and "event_driven". */
const key = (s: string): string =>
  s.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();

const canonical = new Map<string, number>();
GROUPS.forEach((g, i) => g.forEach((term) => canonical.set(key(term), i)));

/** Every term meaning the same thing as `term`, including itself. */
export function aliasesOf(term: string): string[] {
  const k = key(term);
  const idx = canonical.get(k);
  return idx === undefined ? [k] : [...new Set([k, ...GROUPS[idx]!])];
}

/** True when both strings name the same concept. */
export function sameConcept(a: string, b: string): boolean {
  const ia = canonical.get(key(a));
  const ib = canonical.get(key(b));
  return ia !== undefined && ia === ib;
}
