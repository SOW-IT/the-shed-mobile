import {
  designRequestName,
  MARKETING_TEAM_EMAIL,
  sydneyToday,
  type DesignRequestStatus,
} from "../shared/designRequests";
import { SUB_FORM_KINDS } from "../shared/eventRequests";
import {
  currentStep,
  eventStaffYear,
  FINANCE,
  requestCompleted,
  STEP_LABELS,
} from "../shared/flow";
import { formatAmount } from "../shared/money";
import { canonicalEmailKey, staffEmailCandidates } from "../shared/rollcallImport";
import {
  COMMENT_REMINDER_AFTER_MS,
  dueText,
  eventTimingText,
  forDays,
  plural,
  reminderDue,
  reminderSubject,
  summarizeWaiting,
  type ReminderKind,
} from "../shared/reminders";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { internalMutation, MutationCtx } from "./_generated/server";
import {
  accessTo as designAccessTo,
  designRequestUrl,
  headRecipients,
  marketingTeam,
} from "./designRequests";
import {
  accessResolver,
  canCommentOn,
  eventUrl,
  formName,
  headOf,
  isCampusLeader,
  recipientsFor,
  stepApprover,
  subFormsOf,
} from "./eventRequestAccess";
import {
  currentStaffYear,
  profileForCurrentYear,
  withDelegatesForYear,
  type CallerContext,
} from "./model";
import {
  appUrl,
  lastMovementAt,
  makeApproverResolver,
  nextApproverWithYear,
  notify,
  openRequestsAcrossYears,
} from "./requests";

const LIST_LIMIT = 300;

type Item = {
  kind: ReminderKind;
  line: string;
  url: string;
  listUrl: string;
  emailed: boolean;
};

type Digest = Map<string, { to: string; items: Item[] }>;

const uniqueRecipients = (emails: (string | undefined)[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const email of emails) {
    if (!email) continue;
    const key = canonicalEmailKey(email) ?? email;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(email);
  }
  return unique;
};

