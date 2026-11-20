#!/usr/bin/env node
// Where a PR stands for the pr-shepherd loop: node scripts/pr-status.mjs <number> [--json]
// Exit 0 when CI is green and no CodeRabbit thread is open, 1 otherwise.
import { execFileSync } from "node:child_process";

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
const number = process.argv[2];
if (!/^\d+$/.test(number ?? "")) {
  console.error("usage: node scripts/pr-status.mjs <pr-number> [--json]");
  process.exit(2);
}
const [owner, repo] = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim().split("/");

const pr = JSON.parse(gh(["pr", "view", number, "--json", "isDraft,headRefOid,state,changedFiles,statusCheckRollup,url"]));
const checks = pr.statusCheckRollup.map((c) => ({
  name: c.name ?? c.context,
  state: c.conclusion || c.status || c.state,
  url: c.detailsUrl ?? c.targetUrl,
}));
const pending = checks.filter((c) => ["IN_PROGRESS", "QUEUED", "PENDING", "EXPECTED", "WAITING"].includes(c.state));
const failed = checks.filter((c) => ["FAILURE", "ERROR", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(c.state));

const query = `query($owner:String!,$repo:String!,$number:Int!){repository(owner:$owner,name:$repo){pullRequest(number:$number){
  reviewThreads(first:100){nodes{id isResolved isOutdated path line comments(first:20){nodes{author{login} body url}}}}}}}`;
const threads = JSON.parse(
  gh(["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `repo=${repo}`, "-F", `number=${number}`])
).data.repository.pullRequest.reviewThreads.nodes;
const isRabbit = (login) => /coderabbit/i.test(login ?? "");
const openThreads = threads
  .filter((t) => !t.isResolved && isRabbit(t.comments.nodes[0]?.author?.login))
  .map((t) => ({
    id: t.id,
    where: `${t.path}:${t.line ?? "?"}`,
    outdated: t.isOutdated,
    repliedByUs: t.comments.nodes.some((c) => !isRabbit(c.author?.login)),
    url: t.comments.nodes[0].url,
    summary: t.comments.nodes[0].body.replace(/<[^>]+>/g, "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("_")) ?? "",
  }));

// CodeRabbit posts these as issue comments and edits its summary in place, so
// the most recently updated one says whether a review is waiting.
const comments = JSON.parse(gh(["api", "--paginate", `repos/${owner}/${repo}/issues/${number}/comments?per_page=100`, "--jq", "[.[] | {login: .user.login, at: .updated_at, body}]"]).replace(/\]\s*\[/g, ","));
const rabbit = comments.filter((c) => isRabbit(c.login)).sort((a, b) => a.at.localeCompare(b.at));
const last = rabbit.at(-1);
const text = (last?.body ?? "").replace(/<[^>]+>/g, " ");
const limited = /rate limited|review limit reached/i.test(text);
const minutes = Number(text.match(/available in (\d+) minutes?/i)?.[1] ?? (limited ? 60 : 0));
const flat = text.replace(/[>#*]/g, " ").replace(/\s+/g, " ");
const skipped = flat.match(/Review skipped:?\s*(.{0,100})/i)?.[1]?.trim() ?? null;
const coderabbit = {
  lastComment: last ? { at: last.at, gist: text.replace(/\s+/g, " ").trim().slice(0, 160) } : null,
  rateLimited: limited ? { at: last.at, retryAfter: new Date(Date.parse(last.at) + minutes * 60_000).toISOString() } : null,
  skipped,
  openThreads,
};

const status = { url: pr.url, state: pr.state, draft: pr.isDraft, head: pr.headRefOid.slice(0, 7), changedFiles: pr.changedFiles, checks: { failed, pending, total: checks.length }, coderabbit };
const done = failed.length === 0 && pending.length === 0 && openThreads.length === 0 && !limited && !skipped;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...status, done }, null, 2));
} else {
  console.log(`${pr.url} ${pr.isDraft ? "(draft) " : ""}head ${status.head}, ${pr.changedFiles} files`);
  console.log(`CI: ${checks.length - failed.length - pending.length}/${checks.length} passed, ${pending.length} running, ${failed.length} failed`);
  for (const c of failed) console.log(`  ✘ ${c.name}: ${c.url}`);
  if (skipped) console.log(`CodeRabbit skipped the review: ${skipped}`);
  if (limited) console.log(`CodeRabbit is rate limited; ask again after ${coderabbit.rateLimited.retryAfter} with "@coderabbitai review"`);
  console.log(`CodeRabbit: ${openThreads.length} open thread(s)`);
  for (const t of openThreads) console.log(`  ${t.outdated ? "(outdated) " : ""}${t.repliedByUs ? "(replied) " : ""}${t.where} ${t.summary.slice(0, 100)}\n    ${t.url}\n    thread ${t.id}`);
  console.log(done ? "DONE: CI green, nothing open from CodeRabbit" : "NOT DONE");
}
process.exit(done ? 0 : 1);
