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
import { openRequestsAcrossYears } from "./requests";

/** A request is considered stale after a week without movement. */
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const remind = async (
  ctx: MutationCtx,
  to: string,
  request: Doc<"requests">,
  waitingOn: string,
  days: number
) => {
  const subject = `Reminder: a $${request.amount} request has been waiting ${days} days`;
  const body = `The request below has been waiting on ${waitingOn} for ${days} days. Please action it in THE SHED.\n\nRequester: ${request.requesterEmail}\nDepartment: ${request.department}\nAmount: $${request.amount}\nDescription: ${request.description}`;
  await ctx.scheduler.runAfter(0, internal.emails.send, { to, subject, body });
  await ctx.scheduler.runAfter(0, internal.push.send, {
    to,
    title: subject,
    body: `Waiting on ${waitingOn}.`,
  });
};

/**
 * Daily cron: nudges whoever a request is waiting on once it has sat still
 * for 7+ days (approver of the pending step, the requester for a missing
 * receipt, or the Finance Head for an unpaid receipt). The audit trail
 * supplies the last-movement time; lastReminderAt stops daily re-nagging,
 * so an untouched request gets one nudge per week.
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
      const lastTouch = Math.max(lastMovement, request.lastReminderAt ?? 0);
      if (now - lastTouch < STALE_AFTER_MS) continue;

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
      } else if (request.paid === false) {
        const finance = await getApprovers(ctx, request.year, FINANCE);
        const financeNow =
          request.year === year ? finance : await getApprovers(ctx, year, FINANCE);
        to = finance.financeHeadEmail ?? financeNow.financeHeadEmail;
        waitingOn = "payment";
      }
      if (!to) continue;

      const days = Math.floor((now - lastMovement) / (24 * 60 * 60 * 1000));
      await remind(ctx, to, request, waitingOn, days);
      await ctx.db.patch("requests", request._id, { lastReminderAt: now });
    }
    return null;
  },
});
