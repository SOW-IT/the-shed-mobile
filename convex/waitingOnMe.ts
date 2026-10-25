import { v } from "convex/values";
import { isSubFormEditable, SUB_FORM_KINDS } from "../shared/eventRequests";
import { requestFullyApproved } from "../shared/flow";
import { query } from "./_generated/server";
import { designWaitingOnMe } from "./designRequests";
import { isCampusLeader, subFormsOf } from "./eventRequestAccess";
import { requesterSideOpenEvents, reviewForms } from "./eventRequests";
import { optionalProfile } from "./model";
import { mineTabRequests, openRequestsAcrossYears, reviewQueues } from "./requests";

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
    if (!caller || isCampusLeader(caller)) return null;
    const queues = await reviewQueues(
      ctx,
      caller,
      await openRequestsAcrossYears(ctx, caller.year)
    );
    const mine = await mineTabRequests(ctx, caller.email, caller.year);
    const receipts = mine.filter((r) => requestFullyApproved(r) && !r.receipt).length;
    const design = await designWaitingOnMe(ctx, caller);
    const toReview = (await reviewForms(ctx, caller)).filter((f) => f.mine).length;
    let toFill = 0;
    for (const event of await requesterSideOpenEvents(ctx, caller)) {
      const forms = await subFormsOf(ctx, event._id);
      toFill += SUB_FORM_KINDS.filter((kind) => isSubFormEditable(forms[kind].status)).length;
    }
    return {
      reimbursements: {
        toReview:
          queues.hod.length +
          queues.budgetManager.length +
          queues.director.length +
          queues.financeHead.length,
        toPay: queues.readyToPay.length,
        receipts,
      },
      design,
      events: { toReview, toFill },
    };
  },
});
