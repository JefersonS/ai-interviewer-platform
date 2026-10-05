// The browser recognizer has no custom vocabulary, so it mishears tech terms.
// Each entry maps common mishearings (regex source) to the canonical spelling.
const TERMS: Array<[string, string]> = [
  ["(?:no|node|know|note|nodes)[ .]?js", "Node.js"],
  ["next[ .]?js", "Next.js"],
  ["react[ .]?js", "React"],
  ["vue[ .]?js", "Vue"],
  ["express[ .]?js", "Express"],
  ["type ?script", "TypeScript"],
  ["java ?script", "JavaScript"],
  ["post ?gr(?:e|a)s(?:s|ql| q l)?|postgres q l|postgre ?sql", "PostgreSQL"],
  ["my ?sequel|my s q l", "MySQL"],
  ["sequel(?: ?lite)?|s q l", "SQL"],
  ["mongo ?d b|mongo ?db", "MongoDB"],
  ["re+dis", "Redis"],
  ["cooper? ?net(?:t)?(?:i|e)es|kuber ?net(?:e|i)s|k8s", "Kubernetes"],
  ["graph ?q l|graph ql", "GraphQL"],
  ["g ?rpc|g r p c", "gRPC"],
  ["a ?w ?s", "AWS"],
  ["g ?c ?p", "GCP"],
  ["c ?i[ /]?c ?d", "CI/CD"],
  ["o ?auth|oh auth", "OAuth"],
  ["j ?w ?t", "JWT"],
  ["a ?p ?is?", "API"],
  ["rest ?ful", "RESTful"],
  ["web ?sockets?", "WebSocket"],
  ["tailwind ?css", "Tailwind CSS"],
  ["kafka", "Kafka"],
  ["rabbit ?m ?q", "RabbitMQ"],
  ["terra ?form", "Terraform"],
  ["docker", "Docker"],
];

const COMPILED = TERMS.map(([src, out]) => [new RegExp(`\\b(?:${src})\\b`, "gi"), out] as const);

export function fixTechTerms(text: string): string {
  return COMPILED.reduce((acc, [re, out]) => acc.replace(re, out), text);
}
