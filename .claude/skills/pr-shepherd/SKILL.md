---
name: pr-shepherd
description: >-
  Drive an open PR of The Shed Mobile to green before handing it over: watch
  CI and fix failures at the root, work through every CodeRabbit comment
  (fix, or reply with the reason and resolve), request a CodeRabbit review
  only for a big PR (see AGENTS.md), rerun verification after every round,
  then update the PR's change report and mark it ready. Use after opening a
  PR (create-pr), or when asked to babysit, shepherd or get a PR green.
---

# Shepherd a PR to green

Starts after `create-pr` has opened the PR, draft or not. Ends when the PR
is ready for review and the report is written. Never merge, deploy, or run
an EAS build. Merging to `main` is a production release (CLAUDE.md).

## Where things stand

```bash
node scripts/pr-status.mjs <number>        # human summary; exit 0 means done
node scripts/pr-status.mjs <number> --json # for scripting
```

It reports failed and running checks with links, whether CodeRabbit is rate
limited and until when, whether it skipped the review and why, and every
unresolved CodeRabbit thread with its id. It also says whether the PR is big
enough to need a CodeRabbit review (below), and if so whether a review
covers the head. It also lists the review bodies
that hold findings outside the diff, which have no thread to resolve. Once
you've dealt with those, pass the review ids:
`node scripts/pr-status.mjs <number> --ack <id>,<id>`. Nothing remembers an
ack, so pass the same ids on every later call.

## Before the loop: CodeRabbit is manual, and only for big PRs

Automatic reviews are off (`.coderabbit.yaml`). Comment
`@coderabbitai review` only when the PR is **big** (the threshold in
`AGENTS.md`: more than 300 lines of app or Convex code, or it touches the
schema, data deletion or migration, auth or permissions, or notification
sending). Never request a review on any other PR. A commit that only merges
`main` in cleanly, without conflicts and without `main` changing the same
files or functions as the PR, does not need a new review. If CodeRabbit
already left threads, still fix or reply and resolve them.

`pr-status` applies this rule (`scripts/lib/coderabbitGate.mjs`):

- **Big** means more than 300 changed lines in `src/`, `shared/` or `convex/`
  (not tests or `convex/_generated`), or one of those files matching a
  sensitive area: the schema, deletion or migration (by name, or a
  `db.delete`/`storage.delete` line in the diff), auth or permissions, or
  push or email notifications. Scripts, docs, config and tests never count.
- **Covered** means CodeRabbit reviewed the head, or reviewed an earlier
  commit whose app and Convex changes are the same: the same files, each
  with the same resulting content. A clean merge of `main` keeps that. A new
  commit to those files, or a conflict resolved in one, doesn't. A later
  change only to tests, scripts or docs doesn't need a new review.
- The rules go by path, so they can be wrong. If your reading of AGENTS.md
  differs, pass `--big` or `--not-big`, and say why in the PR.

Other skip rules still apply when you do request a review:

- **More than 100 files**: the free plan refuses. Split the PR into a stack
  of smaller ones (each under 100 files against its base) before going on.
  Splitting it later throws away reviews you've already had.
- A request after a push covers only the new commits.
- This repository rejects force-pushes on every branch. Don't rebase a pushed
  branch. To bring a stacked PR up to date with its base, merge the base into
  it (`git merge <base>`, or `git merge-tree` plus `git commit-tree` if a run
  is using the working tree).

## Versions: never renumber

PRs carry no version (AGENTS.md, "Versions and the changelog"); `main` is
numbered after each merge. Merging `main` in never needs a renumber. If a PR
still edits the version or `CHANGELOG.md` (opened before the change), take
`main`'s side of every version line, move the PR's changelog section into a
`changelog.d/<branch>.md` file, drop the version from the title
(`gh pr edit <number> --title ...`), and commit that with the merge.

## The loop

Repeat until `pr-status` exits 0 and the verification gate passes.
`pr-status` exit 0 means CI is green, no CodeRabbit threads are open, and,
for a big PR, a CodeRabbit review covers the head.

1. **CI.** `gh pr checks <number> --watch`. For each failure, read
   `gh run view <run-id> --log-failed`, reproduce it locally, and fix the
   cause. Don't retry a flaky step hoping it passes, and don't skip a check.
2. **CodeRabbit.** Read every open thread in full
   (`gh api repos/{owner}/{repo}/pulls/<number>/comments --paginate`), and
   the review bodies (`gh api repos/{owner}/{repo}/pulls/<number>/reviews --paginate`)
   for nitpicks and outside-the-diff comments that have no thread. Judge each
   on its merits. CodeRabbit finds real bugs and also posts noise.
   - **Valid**: fix it, and reply on the thread with the commit that fixed it.
   - **Not valid, or out of scope**: reply with the concrete reason in one or
     two sentences.
   - Then resolve the thread:
     `gh api graphql -f query='mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}' -f id=<thread id>`
3. **Verification gate.** After a round of fixes, before pushing:
   `node scripts/verify.mjs --publish` (the `verify` skill), which also runs
   lint, knip, typecheck and the unit tests. Refresh the screenshots in the
   PR body if the screens changed.
4. **Push.** Run `pr-status` again. Comment `@coderabbitai review` only
   when it says a review is required and not covered. It stays covered
   after a clean merge of `main`.
5. **Rate limit** (big PRs only). If `pr-status` says CodeRabbit is rate
   limited, it gives the time to ask again. CodeRabbit's notice says "Next
   included review available in N minutes", and `pr-status` assumes 60
   minutes when the notice has no number. Wait until then in real time,
   using one scheduled wakeup or a single sleep (never a poll every few
   seconds). Then comment `@coderabbitai review` and continue from step 2.

Stop after two honest attempts at the same failure. Write the blocker at the
top of the report and hand over. Don't keep pushing guesses.

## Done

When `pr-status` exits 0 (CI green, no CodeRabbit threads open, and for a
big PR a review covering the head) and the gate passed:

1. Rewrite the PR description as the change report (template below).
2. `gh pr ready <number>`.
3. Write the same report to the file the task asked for, with absolute
   paths for every screenshot.

## Change report template

```markdown
## What changed and why
Plain words, for someone who didn't write it: what a person using the app,
or the next developer, will notice.

## Verification
| Step | Result |
| --- | --- |
(the summary.md table from verify: tier, reasons, each step)

## Screenshots
(the screenshots.md table from `verify --publish`, every changed screen,
before and after)

## Fixed during review
- CI: what failed, the cause, the fix (commit)
- CodeRabbit: each accepted comment and its fix; each declined one and why

## Not verified
What the route flows don't drive, and how it was checked instead.
```
