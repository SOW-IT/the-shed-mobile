---
name: pr-shepherd
description: >-
  Drive an open PR of The Shed Mobile to green before handing it over: watch
  CI and fix failures at the root, work through every CodeRabbit comment
  (fix, or reply with the reason and resolve), wait out CodeRabbit's rate
  limit and ask again, rerun verification after every round, then update the
  PR's change report and mark it ready. Use after opening a PR (create-pr),
  or when asked to babysit, shepherd or get a PR green.
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
unresolved CodeRabbit thread with its id. It also lists the review bodies
that hold findings outside the diff, which have no thread to resolve. Once
you've dealt with those, pass the review ids:
`node scripts/pr-status.mjs <number> --ack <id>,<id>`. Nothing remembers an
ack, so pass the same ids on every later call.

## Before the loop: make sure CodeRabbit reviews at all

CodeRabbit skips some PRs without saying much. `pr-status` shows the skip:

- **Draft PRs** get no automatic review. Comment `@coderabbitai review`.
- **More than 100 files**: the free plan refuses. Split the PR into a stack
  of smaller ones (each under 100 files against its base) before going on.
  Splitting it later throws away reviews you've already had.
- It reviews each commit once ("incremental"). A rerequest after a push
  covers only the new commits.
- This repository rejects force-pushes on every branch. Don't rebase a pushed
  branch. To bring a stacked PR up to date with its base, merge the base into
  it (`git merge <base>`, or `git merge-tree` plus `git commit-tree` if a run
  is using the working tree).

## The loop

Repeat until `pr-status` exits 0 and the verification gate passes.

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
   lint, typecheck and the unit tests. Refresh the screenshots in the
   PR body if the screens changed.
4. **Push**, then ask CodeRabbit to look at the new commits:
   comment `@coderabbitai review`.
5. **Rate limit.** If `pr-status` says CodeRabbit is rate limited, it gives
   the time to ask again. CodeRabbit's notice says "Next included review
   available in N minutes", and `pr-status` assumes 60 minutes when the
   notice has no number. Wait until then in real time, using one scheduled
   wakeup or a single sleep (never a poll every few seconds). Then comment
   `@coderabbitai review` and continue from step 2.

Stop after two honest attempts at the same failure. Write the blocker at the
top of the report and hand over. Don't keep pushing guesses.

## Done

When CI is green, nothing from CodeRabbit is open and the gate passed:

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
