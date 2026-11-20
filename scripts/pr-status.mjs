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
const PASSED = new Set(["SUCCESS", "NEUTRAL", "SKIPPED"]);
const RUNNING = new Set(["IN_PROGRESS", "QUEUED", "PENDING", "EXPECTED", "WAITING", "REQUESTED"]);
const pending = checks.filter((c) => RUNNING.has(c.state));
// Anything not known to be a pass or still running (STALE, a state GitHub adds later) counts as failed.
const failed = checks.filter((c) => !PASSED.has(c.state) && !RUNNING.has(c.state));

const query = `query($owner:String!,$repo:String!,$number:Int!,$after:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){
  reviewThreads(first:100,after:$after){pageInfo{hasNextPage endCursor}nodes{id isResolved isOutdated path line comments(first:20){nodes{author{login} body url}}}}}}}`;
const threads = [];
for (let after = null; ; ) {
  const args = ["api", "graphql", "-f", `query=${query}`, "-f", `owner=${owner}`, "-f", `repo=${repo}`, "-F", `number=${number}`];
  if (after) args.push("-f", `after=${after}`);
  const page = JSON.parse(gh(args)).data.repository.pullRequest.reviewThreads;
  threads.push(...page.nodes);
  if (!page.pageInfo.hasNextPage) break;
  after = page.pageInfo.endCursor;
}
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

// A rate-limit or skipped-review notice stays active until CodeRabbit later
// finishes a review (a "Review finished" reply or a submitted review). It
// edits its summary comment in place, so comments are ordered by update time.
const paged = (path, jq) => JSON.parse(gh(["api", "--paginate", path, "--jq", jq]).replace(/\]\s*\[/g, ","));
const comments = paged(`repos/${owner}/${repo}/issues/${number}/comments?per_page=100`, "[.[] | {login: .user.login, at: .updated_at, body}]");
const reviews = paged(`repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`, "[.[] | {login: .user.login, at: .submitted_at, commit: .commit_id}]");
const plain = (body) => body.replace(/<[^>]+>/g, " ").replace(/[>#*]/g, " ").replace(/\s+/g, " ");
const rabbitComments = comments.filter((c) => isRabbit(c.login)).map((c) => ({ at: c.at, text: plain(c.body), body: c.body }));
// Evidence CodeRabbit reviewed this exact head: a review on that commit, or
// its summary saying it reviewed up to it ("... between <base> and <head>").
// A rate-limit notice names the head too, so it doesn't count.
const reviewedHead =
  reviews.some((r) => isRabbit(r.login) && r.commit === pr.headRefOid) ||
  rabbitComments.some(
    (c) => new RegExp(`and ${pr.headRefOid}\\b`).test(c.body) && !/rate limited|review limit reached|review skipped/i.test(c.text),
  );
const latest = (items) => items.reduce((a, b) => (!a || b.at > a.at ? b : a), null);
const restriction = latest(rabbitComments.filter((c) => /rate limited|review limit reached|review skipped/i.test(c.text)));
const cleared = latest([
  ...rabbitComments.filter((c) => /review finished/i.test(c.text) && !/rate limited|review limit reached|review skipped/i.test(c.text)),
  ...reviews.filter((r) => isRabbit(r.login) && r.at),
]);
const active = restriction && (!cleared || restriction.at > cleared.at) ? restriction : null;
const limited = Boolean(active && /rate limited|review limit reached/i.test(active.text));
const minutes = Number(active?.text.match(/available in (\d+) minutes?/i)?.[1] ?? 60);
const skipped = active && !limited ? (active.text.match(/Review skipped:?\s*(.{0,100})/i)?.[1]?.trim() ?? "review skipped") : null;
const coderabbit = {
  rateLimited: limited ? { at: active.at, retryAfter: new Date(Date.parse(active.at) + minutes * 60_000).toISOString() } : null,
  skipped,
  reviewedHead,
  openThreads,
};

const status = { url: pr.url, state: pr.state, draft: pr.isDraft, head: pr.headRefOid.slice(0, 7), changedFiles: pr.changedFiles, checks: { failed, pending, total: checks.length }, coderabbit };
const done = reviewedHead && checks.length > 0 && failed.length === 0 && pending.length === 0 && openThreads.length === 0 && !limited && !skipped;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...status, done }, null, 2));
} else {
  console.log(`${pr.url} ${pr.isDraft ? "(draft) " : ""}head ${status.head}, ${pr.changedFiles} files`);
  console.log(`CI: ${checks.length - failed.length - pending.length}/${checks.length} passed, ${pending.length} running, ${failed.length} failed${checks.length === 0 ? " (no checks yet)" : ""}`);
  for (const c of failed) console.log(`  ✘ ${c.name}: ${c.url}`);
  if (skipped) console.log(`CodeRabbit skipped the review: ${skipped}`);
  if (limited) console.log(`CodeRabbit is rate limited; ask again after ${coderabbit.rateLimited.retryAfter} with "@coderabbitai review"`);
  console.log(`CodeRabbit: ${reviewedHead ? "has reviewed" : "has NOT reviewed"} head ${status.head}; ${openThreads.length} open thread(s)`);
  if (!reviewedHead && !limited && !skipped) console.log('  ask with "@coderabbitai review" (drafts and stacked PRs get no automatic review)');
  for (const t of openThreads) console.log(`  ${t.outdated ? "(outdated) " : ""}${t.repliedByUs ? "(replied) " : ""}${t.where} ${t.summary.slice(0, 100)}\n    ${t.url}\n    thread ${t.id}`);
  console.log(done ? "DONE: CI green, nothing open from CodeRabbit" : "NOT DONE");
}
process.exit(done ? 0 : 1);
