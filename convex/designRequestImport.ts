import { Infer, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import { pad2 } from "../shared/datetime";
import { sydneyYmd } from "../shared/flow";
import {
  designRequestFiling,
  normalizeDesignAnswers,
  type DesignAnswers,
  type DesignRequestStatus,
} from "../shared/designRequests";
import { DESIGN_REQUEST_FIELDS } from "./designRequestForm";
import { currentStaffYear, staffProfilesForEmail } from "./model";

/** The note on old requests the import closes; see `legacyStatus`. */
export const CLOSED_ON_IMPORT_NOTE = "Closed when imported from the old SHED";

/**
 * One design request from the old web app's Firestore
 * (designRequests/designRequests/<year>/<id>), with timestamps as epoch ms
 * and the requester's email looked up from their user doc where it exists.
 * Built by scripts/import-design-requests.mjs.
 */
const flag = v.optional(v.union(v.boolean(), v.string()));
const checkboxes = v.optional(v.record(v.string(), v.union(v.boolean(), v.string())));

export const legacyDesignRequestValidator = v.object({
  year: v.number(),
  id: v.string(),
  userID: v.string(),
  userEmail: v.optional(v.string()),
  department: v.optional(v.string()),
  type: checkboxes,
  details: v.optional(v.string()),
  productType: checkboxes,
  theme: v.optional(v.string()),
  example: v.optional(v.string()),
  message: v.optional(v.string()),
  dueDate: v.optional(v.number()),
  multipleDrafts: flag,
  runTheDesign: flag,
  extraInformation: v.optional(v.string()),
  detailsOfEventOrProject: v.optional(v.string()),
  submittedTime: v.number(),
  approvedByHOD: v.optional(v.string()),
  approvedTime: v.optional(v.number()),
  declinedTime: v.optional(v.number()),
  completedTime: v.optional(v.number()),
  completed: flag,
  reason: v.optional(v.string()),
  comments: v.array(
    v.object({
      id: v.string(),
      userID: v.string(),
      userEmail: v.optional(v.string()),
      comment: v.string(),
      submittedTime: v.number(),
    })
  ),
});

type Legacy = Infer<typeof legacyDesignRequestValidator>;

// Old checkbox names → the current form's option values.
const LEGACY_TYPES: Record<string, string> = {
  event: "event",
  promotion: "promotion",
  pr: "pr",
  other: "other",
};

const LEGACY_ITEMS: Record<string, string> = {
  brochure: "brochure",
  flyer: "flyer",
  booklet: "booklet",
  facebookbanner: "facebookBanner",
  infographic: "infographic",
  invitation: "invitation",
  logo: "logo",
  merchandise: "merchandise",
  poster: "poster",
  powerpointPresentation: "powerpoint",
  other: "other",
};

const truthy = (value: boolean | string | undefined) =>
  value === true || value === "true";

const ticked = <T>(boxes: Legacy["type"], names: Record<string, T>): T[] =>
  Object.entries(boxes ?? {})
    .filter(([key, value]) => key in names && truthy(value))
    .map(([key]) => names[key]);

const text = (value: string | undefined) => value?.trim() || undefined;

const joined = (main: string | undefined, label: string, extra: string | undefined) =>
  [text(main), text(extra) ? `${label}: ${text(extra)}` : undefined]
    .filter(Boolean)
    .join("\n\n");

const sydneyDate = (ms: number) => {
  const { year, month, day } = sydneyYmd(new Date(ms));
  return `${year}-${pad2(month)}-${pad2(day)}`;
};

/**
 * The request's status in the old app, except that one from an earlier staff
 * year that was never finished comes in closed, so years-old requests don't sit
 * in the Marketing queue for good.
 */
const legacyStatus = (r: Legacy): { status: DesignRequestStatus; closedOnImport: boolean } => {
  if (truthy(r.completed)) return { status: "COMPLETED", closedOnImport: false };
  if (r.approvedByHOD === "DECLINED") return { status: "DECLINED", closedOnImport: false };
  if (r.year < currentStaffYear()) return { status: "COMPLETED", closedOnImport: true };
  return {
    status: r.approvedByHOD === "APPROVED" ? "APPROVED" : "PENDING",
    closedOnImport: false,
  };
};

const OLD_DOMAIN = "@sowaustralia.com";
const CURRENT_DOMAIN = "@sow.org.au";

/**
 * The person behind an old-app user id, as the address they sign in with now:
 * their latest staff profile (found through the id the org import kept, else
 * the email on their old user doc), else that email moved off the old
 * sowaustralia.com domain, else a clearly fake placeholder address.
 */
async function legacyEmail(ctx: MutationCtx, uid: string, email: string | undefined) {
  const byImportId = await ctx.db
    .query("staffProfiles")
    .withIndex("by_importId", (q) => q.eq("importId", uid))
    .first();
  const known = byImportId?.email ?? email?.toLowerCase();
  if (!known) return `${uid.toLowerCase()}@legacy.invalid`;
  const [latest] = await staffProfilesForEmail(ctx, known);
  const address = latest?.email ?? known;
  return address.endsWith(OLD_DOMAIN)
    ? address.slice(0, -OLD_DOMAIN.length) + CURRENT_DOMAIN
    : address;
}

/**
 * Copies design requests from the old web app. Safe to re-run: a request is
 * matched on its old year and id, and is only rewritten while nobody has
 * acted on it in THE SHED since it was imported. Comments are matched on
 * their old id, so only new ones are added. Sends no notifications.
 */
export const importLegacy = internalMutation({
  args: { requests: v.array(legacyDesignRequestValidator) },
  handler: async (ctx, args) => {
    const counts = { inserted: 0, updated: 0, skipped: 0, comments: 0 };
    for (const r of args.requests) {
      const legacyKey = `${r.year}/${r.id}`;
      const raw: DesignAnswers = {
        department: r.department ?? "",
        types: ticked(r.type, LEGACY_TYPES),
        typesOther: (r.type?.otherText as string | undefined) ?? "",
        details: joined(r.details, "Details of the event/project to promote", r.detailsOfEventOrProject),
        items: ticked(r.productType, LEGACY_ITEMS),
        itemsOther: (r.productType?.otherText as string | undefined) ?? "",
        visualStyle: joined(r.theme, "Examples", r.example),
        keyMessage: r.message ?? "",
        dueDate: sydneyDate(r.dueDate ?? r.submittedTime),
        multipleDrafts: truthy(r.multipleDrafts),
        runByYou: truthy(r.runTheDesign),
        otherInfo: r.extraInformation ?? "",
      };
      const answers = normalizeDesignAnswers(DESIGN_REQUEST_FIELDS, raw);
      const { status, closedOnImport } = legacyStatus(r);
      const fields = {
        year: r.year,
        number: Number.parseInt(r.id, 10) || 0,
        requesterEmail: await legacyEmail(ctx, r.userID, r.userEmail),
        submittedAt: r.submittedTime,
        answers,
        ...designRequestFiling(DESIGN_REQUEST_FIELDS, answers),
        status,
        decidedAt: status === "PENDING" ? undefined : (r.approvedTime ?? r.declinedTime),
        declineReason: status === "DECLINED" ? text(r.reason) : undefined,
        completedAt: closedOnImport ? undefined : r.completedTime,
        completionNote: closedOnImport ? CLOSED_ON_IMPORT_NOTE : undefined,
        legacyKey,
      };

      const existing = await ctx.db
        .query("designRequests")
        .withIndex("by_legacyKey", (q) => q.eq("legacyKey", legacyKey))
        .unique();
      let request: Doc<"designRequests">;
      if (!existing) {
        const id = await ctx.db.insert("designRequests", fields);
        await ctx.db.insert("designRequestEvents", {
          designRequestId: id,
          action: "imported",
          actorEmail: fields.requesterEmail,
        });
        request = (await ctx.db.get("designRequests", id)) as Doc<"designRequests">;
        counts.inserted++;
      } else {
        const events = await ctx.db
          .query("designRequestEvents")
          .withIndex("by_designRequest", (q) => q.eq("designRequestId", existing._id))
          .take(2);
        if (events.some((e) => e.action !== "imported")) {
          counts.skipped++;
        } else {
          await ctx.db.replace("designRequests", existing._id, fields);
          counts.updated++;
        }
        request = existing;
      }

      for (const c of r.comments) {
        const commentKey = `${legacyKey}/${c.id}`;
        const known = await ctx.db
          .query("designRequestComments")
          .withIndex("by_legacyKey", (q) => q.eq("legacyKey", commentKey))
          .unique();
        if (known || !c.comment.trim()) continue;
        await ctx.db.insert("designRequestComments", {
          designRequestId: request._id,
          authorEmail: await legacyEmail(ctx, c.userID, c.userEmail),
          body: c.comment.trim(),
          postedAt: c.submittedTime,
          legacyKey: commentKey,
        });
        counts.comments++;
      }
    }
    return counts;
  },
});
