import {
  currentStep,
  eventStaffYear,
  FINANCE,
  requestCompleted,
  STEP_LABELS,
} from "../shared/flow";
import { formatAmount } from "../shared/money";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import {
  currentStaffYear,
  getApprovers,
  withDelegatesForYear,
} from "./model";
import {
  nextApproverWithYear,
  notify,
  openRequestsAcrossYears,
} from "./requests";

const DAY_MS = 24 * 60 * 60 * 1000;

const reminderDelayMs = (count: number): number => {
  if (count === 0) return DAY_MS;
  if (count === 1) return 3 * DAY_MS;
  return 7 * DAY_MS;
};

const preferRequestYear = (
  requestYearEmail: string | undefined,
  currentYearEmail: string | undefined,
  requestYear: number,
  currentYear: number
): { email: string; year: number } | undefined => {
  if (requestYearEmail) return { email: requestYearEmail, year: requestYear };
  if (currentYearEmail) return { email: currentYearEmail, year: currentYear };
  return undefined;
};

const remind = async (
  ctx: MutationCtx,
  to: string,
  request: Doc<"requests">,
  waitingOn: string,
  days: number,
  url: string
) => {
  const subject = `Reminder: a $${formatAmount(request.amount)} request has been waiting ${days} days`;
  await notify(ctx, {
    to,
    subject,
    pushTitle: "Request reminder",
    body: `The request below has been waiting on ${waitingOn} for ${days} days. Please action it in THE SHED.\n\nRequester: ${request.requesterEmail}\nDepartment: ${request.department}\nAmount: $${formatAmount(request.amount)}\nDescription: ${request.description}`,
    url,
    requestId: request._id,
  });
};

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
      const movedSinceReminder =
        request.lastReminderAt !== undefined && lastMovement > request.lastReminderAt;
      const count = movedSinceReminder
        ? 0
        : (request.reminderCount ?? (request.lastReminderAt ? 1 : 0));
      const baseline =
        count === 0
          ? lastMovement
          : Math.max(lastMovement, request.lastReminderAt ?? lastMovement);
      if (now - baseline < reminderDelayMs(count)) continue;

      const reqYear = eventStaffYear(request._creationTime);
      const requestYearApprovers = await getApprovers(ctx, reqYear, request.department);
      const thisYearApprovers =
        reqYear === year
          ? requestYearApprovers
          : await getApprovers(ctx, year, request.department);

      const step = currentStep(request);
      let recipients: string[] = [];
      let waitingOn = "";
      let url = "/?tab=review";
      if (step !== null) {
        const next = nextApproverWithYear(
          request,
          requestYearApprovers,
          thisYearApprovers
        );
        recipients = next
          ? await withDelegatesForYear(ctx, next.year, next.email)
          : [];
        waitingOn = `your ${STEP_LABELS[step]} approval`;
      } else if (!request.receipt) {
        recipients = [request.requesterEmail];
        waitingOn = "your receipt";
        url = "/?tab=mine";
      } else if (request.paid === false) {
        const finance = await getApprovers(ctx, reqYear, FINANCE);
        const financeNow =
          reqYear === year ? finance : await getApprovers(ctx, year, FINANCE);
        const head = preferRequestYear(
          finance.financeHeadEmail,
          financeNow.financeHeadEmail,
          reqYear,
          year
        );
        recipients = head
          ? await withDelegatesForYear(ctx, head.year, head.email)
          : [];
        waitingOn = "payment";
      }
      if (recipients.length === 0) continue;

      const days = Math.floor((now - lastMovement) / DAY_MS);
      for (const to of recipients) {
        await remind(ctx, to, request, waitingOn, days, url);
      }
      await ctx.db.patch("requests", request._id, {
        lastReminderAt: now,
        reminderCount: count + 1,
      });
    }
    return null;
  },
});
