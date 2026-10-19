import { v } from "convex/values";
import { SUB_FORM_KINDS, SUB_FORM_LABELS, type SubFormKind } from "../shared/eventRequests";
import { FINANCE, STEP_LABELS, type ApprovalStep } from "../shared/flow";
import { query, type QueryCtx } from "./_generated/server";
import { displayName, getApprovers, isAdminProfile, requireProfile } from "./model";
import { yearRequests } from "./requests";

const EVENTS_LIMIT = 200;
const LIST_LIMIT = 500;

type Sample = { ms: number; actor: string };

type StepKey = string;

class Samples {
  private readonly byStep = new Map<StepKey, { label: string; samples: Sample[] }>();
  private readonly order: StepKey[] = [];

  add(key: StepKey, label: string, sample: Sample) {
    let entry = this.byStep.get(key);
    if (!entry) {
      entry = { label, samples: [] };
      this.byStep.set(key, entry);
      this.order.push(key);
    }
    entry.samples.push(sample);
  }

  entries() {
    return this.order.map((key) => ({ key, ...this.byStep.get(key)! }));
  }
}

export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

async function reimbursementSamples(ctx: QueryCtx, year: number, samples: Samples) {
  for (const request of await yearRequests(ctx, year)) {
    const events = await ctx.db
      .query("requestEvents")
      .withIndex("by_request", (q) => q.eq("requestId", request._id))
      .take(EVENTS_LIMIT);
    let since = request._creationTime;
    for (const event of events) {
      const ms = event._creationTime - since;
      const sample = { ms, actor: event.actorEmail };
      if ((event.action === "approved" || event.action === "declined") && event.step) {
        const step = event.step as ApprovalStep;
        samples.add(`request:${step}`, `${STEP_LABELS[step]} approval`, sample);
      } else if (event.action === "receipt-submitted") {
        samples.add("request:receipt", "Receipt from the requester", sample);
      } else if (event.action === "paid") {
        samples.add("request:payment", "Payment by Finance", sample);
      } else if (event.action !== "auto-approved" && event.action !== "submitted") {
        continue;
      }
      since = event._creationTime;
    }
  }
}

async function designSamples(ctx: QueryCtx, year: number, samples: Samples) {
  const rows = await ctx.db
    .query("designRequests")
    .withIndex("by_year_and_number", (q) => q.eq("year", year))
    .take(LIST_LIMIT);
  for (const request of rows) {
    const { decidedAt, decidedBy, completedAt, completedBy } = request;
    if (decidedAt !== undefined && decidedBy !== undefined && decidedBy !== request.requesterEmail) {
      samples.add("design:approval", "Marketing Head approval", {
        ms: decidedAt - request.submittedAt,
        actor: decidedBy,
      });
    }
    if (decidedAt !== undefined && completedAt !== undefined && completedBy !== undefined) {
      samples.add("design:completion", "Design work by Marketing", {
        ms: completedAt - decidedAt,
        actor: completedBy,
      });
    }
  }
}

async function eventSamples(ctx: QueryCtx, year: number, samples: Samples) {
  const events = await ctx.db
    .query("eventRequests")
    .withIndex("by_year_and_number", (q) => q.eq("year", year))
    .take(LIST_LIMIT);
  for (const event of events) {
    const rows = await ctx.db
      .query("eventRequestEvents")
      .withIndex("by_eventRequest", (q) => q.eq("eventRequestId", event._id))
      .take(EVENTS_LIMIT);
    const openedAt: Partial<Record<SubFormKind, number>> = {};
    const sentAt: Partial<Record<SubFormKind, number>> = {};
    for (const row of rows) {
      const at = row._creationTime;
      if (row.action === "created") {
        for (const kind of SUB_FORM_KINDS) openedAt[kind] = at;
        continue;
      }
      const kind = row.form;
      if (!kind) continue;
      const label = SUB_FORM_LABELS[kind];
      const opened = openedAt[kind];
      const sent = sentAt[kind];
      switch (row.action) {
        case "submitted":
        case "not-required":
          if (opened !== undefined) {
            samples.add(`event:${kind}:fill`, `${label} form filled in`, {
              ms: at - opened,
              actor: row.actorEmail,
            });
          }
          openedAt[kind] = undefined;
          sentAt[kind] = row.action === "submitted" ? at : undefined;
          break;
        case "director-approved":
          if (sent !== undefined) {
            samples.add(`event:${kind}:director`, `${label} form, Director approval`, {
              ms: at - sent,
              actor: row.actorEmail,
            });
          }
          sentAt[kind] = at;
          break;
        case "approved":
        case "changes-requested":
          if (sent !== undefined) {
            samples.add(`event:${kind}:review`, `${label} form review`, {
              ms: at - sent,
              actor: row.actorEmail,
            });
          }
          sentAt[kind] = undefined;
          if (row.action === "changes-requested") openedAt[kind] = at;
          break;
        case "auto-approved":
          sentAt[kind] = undefined;
          break;
        case "reopened":
          openedAt[kind] = at;
          sentAt[kind] = undefined;
          break;
        default:
          break;
      }
    }
  }
}

const personValidator = v.object({
  email: v.string(),
  name: v.string(),
  count: v.number(),
  medianMs: v.number(),
});

const stepValidator = v.object({
  key: v.string(),
  label: v.string(),
  count: v.number(),
  medianMs: v.number(),
  longestMs: v.number(),
  people: v.array(personValidator),
});

const sectionValidator = v.object({
  key: v.string(),
  label: v.string(),
  steps: v.array(stepValidator),
});

const SECTIONS: { key: string; label: string; prefix: string }[] = [
  { key: "reimbursements", label: "Reimbursements", prefix: "request:" },
  { key: "design", label: "Design requests", prefix: "design:" },
  { key: "events", label: "Event requests", prefix: "event:" },
];

export const summary = query({
  args: { year: v.number() },
  returns: v.union(v.array(sectionValidator), v.null()),
  handler: async (ctx, { year }) => {
    const caller = await requireProfile(ctx);
    const finance = await getApprovers(ctx, year, FINANCE);
    const allowed =
      (await isAdminProfile(ctx, caller.profile)) || finance.financeHeadEmail === caller.email;
    if (!allowed) return null;

    const samples = new Samples();
    await reimbursementSamples(ctx, year, samples);
    await designSamples(ctx, year, samples);
    await eventSamples(ctx, year, samples);

    const names = new Map<string, Promise<string>>();
    const nameOf = (email: string) => {
      let name = names.get(email);
      if (!name) {
        name = displayName(ctx, email, year);
        names.set(email, name);
      }
      return name;
    };

    const steps = await Promise.all(
      samples.entries().map(async ({ key, label, samples: rows }) => {
        const byActor = new Map<string, number[]>();
        for (const { actor, ms } of rows) {
          byActor.set(actor, [...(byActor.get(actor) ?? []), ms]);
        }
        const people = await Promise.all(
          [...byActor.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(async ([email, values]) => ({
              email,
              name: await nameOf(email),
              count: values.length,
              medianMs: median(values),
            }))
        );
        const values = rows.map((r) => r.ms);
        return {
          key,
          label,
          count: values.length,
          medianMs: median(values),
          longestMs: Math.max(...values),
          people,
        };
      })
    );

    return SECTIONS.map((section) => ({
      key: section.key,
      label: section.label,
      steps: steps.filter((step) => step.key.startsWith(section.prefix)),
    }));
  },
});
