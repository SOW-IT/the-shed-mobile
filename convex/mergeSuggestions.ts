import { ConvexError, v } from "convex/values";
import { assignmentsOf } from "../shared/flow";
import { resolveUniversity, ROLE_FIELD_KEY } from "../shared/attendanceMemberMeta";
import {
  campusCompatible,
  NAME_MATCHES,
  type NameMatch,
  nameMatch,
  nameWords,
} from "../shared/mergeSuggestions";
import { personDisplayName } from "../shared/rollcall";
import { canonicalEmailKey } from "../shared/rollcallImport";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logAttendanceAction } from "./attendanceAudit";
import { latestStaffProfile } from "./attendanceMembers";
import { currentStaffYear, optionalEmail, requireAdmin, rolesOf } from "./model";

export type MergeCandidate = {
  memberId: Id<"attendanceMembers">;
  name: string;
  email?: string;
  campus?: string;
  role?: string;
  match: NameMatch;
  signIns: number;
  lastSignIn: number | null;
};

export type MergeSuggestion = {
  staffEmail: string;
  staffName: string;
  roles: string[];
  universities: string[];
  candidates: MergeCandidate[];
};

/**
 * Staff in the current staff year who look like someone still in attendance
 * as a plain member: a similar name, and the same campus when both have one. Merging
 * (the existing member → staff merge) or "Not the same" clears a pair, so an
 * empty list means the year is reconciled. Next year's staff aren't
 * suggested: they're merged once their year starts.
 */
export const list = query({
  args: {},
  handler: async (ctx): Promise<MergeSuggestion[] | null> => {
    if ((await optionalEmail(ctx)) === null) return null;
    await requireAdmin(ctx);
    const year = currentStaffYear();

    const fields = await ctx.db.query("attendanceMetadata").collect();
    const roleField = fields.find((f) => f.key === ROLE_FIELD_KEY);
    const allProfiles = await ctx.db.query("staffProfiles").collect();
    // A row carrying anyone's staff email (any year) is that person's own
    // staff row, not a duplicate: merging it away is blocked anyway.
    const staffKeys = new Set(allProfiles.map((p) => canonicalEmailKey(p.email)));
    const members = (await ctx.db.query("attendanceMembers").collect())
      .filter((m) => !staffKeys.has(canonicalEmailKey(m.email)))
      .map((m) => ({ row: m, words: nameWords(m.name) }));
    const dismissed = new Set(
      (await ctx.db.query("mergeSuggestionDismissals").collect()).map(
        (d) => `${d.staffEmail}|${d.memberId}`
      )
    );

    // One member can match several staff (two staff with the same name), so
    // each member's sign-ins are read once.
    const histories = new Map<
      Id<"attendanceMembers">,
      { signIns: number; lastSignIn: number | null }
    >();
    const historyOf = async (memberId: Id<"attendanceMembers">) => {
      let history = histories.get(memberId);
      if (!history) {
        const records = await ctx.db
          .query("attendance")
          .withIndex("by_member", (q) => q.eq("memberId", memberId))
          .collect();
        history = {
          signIns: records.length,
          lastSignIn: records.length
            ? Math.max(...records.map((r) => r.signInTime))
            : null,
        };
        histories.set(memberId, history);
      }
      return history;
    };

    const suggestions: MergeSuggestion[] = [];
    for (const profile of allProfiles) {
      if (profile.year !== year) continue;
      const staffKey = canonicalEmailKey(profile.email)!;
      const staffWords = nameWords(profile.name ?? "");
      const universities = [
        ...new Set(assignmentsOf(profile).flatMap((a) => (a.university ? [a.university] : []))),
      ];
      const candidates: MergeCandidate[] = [];
      for (const { row, words } of members) {
        const match = nameMatch(staffWords, words);
        if (!match || dismissed.has(`${staffKey}|${row._id}`)) continue;
        const campus = resolveUniversity(fields, row.metadata);
        if (!campusCompatible(universities, campus)) continue;
        const rawRole = roleField ? row.metadata?.[roleField._id] : undefined;
        candidates.push({
          memberId: row._id,
          name: row.name,
          email: row.email,
          campus,
          role: rawRole ? (roleField?.values?.[rawRole] ?? rawRole) : undefined,
          match,
          ...(await historyOf(row._id)),
        });
      }
      if (candidates.length === 0) continue;
      candidates.sort(
        (a, b) =>
          NAME_MATCHES.indexOf(a.match) - NAME_MATCHES.indexOf(b.match) ||
          b.signIns - a.signIns
      );
      suggestions.push({
        staffEmail: profile.email.toLowerCase(),
        staffName: personDisplayName(profile.name, profile.email),
        roles: rolesOf(profile),
        universities,
        candidates,
      });
    }
    return suggestions.sort((a, b) => a.staffName.localeCompare(b.staffName));
  },
});

/** "Not the same person": stop suggesting this member for this staff person. */
export const dismiss = mutation({
  args: { staffEmail: v.string(), memberId: v.id("attendanceMembers") },
  handler: async (ctx, { staffEmail, memberId }) => {
    const { email: actorEmail } = await requireAdmin(ctx);
    const profile = await latestStaffProfile(ctx, staffEmail);
    if (!profile) throw new ConvexError("Staff profile not found.");
    const staffKey = canonicalEmailKey(profile.email)!;
    const member = await ctx.db.get(memberId);
    if (!member) throw new ConvexError("That member no longer exists.");
    const existing = await ctx.db
      .query("mergeSuggestionDismissals")
      .withIndex("by_staff_and_member", (q) =>
        q.eq("staffEmail", staffKey).eq("memberId", memberId)
      )
      .unique();
    if (existing) return null;
    await ctx.db.insert("mergeSuggestionDismissals", {
      staffEmail: staffKey,
      memberId,
      dismissedBy: actorEmail,
      dismissedAt: Date.now(),
    });
    await logAttendanceAction(ctx, {
      actorEmail,
      entityType: "member",
      action: "member.notSame",
      summary: `Marked "${member.name}" as not the same person as staff "${personDisplayName(profile.name, profile.email)}"`,
      memberId,
      subjectEmail: profile.email.toLowerCase(),
    });
    return null;
  },
});
