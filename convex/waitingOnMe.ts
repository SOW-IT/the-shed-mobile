import { v } from "convex/values";
import { isSubFormEditable, SUB_FORM_KINDS } from "../shared/eventRequests";
import { requestFullyApproved } from "../shared/flow";
import { query } from "./_generated/server";
import { lensFor } from "./actingAs";
import { designWaitingOnMe } from "./designRequests";
import { isCampusLeader, subFormsOf } from "./eventRequestAccess";
import { requesterSideOpenEvents, reviewForms, sideDepartments } from "./eventRequests";
import { optionalProfile } from "./model";
import {
  mayReviewReimbursements,
  mineTabRequests,
  openRequestsAcrossYears,
  reviewQueues,
} from "./requests";

const counts = v.object({
  reimbursements: v.object({ toReview: v.number(), toPay: v.number(), receipts: v.number() }),
  design: v.object({ toApprove: v.number(), toFinish: v.number() }),
  events: v.object({ toReview: v.number(), toFill: v.number() }),
});

export const summary = query({
  args: {},
  returns: v.union(counts, v.null()),
  handler: async (ctx) => {
    const caller = await optionalProfile(ctx);
    if (!caller) return null;
    const lens = await lensFor(ctx, caller);
    if (lens.kind === "self" && isCampusLeader(caller)) return null;
    const queues =
      lens.kind !== "self" || (await mayReviewReimbursements(ctx, caller.email, caller.year))
        ? await reviewQueues(ctx, caller, await openRequestsAcrossYears(ctx, caller.year), lens)
        : null;
    const waiting = (rows: { waiting: boolean }[]) => rows.filter((r) => r.waiting).length;
    const mine = await mineTabRequests(ctx, caller.email, caller.year);
    const receipts = mine.filter((r) => requestFullyApproved(r) && !r.receipt).length;
    const design = await designWaitingOnMe(ctx, caller, lens);
    const toReview = (await reviewForms(ctx, caller, lens)).filter((f) => f.mine).length;
    let toFill = 0;
    for (const event of await requesterSideOpenEvents(ctx, caller, await sideDepartments(ctx, caller, lens))) {
      const forms = await subFormsOf(ctx, event._id);
      toFill += SUB_FORM_KINDS.filter((kind) => isSubFormEditable(forms[kind].status)).length;
    }
    return {
      reimbursements: {
        toReview: queues
          ? waiting(queues.hod) +
            waiting(queues.budgetManager) +
            waiting(queues.director) +
            waiting(queues.financeHead)
          : 0,
        toPay: queues ? waiting(queues.readyToPay) : 0,
        receipts,
      },
      design,
      events: { toReview, toFill },
    };
  },
});