const add = (digest: Digest, to: string, item: Item) => {
  const key = canonicalEmailKey(to) ?? to;
  const entry = digest.get(key) ?? { to, items: [] };
  entry.items.push(item);
  digest.set(key, entry);
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

async function collectRequests(ctx: MutationCtx, digest: Digest, now: number) {
  const year = currentStaffYear();
  const getApprovers = makeApproverResolver(ctx);
  for (const request of await openRequestsAcrossYears(ctx, year)) {
    if (requestCompleted(request)) continue;
    const { due, count, days } = reminderDue(request, await lastMovementAt(ctx, request), now);
    if (!due) continue;

    const reqYear = eventStaffYear(request._creationTime);
    const requestYearApprovers = await getApprovers(reqYear, request.department);
    const thisYearApprovers =
      reqYear === year ? requestYearApprovers : await getApprovers(year, request.department);

    const step = currentStep(request);
    let recipients: string[] = [];
    let waitingOn = "";
    let url = "/?tab=review";
    if (step !== null) {
      const next = nextApproverWithYear(request, requestYearApprovers, thisYearApprovers);
      recipients = uniqueRecipients(
        next ? await withDelegatesForYear(ctx, next.year, next.email) : []
      );
      waitingOn = `waiting on your ${STEP_LABELS[step]} approval`;
    } else if (!request.receipt) {
      recipients = [request.requesterEmail];
      waitingOn = "waiting on your receipt";
      url = "/?tab=mine";
    } else if (request.paid === false) {
      const finance = await getApprovers(reqYear, FINANCE);
      const financeNow = reqYear === year ? finance : await getApprovers(year, FINANCE);
      const head = preferRequestYear(
        finance.financeHeadEmail,
        financeNow.financeHeadEmail,
        reqYear,
        year
      );
      recipients = uniqueRecipients(
        head ? await withDelegatesForYear(ctx, head.year, head.email) : []
      );
      waitingOn = "waiting on payment";
    }
    if (recipients.length === 0) continue;

    const line = `$${formatAmount(request.amount)} from ${request.requesterEmail} (${request.department}), ${request.description}: ${waitingOn} ${forDays(days)}`;
    for (const to of recipients) {
      add(digest, to, { kind: "reimbursement", line, url, listUrl: url, emailed: true });
    }
    await ctx.db.patch("requests", request._id, { lastReminderAt: now, reminderCount: count + 1 });
  }
}

const designMovementAt = async (ctx: MutationCtx, request: Doc<"designRequests">) => {
  const latest = await ctx.db
    .query("designRequestEvents")
    .withIndex("by_designRequest", (q) => q.eq("designRequestId", request._id))
    .order("desc")
    .first();
  return Math.max(request.submittedAt, latest?._creationTime ?? 0);
};

async function collectDesignRequests(
  ctx: MutationCtx,
  digest: Digest,
  inbox: string[],
  now: number
) {
  const today = sydneyToday(new Date(now));
  const listUrl = "/design-requests?tab=queue";
  for (const status of ["PENDING", "APPROVED"] satisfies DesignRequestStatus[]) {
    const rows = await ctx.db
      .query("designRequests")
      .withIndex("by_status", (q) => q.eq("status", status))
      .take(LIST_LIMIT);
    for (const request of rows) {
      const { due, count, days } = reminderDue(request, await designMovementAt(ctx, request), now);
      if (!due) continue;
      const team =
        status === "PENDING"
          ? await headRecipients(ctx, request.year)
          : await marketingTeam(ctx);
      const recipients = uniqueRecipients(team).filter(
        (email) => email !== request.requesterEmail
      );
      if (recipients.length === 0) continue;
      const needed = dueText(request.dueDate, today);
      const what = `${designRequestName(request)} for ${request.department}`;
      const line =
        status === "PENDING"
          ? `${what}: waiting on your approval ${forDays(days)}${needed ? `, ${needed}` : ""}`
          : `${what}: approved and still to finish ${forDays(days)}${needed ? `, ${needed}` : ""}`;
      const url = designRequestUrl(request);
      for (const to of recipients) {
        add(digest, to, { kind: "design", line, url, listUrl, emailed: status === "PENDING" });
      }
      if (status === "APPROVED") inbox.push(line);
      await ctx.db.patch("designRequests", request._id, {
        lastReminderAt: now,
        reminderCount: count + 1,
      });
    }
  }
}

const latestTrailByForm = async (ctx: MutationCtx, event: Doc<"eventRequests">) => {
  const latest = new Map<string, number>();
  for await (const row of ctx.db
    .query("eventRequestEvents")
    .withIndex("by_eventRequest", (q) => q.eq("eventRequestId", event._id))
    .order("desc")) {
    if (row.form && !latest.has(row.form)) latest.set(row.form, row._creationTime);
    if (latest.size === SUB_FORM_KINDS.length) break;
  }
  return latest;
};

const formMovementAt = (
  event: Doc<"eventRequests">,
  form: Doc<"eventSubForms">,
  trail: Map<string, number>
) =>
  Math.max(
    event._creationTime,
    trail.get(form.kind) ?? 0,
    form.updatedAt ?? 0,
    form.submittedAt ?? 0,
    form.directorApprovedAt ?? 0,
    form.decidedAt ?? 0
  );

async function collectEventForms(ctx: MutationCtx, digest: Digest, now: number) {
  const today = sydneyToday(new Date(now));
  const events = await ctx.db
    .query("eventRequests")
    .withIndex("by_status", (q) => q.eq("status", "IN_PROGRESS"))
    .take(LIST_LIMIT);
  for (const event of events) {
    const forms = await subFormsOf(ctx, event._id);
    const trail = await latestTrailByForm(ctx, event);
    const timing = eventTimingText(event.startsAt, today);
    for (const kind of SUB_FORM_KINDS) {
      const form = forms[kind];
      let recipients: string[] = [];
      let waitingOn = "";
      let listUrl = "";
      if (form.status === "PENDING") {
        const approver = await stepApprover(ctx, event, kind, form.step);
        recipients = uniqueRecipients(await recipientsFor(ctx, approver)).filter(
          (e) => e !== form.submittedBy
        );
        waitingOn = "waiting on your approval";
        listUrl = "/event-requests?tab=review";
      } else if (form.status === "DRAFT" || form.status === "CHANGES_REQUESTED") {
        const head = await headOf(ctx, event, event.department);
        recipients = uniqueRecipients([
          event.requesterEmail,
          form.submittedBy,
          ...(await recipientsFor(ctx, head)),
        ]);
        waitingOn =
          form.status === "DRAFT" ? "not submitted yet" : "changes were requested, not resubmitted";
        listUrl = "/event-requests?tab=mine";
      } else {
        continue;
      }
      if (recipients.length === 0) continue;
      const { due, count, days } = reminderDue(form, formMovementAt(event, form, trail), now);
      if (!due) continue;
      const line = `${formName(kind)} for ${event.name}: ${waitingOn} ${forDays(days)}${timing ? `; ${timing}` : ""}`;
      const url = eventUrl(event, { form: kind });
      for (const to of recipients) {
        add(digest, to, { kind: "event", line, url, listUrl, emailed: true });
      }
      await ctx.db.patch("eventSubForms", form._id, {
        lastReminderAt: now,
        reminderCount: count + 1,
      });
    }
  }
}

const COMMENT_LOOKBACK_MS = 7 * COMMENT_REMINDER_AFTER_MS;
// How much one run reads, so a busy week can't sink the digest (Convex allows
// 4,096 reads a mutation, shared with the other reminders): the newest 1,000
// comments that are due (a day to a week old), then the 20 threads of each
// kind with the newest of those, the newest 200 comments in each for who has
// commented there, access checks for at most 60 of those commenters, and a
// profile check for each event's requester and submitter (the approver is
// always reminded). That's roughly 60 × 15 + 2 × 20 × 25 + 20 × 4 ≈ 2,000
// reads. Busier weeks than that are far beyond what SOW has; past it the
// oldest threads and later commenters miss out.
const COMMENT_SCAN_LIMIT = 1000;
const THREADS_PER_RUN = 20;
const THREAD_LIMIT = 200;
const COMMENTER_CHECKS = 60;

type Comment = { authorEmail: string; postedAt: number };
type Read = { lastReadAt: number; remindedAt?: number };

const emailKey = (email: string) => canonicalEmailKey(email) ?? email;
// Both staff addresses, since someone reads under the one they sign in with.
const addressesOf = (email: string) => [...new Set([email, ...staffEmailCandidates(email)])];

// The comments in a thread someone still hasn't read a day after they were
// posted, leaving out their own and any an earlier reminder already mentioned.
const unreadToRemind = (comments: Comment[], to: string, reads: Read[], now: number) => {
  const since = Math.max(0, ...reads.map((r) => Math.max(r.lastReadAt, r.remindedAt ?? 0)));
  return comments.filter(
    (c) =>
      emailKey(c.authorEmail) !== emailKey(to) &&
      c.postedAt > since &&
      now - c.postedAt >= COMMENT_REMINDER_AFTER_MS
  );
};

const newestOf = (comments: Comment[]) => Math.max(...comments.map((c) => c.postedAt));

// Who has commented in a thread: the authors of its newest comments and of
// the ones being reminded about.
const commenterEmails = (thread: Comment[], due: Comment[]) =>
  [...new Set([...thread, ...due].map((c) => c.authorEmail))];

// Unread comments go to whoever the thread is for: the requester, the form's
// submitter and approver (the Marketing Head for a design request), and anyone
// who has commented on it and can still comment there.
async function collectUnreadComments(ctx: MutationCtx, digest: Digest, now: number) {
  const since = now - COMMENT_LOOKBACK_MS;
  const dueBy = now - COMMENT_REMINDER_AFTER_MS;
  const callers = new Map<string, Promise<CallerContext | null>>();
  const callerFor = (email: string) => {
    let caller = callers.get(email);
    if (!caller) {
      caller = profileForCurrentYear(ctx, email);
      callers.set(email, caller);
    }
    return caller;
  };
  let commenterChecks = 0;
  const canCheck = (author: string) =>
    callers.has(author) || commenterChecks++ < COMMENTER_CHECKS;
  const eventAccess = new Map<string, ReturnType<typeof accessResolver>>();

  const eventThreads = new Map<string, Doc<"eventRequestComments">[]>();
  for (const comment of await ctx.db
    .query("eventRequestComments")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", since).lte("_creationTime", dueBy))
    .order("desc")
    .take(COMMENT_SCAN_LIMIT)) {
    const key = `${comment.eventRequestId} ${comment.form}`;
    eventThreads.set(key, [...(eventThreads.get(key) ?? []), comment]);
  }
  for (const comments of [...eventThreads.values()].slice(0, THREADS_PER_RUN)) {
    const { eventRequestId, form: kind } = comments[0];
    const event = await ctx.db.get("eventRequests", eventRequestId);
    if (!event) continue;
    const form = (await subFormsOf(ctx, event._id))[kind];
    const thread = await ctx.db
      .query("eventRequestComments")
      .withIndex("by_eventRequest_and_form_and_postedAt", (q) =>
        q.eq("eventRequestId", event._id).eq("form", kind)
      )
      .order("desc")
      .take(THREAD_LIMIT);
    const canStillComment = async (email: string) => {
      const caller = await callerFor(email);
      if (!caller || isCampusLeader(caller)) return false;
      let accessOf = eventAccess.get(email);
      if (!accessOf) {
        accessOf = accessResolver(ctx, caller);
        eventAccess.set(email, accessOf);
      }
      return canCommentOn(await accessOf(event), kind);
    };
    const commenters: string[] = [];
    for (const author of commenterEmails(thread, comments)) {
      if (canCheck(author) && (await canStillComment(author))) commenters.push(author);
    }
    // The requester and submitter, unless they've since become campus
    // leaders, who can't open event requests.
    const requesterSide: string[] = [];
    for (const email of [event.requesterEmail, form.submittedBy]) {
      if (email && (await canStillComment(email))) requesterSide.push(email);
    }
    const recipients = uniqueRecipients([
      ...requesterSide,
      ...(await recipientsFor(ctx, await stepApprover(ctx, event, kind, form.step))),
      ...commenters,
    ]);
    for (const to of recipients) {
      const reads: Doc<"eventRequestCommentReads">[] = [];
      for (const email of addressesOf(to)) {
        const read = await ctx.db
          .query("eventRequestCommentReads")
          .withIndex("by_eventRequest_and_form_and_user", (q) =>
            q.eq("eventRequestId", event._id).eq("form", kind).eq("userEmail", email)
          )
          .unique();
        if (read) reads.push(read);
      }
      const unread = unreadToRemind(comments, to, reads, now);
      if (unread.length === 0) continue;
      add(digest, to, {
        kind: "comment",
        line: `${plural(unread.length, "unread comment")} on the ${formName(kind)} for ${event.name}`,
        url: eventUrl(event, { form: kind, thread: true }),
        listUrl: "/event-requests",
        emailed: true,
      });
      const remindedAt = newestOf(unread);
      for (const read of reads) await ctx.db.patch("eventRequestCommentReads", read._id, { remindedAt });
      if (reads.length === 0) {
        await ctx.db.insert("eventRequestCommentReads", {
          eventRequestId: event._id,
          form: kind,
          userEmail: to,
          lastReadAt: 0,
          remindedAt,
        });
      }
    }
  }

  const designThreads = new Map<Id<"designRequests">, Doc<"designRequestComments">[]>();
  for (const comment of await ctx.db
    .query("designRequestComments")
    .withIndex("by_creation_time", (q) => q.gte("_creationTime", since).lte("_creationTime", dueBy))
    .order("desc")
    .take(COMMENT_SCAN_LIMIT)) {
    if (comment.legacyKey !== undefined) continue;
    const id = comment.designRequestId;
    designThreads.set(id, [...(designThreads.get(id) ?? []), comment]);
  }
  for (const [id, comments] of [...designThreads].slice(0, THREADS_PER_RUN)) {
    const request = await ctx.db.get("designRequests", id);
    if (!request) continue;
    const thread = await ctx.db
      .query("designRequestComments")
      .withIndex("by_designRequest_and_postedAt", (q) => q.eq("designRequestId", id))
      .order("desc")
      .take(THREAD_LIMIT);
    // Only the requester and the Marketing team (or whoever covers its Head)
    // can still comment on a design request.
    const commenters: string[] = [];
    for (const author of commenterEmails(thread, comments)) {
      if (!canCheck(author)) continue;
      const caller = await callerFor(author);
      if (caller && (await designAccessTo(ctx, caller, request)).canComment) commenters.push(author);
    }
    const recipients = uniqueRecipients([
      request.requesterEmail,
      ...(await headRecipients(ctx, request.year)),
      ...commenters,
    ]);
    for (const to of recipients) {
      const reads: Doc<"designRequestCommentReads">[] = [];
      for (const email of addressesOf(to)) {
        const read = await ctx.db
          .query("designRequestCommentReads")
          .withIndex("by_designRequest_and_user", (q) =>
            q.eq("designRequestId", id).eq("userEmail", email)
          )
          .unique();
        if (read) reads.push(read);
      }
      const unread = unreadToRemind(comments, to, reads, now);
      if (unread.length === 0) continue;
      add(digest, to, {
        kind: "comment",
        line: `${plural(unread.length, "unread comment")} on ${request.title ? `the design request for ${request.title}` : "a design request"}`,
        url: designRequestUrl(request, { thread: true }),
        listUrl: "/design-requests",
        emailed: true,
      });
      const remindedAt = newestOf(unread);
      for (const read of reads) await ctx.db.patch("designRequestCommentReads", read._id, { remindedAt });
      if (reads.length === 0) {
        await ctx.db.insert("designRequestCommentReads", {
          designRequestId: id,
          userEmail: to,
          lastReadAt: 0,
          remindedAt,
        });
      }
    }
  }
}

const landingUrl = (items: Item[]): string => {
  if (items.length === 1) return items[0].url;
  const listUrls = new Set(items.map((item) => item.listUrl));
  return listUrls.size === 1 ? items[0].listUrl : "/home";
};

const countsByKind = (items: Item[]): Partial<Record<ReminderKind, number>> => {
  const counts: Partial<Record<ReminderKind, number>> = {};
  for (const item of items) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  return counts;
};

const wantsReminderEmails = async (ctx: MutationCtx, email: string) => {
  const candidates = staffEmailCandidates(email);
  for (const candidate of candidates.length > 0 ? candidates : [email]) {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", candidate))
      .first();
    if (user?.reminderEmails === false) return false;
  }
  return true;
};

async function sendDigest(ctx: MutationCtx, to: string, items: Item[]) {
  const lead = summarizeWaiting(countsByKind(items));
  const url = landingUrl(items);
  await notify(ctx, {
    to,
    subject: reminderSubject(items.length),
    pushTitle: "Waiting on you",
    body: `${lead}\n\n${items.map((item) => item.line).join("\n")}`,
    url,
    email: false,
  });
  const emailed = items.filter((item) => item.emailed);
  if (emailed.length === 0 || !(await wantsReminderEmails(ctx, to))) return;
  const link = landingUrl(emailed);
  await ctx.scheduler.runAfter(0, internal.emails.send, {
    to,
    subject: reminderSubject(emailed.length),
    body: `${summarizeWaiting(countsByKind(emailed))}\n\n${emailed.map((item) => item.line).join("\n")}\n\nOpen in THE SHED: ${appUrl(link)}\n\nYou can turn these reminder emails off on your Profile in THE SHED.`,
  });
}

export const remindStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const digest: Digest = new Map();
    const inbox: string[] = [];
    await collectRequests(ctx, digest, now);
    await collectDesignRequests(ctx, digest, inbox, now);
    await collectEventForms(ctx, digest, now);
    await collectUnreadComments(ctx, digest, now);
    for (const { to, items } of digest.values()) {
      await sendDigest(ctx, to, items);
    }
    if (inbox.length > 0) {
      await ctx.scheduler.runAfter(0, internal.emails.send, {
        to: MARKETING_TEAM_EMAIL,
        subject: `Reminder: ${plural(inbox.length, "approved design request")} still to finish`,
        body: `${inbox.join("\n")}\n\nOpen in THE SHED: ${appUrl("/design-requests?tab=queue")}`,
      });
    }
    return null;
  },
});
