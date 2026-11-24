#!/usr/bin/env node
// Where a PR stands for the pr-shepherd loop:
//   node scripts/pr-status.mjs <number> [--json] [--ack <id>,...] [--big | --not-big]
// Exit 0 when CI is green, no CodeRabbit thread is open, and a big PR's app
// and Convex changes have had a CodeRabbit review (scripts/lib/coderabbitGate.mjs);
// 1 otherwise.
import { execFileSync } from "node:child_process";
import { assessSize, coveringReview, reviewedCommits, skipReason } from "./lib/coderabbitGate.mjs";

const gh = (args) => execFileSync("gh", args, { encoding: "utf8" });
const number = process.argv[2];
if (!/^\d+$/.test(number ?? "")) {
  console.error("usage: node scripts/pr-status.mjs <pr-number> [--json] [--ack <id>,...] [--big | --not-big]");
  process.exit(2);
}
const [owner, repo] = gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]).trim().split("/");

const pr = JSON.parse(gh(["pr", "view", number, "--json", "isDraft,headRefOid,baseRefName,state,changedFiles,statusCheckRollup,url"]));
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
const reviews = paged(`repos/${owner}/${repo}/pulls/${number}/reviews?per_page=100`, "[.[] | {id, login: .user.login, at: .submitted_at, commit: .commit_id, body}]");
const plain = (body) => body.replace(/<[^>]+>/g, " ").replace(/[>#*]/g, " ").replace(/\s+/g, " ");
const rabbitComments = comments.filter((c) => isRabbit(c.login)).map((c) => ({ at: c.at, text: plain(c.body), body: c.body }));
// The commits CodeRabbit finished reviewing: a review submitted on one, or
// its summary saying it found nothing to add up to it. A range named while a
// review runs, or in a rate-limit notice, doesn't count.
const reviewedShas = reviewedCommits({ reviews: reviews.filter((r) => isRabbit(r.login)), comments: rabbitComments });
const reviewedHead = reviewedShas.includes(pr.headRefOid);
const latest = (items) => items.reduce((a, b) => (!a || b.at > a.at ? b : a), null);
const restriction = latest(rabbitComments.filter((c) => /rate limited|review limit reached|review skipped/i.test(c.text)));
const cleared = latest([
  ...rabbitComments.filter((c) => /review finished/i.test(c.text) && !/rate limited|review limit reached|review skipped/i.test(c.text)),
  ...reviews.filter((r) => isRabbit(r.login) && r.at),
]);
const active = restriction && (!cleared || restriction.at > cleared.at) ? restriction : null;
const limited = Boolean(active && /rate limited|review limit reached/i.test(active.text));
const minutes = Number(active?.text.match(/available in:?\s*(\d+) minutes?/i)?.[1] ?? 60);
const skipped = active && !limited ? skipReason(active.text) : null;

// Does this PR need a CodeRabbit review (AGENTS.md's big-PR rule), and if so
// has one covered the head? A review of an earlier commit covers it when the
// app and Convex changes are the same, as after a clean merge of main.
const fileFields = "{filename, status, sha, changes, patch, previous_filename}";
const headFiles = paged(`repos/${owner}/${repo}/pulls/${number}/files?per_page=100`, `[.[] | ${fileFields}]`);
const override = process.argv.includes("--big") ? true : process.argv.includes("--not-big") ? false : null;
const size = assessSize(headFiles, override);
// The reviewed commit's own changes against the base, as GitHub compares
// them now. Null if GitHub can't (the commit is gone).
const filesAt = (sha) => {
  try {
    return JSON.parse(gh(["api", `repos/${owner}/${repo}/compare/${pr.baseRefName}...${sha}`, "--jq", `[.files[] | ${fileFields}]`]));
  } catch {
    return null;
  }
};
const covered = size.big
  ? coveringReview({
      head: pr.headRefOid,
      headFiles,
      reviewed: [...new Set(reviewedShas)].slice(0, 10).map((sha) => ({ sha, files: sha === pr.headRefOid ? headFiles : filesAt(sha) })),
    })
  : null;
const coderabbit = {
  rateLimited: limited ? { at: active.at, retryAfter: new Date(Date.parse(active.at) + minutes * 60_000).toISOString() } : null,
  skipped,
  reviewedHead,
  required: size.big,
  size: { lines: size.lines, reasons: size.reasons, overridden: size.overridden },
  coveredBy: covered && { commit: covered.commit.slice(0, 7), how: covered.how },
  openThreads,
};
const reviewOwed = size.big && !covered;

const status = { url: pr.url, state: pr.state, draft: pr.isDraft, head: pr.headRefOid.slice(0, 7), changedFiles: pr.changedFiles, checks: { failed, pending, total: checks.length }, coderabbit };
// Findings outside the diff live only in a review body, with no thread to
// resolve. Reviews are incremental, so a finding on an earlier head isn't
// repeated later: every CodeRabbit review's findings count until its id is
// passed to --ack.
const acked = new Set((process.argv[process.argv.indexOf("--ack") + 1] ?? "").split(",").filter(Boolean));
const count = (text, label) => Number(text.match(new RegExp(`${label}\\s*\\((\\d+)\\)`, "i"))?.[1] ?? 0);
const bodyFindings = reviews
  .filter((r) => isRabbit(r.login))
  .map((r) => ({ id: String(r.id), commit: (r.commit ?? "").slice(0, 7), outsideDiff: count(plain(r.body ?? ""), "Outside diff range comments"), nitpicks: count(plain(r.body ?? ""), "Nitpick comments") }))
  .filter((r) => r.outsideDiff + r.nitpicks > 0);
const unreadBodies = bodyFindings.filter((r) => r.outsideDiff > 0 && !acked.has(r.id));
coderabbit.bodyFindings = bodyFindings;

const done = !reviewOwed && unreadBodies.length === 0 && checks.length > 0 && failed.length === 0 && pending.length === 0 && openThreads.length === 0;

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ...status, done }, null, 2));
} else {
  console.log(`${pr.url} ${pr.isDraft ? "(draft) " : ""}head ${status.head}, ${pr.changedFiles} files`);
  console.log(`CI: ${checks.length - failed.length - pending.length}/${checks.length} passed, ${pending.length} running, ${failed.length} failed${checks.length === 0 ? " (no checks yet)" : ""}`);
  for (const c of failed) console.log(`  ✘ ${c.name}: ${c.url}`);
  if (skipped) console.log(`CodeRabbit skipped the review: ${skipped}`);
  if (limited) console.log(`CodeRabbit is rate limited; ask again after ${coderabbit.rateLimited.retryAfter} with "@coderabbitai review"`);
  console.log(`CodeRabbit: ${reviewedHead ? "has reviewed" : "has not reviewed"} head ${status.head}; ${openThreads.length} open thread(s)`);
  const why = size.reasons.length > 0 ? size.reasons.join("; ") : `${size.lines} changed lines of app or Convex code, nothing sensitive`;
  if (!size.big) console.log(`  review not required: not a big PR (${why})`);
  else if (covered?.how === "reviewed head") console.log(`  review required (big PR: ${why}); done on head ${status.head}`);
  else if (covered) console.log(`  review required (big PR: ${why}); covered by the review of ${coderabbit.coveredBy.commit}, which has the same app and Convex changes`);
  else console.log(`  review required (big PR: ${why}); NOT covered: ${reviewedShas.length > 0 ? "the app or Convex changes differ from every reviewed commit" : "CodeRabbit hasn't reviewed any commit"}`);
  for (const r of bodyFindings) {
    console.log(`  review ${r.id} (on ${r.commit}): ${r.outsideDiff} outside-diff, ${r.nitpicks} nitpick finding(s) in its body${acked.has(r.id) ? " (acknowledged)" : r.outsideDiff ? "; read them, then pass --ack " + r.id : ""}`);
  }
  if (reviewOwed && !limited && !skipped) console.log('  request "@coderabbitai review" (one request at a time across PRs; see AGENTS.md)');
  for (const t of openThreads) console.log(`  ${t.outdated ? "(outdated) " : ""}${t.repliedByUs ? "(replied) " : ""}${t.where} ${t.summary.slice(0, 100)}\n    ${t.url}\n    thread ${t.id}`);
  console.log(done ? `DONE: CI green, nothing open from CodeRabbit${size.big ? ", review covers the head" : ""}` : "NOT DONE");
}
process.exit(done ? 0 : 1);
