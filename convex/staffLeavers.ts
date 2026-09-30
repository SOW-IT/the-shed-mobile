import { ConvexError, v } from "convex/values";
import { ROLE_FIELD_KEY, staffLockedMetadata } from "../shared/attendanceMemberMeta";
import { MEMBER, ROLES, rolesOfLike, staffYearForDate } from "../shared/flow";
import { mergeNotes } from "../shared/memberMerge";
import { capitalizeMemberName, personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { mergeSelectValues } from "./attendanceMetadata";
import { latestStaffProfile } from "./attendanceMembers";
import { findMemberByEmail } from "./model";

const LEAVERS_ACTOR = "system:staff-leavers";

/** Role labels that only staff hold in the year they left: the built-in ones
 *  plus that year's own role catalog. A leaver keeps any other role. */
async function staffRoleLabels(ctx: MutationCtx, leftYear: number): Promise<Set<string>> {
  const custom = await ctx.db
    .query("roles")
    .withIndex("by_year_and_name", (q) => q.eq("year", leftYear))
    .collect();
  const labels = new Set<string>([...ROLES, ...custom.map((r) => r.name)]);
  labels.delete(MEMBER);
  return labels;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const detailValidator = v.object({
  staffEmail: v.string(),
  name: v.string(),
  email: v.union(v.string(), v.null()),
  recordsMoved: v.number(),
  recordsCombined: v.number(),
  rowsFolded: v.number(),
});

type Detail = {
  staffEmail: string;
  name: string;
  /** The personal email they are left with, if any. */
  email: string | null;
  recordsMoved: number;
  recordsCombined: number;
  rowsFolded: number;
};

const resultValidator = v.object({
  dryRun: v.boolean(),
  year: v.number(),
  people: v.number(),
  recordsMoved: v.number(),
  recordsCombined: v.number(),
  rowsFolded: v.number(),
  next: v.union(v.string(), v.null()),
  details: v.array(detailValidator),
});

/** Staff in `year - 1` with no staff profile in `year` or any later year:
 *  they left staff when `year` began. Sorted by email so batches can resume. */
async function outgoingStaff(
  ctx: MutationCtx,
  year: number
): Promise<{ key: string; profile: Doc<"staffProfiles"> }[]> {
  const leaving = await ctx.db
    .query("staffProfiles")
    .withIndex("by_year", (q) => q.eq("year", year - 1))
    .collect();
  const byKey = new Map<string, Doc<"staffProfiles">>();
  for (const profile of leaving) {
    const key = canonicalEmailKey(profile.email);
    if (key && !byKey.has(key)) byKey.set(key, profile);
  }
  const out = [];
  for (const [key, profile] of byKey) {
    let stays = false;
    for (const candidate of staffEmailCandidates(profile.email)) {
      const later = await ctx.db
        .query("staffProfiles")
        .withIndex("by_email_and_year", (q) => q.eq("email", candidate).gte("year", year))
        .first();
      if (later) stays = true;
    }
    if (!stays) out.push({ key, profile });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

type RoleField = {
  fieldId: Id<"attendanceMetadata">;
  values: Record<string, string>;
  memberOptionId: string;
};

/** The Role field and its Member option, adding the option if it's missing
 *  (only when not a dry run). */
async function roleField(ctx: MutationCtx, dryRun: boolean): Promise<RoleField | null> {
  const field = (await ctx.db.query("attendanceMetadata").collect()).find(
    (f) => f.key === ROLE_FIELD_KEY
  );
  if (!field) return null;
  const values = mergeSelectValues(field.values ?? {}, [MEMBER]);
  if (!dryRun && Object.keys(values).length !== Object.keys(field.values ?? {}).length) {
    await ctx.db.patch(field._id, { values });
  }
  const memberOptionId = Object.keys(values).find((id) => values[id] === MEMBER)!;
  return { fieldId: field._id, values, memberOptionId };
}

/**
 * Turns one former staff person back into a plain member: every sign-in under
 * their staff email moves onto their member record (an event they were
 * signed in to both ways becomes one record: earlier time, both notes), any
 * duplicate rows carrying the staff email fold into it, and the row drops the
 * staff email for their personal one (which may be empty). A staff role
 * becomes Member; leaving staff doesn't make someone Alumni — leaders set that
 * when they graduate — so a non-staff role a leader gave them is kept.
 */
async function convertPerson(
  ctx: MutationCtx,
  profile: Doc<"staffProfiles">,
  year: number,
  fields: Doc<"attendanceMetadata">[],
  role: RoleField | null,
  staffRoles: Set<string>,
  dryRun: boolean
): Promise<Detail | null> {
  const staffEmail = profile.email.toLowerCase();
  const candidates = staffEmailCandidates(staffEmail);
  const rows: Doc<"attendanceMembers">[] = [];
  const emailRecords: Doc<"attendance">[] = [];
  for (const candidate of candidates) {
    rows.push(
      ...(await ctx.db
        .query("attendanceMembers")
        .withIndex("by_email", (q) => q.eq("email", candidate))
        .collect())
    );
    emailRecords.push(
      ...(await ctx.db
        .query("attendance")
        .withIndex("by_email", (q) => q.eq("email", candidate))
        .collect())
    );
  }
  if (rows.length === 0 && emailRecords.length === 0) return null;

  // The row the app already shows for them; any others are hidden duplicates.
  const primary = (await findMemberByEmail(ctx, staffEmail)) ?? rows[0] ?? null;
  const duplicates = rows.filter((row) => row._id !== primary?._id);
  const name = capitalizeMemberName(
    personDisplayName(profile.name ?? primary?.name, staffEmail).trim()
  );
  // The first personal email that isn't someone's staff email: putting one
  // of those on the row would make it read as that staff person.
  let personalEmail: string | null = null;
  for (const row of [primary, ...duplicates]) {
    const email = row?.personalEmail?.trim().toLowerCase();
    if (email && !(await latestStaffProfile(ctx, email))) {
      personalEmail = email;
      break;
    }
  }
  const detail: Detail = {
    staffEmail,
    name,
    email: personalEmail,
    recordsMoved: 0,
    recordsCombined: 0,
    rowsFolded: 0,
  };

  // Their member row wins; duplicates only fill its blanks. Campus stays as
  // their last staff assignment had it.
  const stored: Record<string, string> = Object.assign(
    {},
    ...duplicates.map((d) => d.metadata ?? {}),
    primary?.metadata ?? {}
  );
  const metadata = staffLockedMetadata(fields, profile, stored);
  if (role) {
    const storedRole = stored[role.fieldId];
    const label = storedRole ? (role.values[storedRole] ?? storedRole) : "";
    // Their own profile's roles count too, in case one was since renamed.
    const isStaffRole = staffRoles.has(label) || rolesOfLike(profile).includes(label);
    metadata[role.fieldId] = label && !isStaffRole ? storedRole : role.memberOptionId;
  }
  const target: Id<"attendanceMembers"> | null = dryRun
    ? (primary?._id ?? null)
    : primary
      ? primary._id
      : await ctx.db.insert("attendanceMembers", { name, metadata });

  // The member's own record per event, including ones this run moves over,
  // so a later duplicate for the same event combines rather than doubles up.
  const byEvent = new Map<string, Doc<"attendance">>();
  if (primary) {
    const own = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", primary._id))
      .collect();
    for (const record of own) byEvent.set(record.eventId, record);
  }
  const moveOnto = async (record: Doc<"attendance">) => {
    const existing = byEvent.get(record.eventId);
    if (existing) {
      detail.recordsCombined++;
      const combined = {
        signInTime: Math.min(existing.signInTime, record.signInTime),
        notes: mergeNotes(existing.notes, record.notes),
      };
      byEvent.set(record.eventId, { ...existing, ...combined });
      if (dryRun) return;
      await ctx.db.patch(existing._id, combined);
      await ctx.db.delete(record._id);
    } else {
      detail.recordsMoved++;
      byEvent.set(record.eventId, record);
      if (dryRun) return;
      await ctx.db.patch(record._id, { email: undefined, memberId: target! });
    }
  };

  for (const duplicate of duplicates) {
    detail.rowsFolded++;
    const records = await ctx.db
      .query("attendance")
      .withIndex("by_member", (q) => q.eq("memberId", duplicate._id))
      .collect();
    for (const record of records) await moveOnto(record);
    if (!dryRun) await ctx.db.delete(duplicate._id);
  }
  for (const record of emailRecords) await moveOnto(record);

  if (dryRun) return detail;
  await ctx.db.patch(target!, {
    name,
    email: personalEmail ?? undefined,
    personalEmail: undefined,
    metadata,
  });
  await logAttendanceAction(ctx, {
    actorEmail: LEAVERS_ACTOR,
    entityType: "member",
    action: "member.leftStaff",
    summary: `"${name}" left staff and is now a member`,
    memberId: target!,
    subjectEmail: staffEmail,
    detail: [
      `Not staff in ${year}, so their staff email ${staffEmail} was taken off`,
      personalEmail ? `Email is now ${personalEmail}` : "No personal email on record",
      `Moved ${plural(detail.recordsMoved, "sign-in")} onto their member record` +
        (detail.recordsCombined
          ? `; combined ${plural(detail.recordsCombined, "event")} signed in to twice`
          : ""),
      ...(detail.rowsFolded
        ? [`Folded ${plural(detail.rowsFolded, "duplicate record")} into them`]
        : []),
    ].join("\n"),
  });
  return detail;
}

async function convertBatch(
  ctx: MutationCtx,
  opts: { dryRun: boolean; year: number; after?: string; limit: number; email?: string }
) {
  if (!Number.isInteger(opts.limit) || opts.limit < 1) {
    throw new ConvexError("limit must be a positive whole number.");
  }
  const only = opts.email === undefined ? undefined : canonicalEmailKey(opts.email);
  const people = (await outgoingStaff(ctx, opts.year))
    .filter(({ key }) => opts.after === undefined || key > opts.after)
    .filter(({ key }) => only === undefined || key === only);
  const batch = people.slice(0, opts.limit);
  const fields = (await ctx.db.query("attendanceMetadata").collect()).sort(
    (a, b) => a.order - b.order
  );
  const role = batch.length > 0 ? await roleField(ctx, opts.dryRun) : null;
  const staffRoles = await staffRoleLabels(ctx, opts.year - 1);
  const details: Detail[] = [];
  for (const { profile } of batch) {
    const detail = await convertPerson(
      ctx,
      profile,
      opts.year,
      fields,
      role,
      staffRoles,
      opts.dryRun
    );
    if (detail) details.push(detail);
  }
  const sum = (field: "recordsMoved" | "recordsCombined" | "rowsFolded") =>
    details.reduce((total, d) => total + d[field], 0);
  return {
    dryRun: opts.dryRun,
    year: opts.year,
    people: details.length,
    recordsMoved: sum("recordsMoved"),
    recordsCombined: sum("recordsCombined"),
    rowsFolded: sum("rowsFolded"),
    next: people.length > batch.length ? batch[batch.length - 1].key : null,
    details,
  };
}

/**
 * Turns everyone who was staff last staff year but isn't this year (or any
 * later year) back into plain members. See `convertPerson` for what changes.
 * Runs itself on October 1; this is the manual handle, e.g. for someone taken
 * off this year's staff after the rollover, or for an earlier year's leavers.
 *
 * Dry run by default. `year` is the staff year they are not staff in
 * (default: the current one). Processes `limit` people per call; pass the
 * returned `next` as `after` until it comes back null. `email` limits it to
 * one person. Idempotent: someone already converted has nothing left to move.
 *
 *   npx convex run --prod staffLeavers:convertOutgoingStaff '{}'
 *   npx convex run --prod staffLeavers:convertOutgoingStaff '{"dryRun":false}'
 *   npx convex run --prod staffLeavers:convertOutgoingStaff '{"year":2026}'
 */
export const convertOutgoingStaff = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    year: v.optional(v.number()),
    after: v.optional(v.string()),
    limit: v.optional(v.number()),
    email: v.optional(v.string()),
  },
  returns: resultValidator,
  handler: async (ctx, { dryRun = true, year, after, limit = 10, email }) =>
    await convertBatch(ctx, {
      dryRun,
      year: year ?? staffYearForDate(new Date()),
      after,
      limit,
      email,
    }),
});

/** The October 1 cron: converts the staff year's leavers for real, a batch at
 *  a time, scheduling itself until everyone is done. */
export const convertOutgoingStaffOnRollover = internalMutation({
  args: { year: v.optional(v.number()), after: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { year, after }) => {
    const staffYear = year ?? staffYearForDate(new Date());
    const result = await convertBatch(ctx, { dryRun: false, year: staffYear, after, limit: 10 });
    if (result.next) {
      await ctx.scheduler.runAfter(0, internal.staffLeavers.convertOutgoingStaffOnRollover, {
        year: staffYear,
        after: result.next,
      });
    }
    return null;
  },
});
