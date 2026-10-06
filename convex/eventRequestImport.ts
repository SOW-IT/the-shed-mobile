import { Infer, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { pad2 } from "../shared/datetime";
import { sydneyYmd } from "../shared/flow";
import {
  answerForRole,
  normalizeAnswers,
  sydneyDateTimeAnswer,
  type FormAnswers,
} from "../shared/forms";
import {
  normalizeFinance,
  normalizeRisk,
  type EventRequestStatus,
  type FinanceData,
  type FinanceLine,
  type RiskData,
  type SubFormKind,
  type SubFormStatus,
} from "../shared/eventRequests";
import { formatAmount } from "../shared/money";
import { legacyEmail } from "./designRequestImport";
import { EVENT_FIELDS, MARKETING_FIELDS } from "./eventRequestForm";

/** The note on old events that never finished, which the import closes. */
export const NEVER_FINISHED_NOTE = "Imported from the old SHED; never fully approved.";

/**
 * One event form from the old web app's Firestore
 * (eventForm/eventForm/<year>/<id>, plus its subForms), with timestamps as
 * epoch ms and the requester's email and department from their old user doc
 * where it exists. `number` is its place in that year by submission time.
 * Built by scripts/import-event-requests.mjs.
 */
const flagOrText = v.union(v.boolean(), v.string(), v.number());
const budgetRow = v.object({
  type: v.optional(v.string()),
  unitPrice: v.optional(v.number()),
  quantity: v.optional(v.number()),
  total: v.optional(v.number()),
  justification: v.optional(v.string()),
});
const budgetRows = v.optional(v.array(budgetRow));

export const legacyEventValidator = v.object({
  year: v.number(),
  id: v.string(),
  number: v.number(),
  userID: v.string(),
  userEmail: v.optional(v.string()),
  userDepartment: v.optional(v.string()),
  name: v.optional(v.string()),
  purpose: v.optional(v.string()),
  goals: v.optional(v.string()),
  theme: v.optional(v.string()),
  location: v.optional(v.string()),
  registrationGoal: v.optional(v.number()),
  audience: v.optional(v.string()),
  eventStartTime: v.optional(v.number()),
  eventEndTime: v.optional(v.number()),
  registrationOpenTime: v.optional(v.number()),
  registrationCloseTime: v.optional(v.number()),
  notes: v.optional(v.string()),
  submittedTime: v.number(),
  updatedTime: v.optional(v.number()),
  marketing: v.optional(v.record(v.string(), flagOrText)),
  finance: v.optional(
    v.object({
      status: v.optional(v.string()),
      requestForChangeReason: v.optional(v.string()),
      salesRevenues: budgetRows,
      directExpenses: budgetRows,
      indirectExpenses: budgetRows,
      equipmentMaterials: budgetRows,
      travelOthers: budgetRows,
    })
  ),
  risk: v.optional(
    v.object({
      status: v.optional(v.string()),
      requestForChangeReason: v.optional(v.string()),
      entries: v.optional(
        v.array(
          v.object({
            task: v.optional(v.string()),
            hazards: v.optional(v.string()),
            riskIdentification: v.optional(v.string()),
            proposedControlMeasures: v.optional(v.string()),
            residualRiskLevel: v.optional(v.string()),
          })
        )
      ),
    })
  ),
});

type Legacy = Infer<typeof legacyEventValidator>;
type LegacyRow = Infer<typeof budgetRow>;

const text = (value: unknown) => (typeof value === "string" ? value.trim() || undefined : undefined);
const truthy = (value: unknown) => value === true || value === "true" || value === "Yes";

const STATUSES: Record<string, SubFormStatus> = {
  Approved: "APPROVED",
  Submitted: "PENDING",
  "Request for change": "CHANGES_REQUESTED",
};
const statusOf = (legacy: string | undefined): SubFormStatus =>
  (legacy && STATUSES[legacy]) || "DRAFT";

const sydneyDate = (ms: number) => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

const when = (ms: number | undefined) => (ms === undefined ? undefined : sydneyDateTimeAnswer(ms));

function eventAnswers(r: Legacy): FormAnswers {
  const raw: FormAnswers = {};
  const set = (key: string, value: FormAnswers[string] | undefined) => {
    if (value !== undefined) raw[key] = value;
  };
  set("name", text(r.name) ?? "Untitled event");
  set("department", text(r.userDepartment) ?? "Events");
  set("purpose", text(r.purpose));
  set("goals", text(r.goals));
  set("theme", text(r.theme));
  set("location", text(r.location));
  set("registrationGoal", r.registrationGoal);
  set("audience", r.audience?.toLowerCase());
  set("start", when(r.eventStartTime ?? r.submittedTime));
  set("end", when(r.eventEndTime));
  set("registrationOpen", when(r.registrationOpenTime));
  set("registrationClose", when(r.registrationCloseTime));
  set("notes", text(r.notes));
  return normalizeAnswers(EVENT_FIELDS, raw);
}

// The old Marketing form's tick boxes → the current form's choices.
const PRINTED: Record<string, [string, string]> = {
  brochures: ["brochures", "brochuresSpecifications"],
  flyers: ["flyers", "flyersSpecifications"],
  invitations: ["invitations", "invitationsSpecifications"],
  signage: ["signage", "signageSpecifications"],
  businessCard: ["businessCards", "businessCardSpecifications"],
  pamphlet: ["pamphlets", "pamphletSpecifications"],
  poster: ["posters", "posterSpecifications"],
  postcard: ["postcards", "postcardSpecifications"],
  merchandise: ["merchandise", "merchandiseSpecifications"],
  otherPrinted: ["other", "otherPrintedSpecifications"],
};
const DIGITAL: Record<string, [string, string?]> = {
  logo: ["logo"],
  powerpoint: ["powerpoint"],
  letterhead: ["letterhead"],
  facebookEventBanner: ["facebookBanner"],
  instagramPost: ["instagramPosts"],
  websiteBanner: ["websiteBanner"],
  promoVideo: ["promoVideo", "promoVideoSpecifications"],
  recapVideo: ["recapVideo", "recapVideoSpecifications"],
  otherDigital: ["other", "otherDigitalSpecifications"],
};
const PROMOTION: Record<string, [string, string?]> = {
  photography: ["photography"],
  videography: ["videography"],
  instagram: ["instagramStories"],
  bibleVerse: ["bibleVerse"],
  themePurpose: ["themePurpose"],
  saveTheDate: ["saveTheDate"],
  throwbackPhotos: ["throwbackPhotos"],
  directorsAddress: ["directorsAddress"],
  registrationCountdown: ["registrationCountdown"],
  prizeInventive: ["prizeIncentive"],
  sponsorships: ["sponsorships"],
  rulesFaqs: ["rulesFaqs"],
  merchandisePromo: ["merchandise"],
  paidAds: ["paidAds"],
  campusPromotion: ["campusPromotion"],
  finalRemindersInfo: ["finalReminders"],
  eventPhotos: ["eventPhotos"],
  otherPromotion: ["other", "otherPromotionSpecifications"],
};

function marketingAnswers(m: Record<string, boolean | string | number>): FormAnswers {
  const raw: FormAnswers = {};
  const group = (field: string, map: Record<string, [string, string?]>) => {
    const ticked: string[] = [];
    for (const [legacy, [value, specKey]] of Object.entries(map)) {
      const spec = specKey ? text(m[specKey]) : undefined;
      // Details written for a box that wasn't ticked still count as asking for it.
      if (truthy(m[legacy]) || spec) ticked.push(value);
      if (spec) raw[`${field}_${value}`] = spec;
    }
    raw[field] = ticked;
  };
  group("printed", PRINTED);
  group("digital", DIGITAL);
  group("promotion", PROMOTION);
  const promoStart = m.promoStart;
  return normalizeAnswers(MARKETING_FIELDS, {
    ...raw,
    keyMessage: text(m.keyMessage) ?? "",
    visualStyle: text(m.theme) ?? "",
    runByYou: truthy(m.designNeedsApproval),
    multipleDrafts: false,
    promoStart: typeof promoStart === "number" ? sydneyDate(promoStart) : (text(promoStart) ?? ""),
    postInfo: text(m.importantPromotionInformation) ?? "",
    otherInfo: text(m.otherPromotionInformation) ?? "",
  });
}

const EXPENSE_TABLES = [
  ["directExpenses", "Direct"],
  ["indirectExpenses", "Indirect"],
  ["equipmentMaterials", "Equipment and materials"],
  ["travelOthers", "Travel and other"],
] as const;

/** An old budget row as one line: "Direct: Venue (110 × $380), justification". */
function budgetLine(row: LegacyRow, category?: string): FinanceLine {
  const quantity = row.quantity ?? 0;
  const unit = row.unitPrice ?? 0;
  const amount = row.total ?? unit * quantity;
  const what = text(row.type) ?? "(no description)";
  const maths = quantity > 0 && unit > 0 ? ` (${quantity} × $${formatAmount(unit)})` : "";
  const why = text(row.justification) ? `, ${text(row.justification)}` : "";
  return { label: `${category ? `${category}: ` : ""}${what}${maths}${why}`, amount: Math.max(amount, 0) };
}

const realRows = (rows: LegacyRow[] | undefined) =>
  (rows ?? []).filter((row) => text(row.type) || (row.total ?? 0) !== 0);

function financeData(f: NonNullable<Legacy["finance"]>): FinanceData {
  return normalizeFinance({
    income: realRows(f.salesRevenues).map((row) => budgetLine(row)),
    expenses: EXPENSE_TABLES.flatMap(([key, category]) =>
      realRows(f[key]).map((row) => budgetLine(row, category))
    ),
  });
}

function riskData(r: NonNullable<Legacy["risk"]>): RiskData {
  return normalizeRisk({
    noRisks: false,
    risks: (r.entries ?? []).map((entry) => ({
      description: [
        text(entry.task),
        text(entry.hazards) ? `Hazards: ${text(entry.hazards)}` : undefined,
        text(entry.riskIdentification) ? `Risks: ${text(entry.riskIdentification)}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      mitigation: text(entry.proposedControlMeasures),
      legacyRating: text(entry.residualRiskLevel),
    })),
  });
}

/**
 * Copies event forms from the old web app. Safe to re-run: an event is matched
 * on its old year and id, and is only rewritten while nobody has acted on it
 * in THE SHED since it was imported. The old app had no Risk form (it had
 * Registration, which isn't kept), so finished events come in with Risk not
 * required; one still to happen needs its Risk form filled in. Events that
 * never finished and have already happened come in cancelled. Sends no
 * notifications.
 */
export const importLegacy = internalMutation({
  args: { events: v.array(legacyEventValidator) },
  handler: async (ctx, args) => {
    const counts = { inserted: 0, updated: 0, skipped: 0 };
    const now = Date.now();
    for (const r of args.events) {
      const legacyKey = `${r.year}/${r.id}`;
      const requesterEmail = await legacyEmail(ctx, r.userID, r.userEmail);
      const answers = eventAnswers(r);
      const startsAt = answerForRole(EVENT_FIELDS, answers, "start");
      const endsAt = answerForRole(EVENT_FIELDS, answers, "end") || startsAt;

      const statuses: Record<SubFormKind, SubFormStatus> = {
        marketing: statusOf(text(r.marketing?.status)),
        finance: statusOf(r.finance?.status),
        risk: statusOf(r.risk?.status),
      };
      const finished = statuses.marketing === "APPROVED" && statuses.finance === "APPROVED";
      const happened = (r.eventStartTime ?? r.submittedTime) < now;
      const status: EventRequestStatus = finished
        ? "APPROVED"
        : happened
          ? "CANCELLED"
          : "IN_PROGRESS";
      if (statuses.risk !== "APPROVED" && status !== "IN_PROGRESS") {
        statuses.risk = "NOT_REQUIRED";
      }

      const fields = {
        year: r.year,
        number: r.number,
        requesterEmail,
        department: answerForRole(EVENT_FIELDS, answers, "department"),
        submittedAt: r.submittedTime,
        answers,
        name: answerForRole(EVENT_FIELDS, answers, "title"),
        startsAt,
        endsAt,
        location: answerForRole(EVENT_FIELDS, answers, "location"),
        status,
        approvedAt: finished ? (r.updatedTime ?? r.submittedTime) : undefined,
        cancelNote: status === "CANCELLED" ? NEVER_FINISHED_NOTE : undefined,
        legacyKey,
      };
      const reasons: Record<SubFormKind, string | undefined> = {
        marketing: text(r.marketing?.requestForChangeReason),
        finance: text(r.finance?.requestForChangeReason),
        risk: text(r.risk?.requestForChangeReason),
      };
      const formFields = (kind: SubFormKind) => {
        const formStatus = statuses[kind];
        const sent = formStatus !== "DRAFT";
        return {
          status: formStatus,
          step: formStatus === "PENDING" && kind === "finance" ? ("financeHead" as const) : undefined,
          answers: kind === "marketing" ? marketingAnswers(r.marketing ?? {}) : undefined,
          risk: kind === "risk" ? (r.risk ? riskData(r.risk) : { noRisks: false, risks: [] }) : undefined,
          finance:
            kind === "finance"
              ? r.finance
                ? financeData(r.finance)
                : { income: [], expenses: [] }
              : undefined,
          submittedAt: sent ? r.submittedTime : undefined,
          submittedBy: sent ? requesterEmail : undefined,
          changesReason: formStatus === "CHANGES_REQUESTED" ? reasons[kind] : undefined,
        };
      };

      const existing = await ctx.db
        .query("eventRequests")
        .withIndex("by_legacyKey", (q) => q.eq("legacyKey", legacyKey))
        .unique();
      if (!existing) {
        // Keep the old number unless an event made in THE SHED already has it.
        const clash = await ctx.db
          .query("eventRequests")
          .withIndex("by_year_and_number", (q) => q.eq("year", r.year).eq("number", r.number))
          .first();
        if (clash) {
          const last = await ctx.db
            .query("eventRequests")
            .withIndex("by_year_and_number", (q) => q.eq("year", r.year))
            .order("desc")
            .first();
          fields.number = (last?.number ?? 0) + 1;
        }
        const id = await ctx.db.insert("eventRequests", fields);
        for (const kind of ["marketing", "risk", "finance"] as const) {
          await ctx.db.insert("eventSubForms", { eventRequestId: id, kind, ...formFields(kind) });
        }
        await ctx.db.insert("eventRequestEvents", {
          eventRequestId: id,
          action: "imported",
          actorEmail: requesterEmail,
        });
        counts.inserted++;
        continue;
      }
      const history = await ctx.db
        .query("eventRequestEvents")
        .withIndex("by_eventRequest", (q) => q.eq("eventRequestId", existing._id))
        .take(2);
      if (history.some((e) => e.action !== "imported")) {
        counts.skipped++;
        continue;
      }
      await ctx.db.replace("eventRequests", existing._id, { ...fields, number: existing.number });
      const forms = await ctx.db
        .query("eventSubForms")
        .withIndex("by_eventRequest_and_kind", (q) => q.eq("eventRequestId", existing._id))
        .take(3);
      for (const form of forms as Doc<"eventSubForms">[]) {
        await ctx.db.replace("eventSubForms", form._id, {
          eventRequestId: existing._id,
          kind: form.kind,
          ...formFields(form.kind),
        });
      }
      counts.updated++;
    }
    return counts;
  },
});
