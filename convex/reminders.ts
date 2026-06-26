import {
  currentStep,
  FINANCE,
  requestCompleted,
  STEP_LABELS,
  type ApprovalStep,
} from "../shared/flow";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import { currentStaffYear, getApprovers, type Approvers } from "./model";
import { appUrl, openRequestsAcrossYears } from "./requests";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Reminder schedule (measured from last movement):
 *   1st nudge  → after 1 day
 *   2nd nudge  → after 3 days
 *   subsequent → every 7 days (weekly)
 */
const reminderDelayMs = (count: number): number => {
  if (count === 0) return DAY_MS;
  if (count === 1) return 3 * DAY_MS;
  return 7 * DAY_MS;
};

const remind = async (
  ctx: MutationCtx,
  to: string,
  request: Doc<"requests">,
  waitingOn: string,
  days: number,
  url: string
) => {
  const subject = `Reminder: a $${request.amount} request has been waiting ${days} days`;
  const body = `The request below has been waiting on ${waitingOn} for ${days} days. Please action it in THE SHED.\n\nRequester: ${request.requesterEmail}\nDepartment: ${request.department}\nAmount: $${request.amount}\nDescription: ${request.description}\n\nOpen in THE SHED: ${appUrl(url)}`;
  await ctx.scheduler.runAfter(0, internal.emails.send, { to, subject, body });
  await ctx.scheduler.runAfter(0, internal.push.send, {
    to,
    title: subject,
    body: `Waiting on ${waitingOn}.`,
    url,
  });
};

/**
 * Daily cron: nudges whoever a request is waiting on once it goes stale.
 * Schedule: 1st reminder after 1 day of no movement, 2nd after 3 days, then
 * every 7 days thereafter. The audit trail supplies the last-movement time;
 * lastReminderAt / reminderCount track how many have gone out.
 */
export const remindStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const year = currentStaffYear();
    const now = Date.now();
    const open = await openRequestsAcrossYears(ctx, year);

    for (const request of open) {
      if (requestCompleted(request)) continue;

      const events = await ctx.db
        .query("requestEvents")
        .withIndex("by_request", (q) => q.eq("requestId", request._id))
        .take(200);
      const lastMovement = Math.max(
        request._creationTime,
        ...events.map((event) => event._creationTime)
      );
      const count = request.reminderCount ?? 0;
      // Next reminder is due `reminderDelayMs(count)` after the last reminder
      // (or after last movement for the very first one).
      const baseline = count === 0 ? lastMovement : (request.lastReminderAt ?? lastMovement);
      if (now - baseline < reminderDelayMs(count)) continue;

      // Approvers of the request's own year, falling back to this year's
      // officeholders (carry-overs may outlive a departed approver).
      const requestYear = await getApprovers(ctx, request.year, request.department);
      const thisYear =
        request.year === year
          ? requestYear
          : await getApprovers(ctx, year, request.department);
      const pick = (selector: (a: Approvers) => string | undefined) =>
        selector(requestYear) ?? selector(thisYear);

      const step = currentStep(request);
      let to: string | undefined;
      let waitingOn = "";
      let url = "/review";
      if (step !== null) {
        const selectors: Record<ApprovalStep, (a: Approvers) => string | undefined> = {
          hod: (a) => a.hodEmail,
          budgetManager: (a) => a.budgetManagerEmail,
          director: (a) => a.directorEmail,
          financeHead: (a) => a.financeHeadEmail,
        };
        to = pick(selectors[step]);
        waitingOn = `your ${STEP_LABELS[step]} approval`;
      } else if (!request.receipt) {
        to = request.requesterEmail;
        waitingOn = "your receipt";
        url = `/request/${request._id}`;
      } else if (request.paid === false) {
        const finance = await getApprovers(ctx, request.year, FINANCE);
        const financeNow =
          request.year === year ? finance : await getApprovers(ctx, year, FINANCE);
        to = finance.financeHeadEmail ?? financeNow.financeHeadEmail;
        waitingOn = "payment";
      }
      if (!to) continue;

      const days = Math.floor((now - lastMovement) / DAY_MS);
      await remind(ctx, to, request, waitingOn, days, url);
      await ctx.db.patch("requests", request._id, {
        lastReminderAt: now,
        reminderCount: count + 1,
      });
    }
    return null;
  },
});
