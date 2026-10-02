import { execFileSync } from "node:child_process";

const [head, base] = process.argv.slice(2);
if (!head) {
  console.error("Usage: node scripts/check-commit-messages.mjs <head-sha> [base-sha]");
  process.exit(2);
}

const range = base ? `${base}..${head}` : head;
const commits = execFileSync(
  "git",
  ["rev-list", "--no-merges", range],
  { encoding: "utf8" }
).trim().split(/\r?\n/).filter(Boolean);
const disallowedNames = /\b(copilot|claude|chatgpt|openai|codex|gemini|cursor|cline|devin)\b/i;
const violations = [];

for (const commit of commits) {
  const metadata = execFileSync(
    "git",
    ["show", "-s", "--format=%an%n%cn%n%B", commit],
    { encoding: "utf8" }
  );
  if (disallowedNames.test(metadata)) violations.push(commit);
}

if (violations.length) {
  console.error("Commit metadata must not attribute work to AI assistants or coding agents:");
  for (const commit of violations) console.error(`- ${commit}`);
  process.exit(1);
}

console.log(`Checked ${commits.length} commit(s); no AI or agent attribution found.`);
