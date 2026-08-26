import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { optionalEmail } from "./model";

const CONTACT_INBOX = "info@sowaustralia.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 5000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS = 3;
const MAX_SUBMISSIONS_GLOBAL = 30;
const PRUNE_BATCH = 50;

export const submit = mutation({
  args: {
    email: v.string(),
    message: v.string(),
  },
  handler: async (ctx, { email, message }) => {
    const authedEmail = await optionalEmail(ctx);
    const fromEmail = (authedEmail ?? email).trim().toLowerCase();
    const body = message.trim();

    if (!EMAIL_RE.test(fromEmail)) {
      throw new ConvexError("Please enter a valid email address.");
    }
    if (body.length < 2) {
      throw new ConvexError("Please enter a message.");
    }
    if (body.length > MAX_MESSAGE) {
      throw new ConvexError(
        "That message is a little too long. Please shorten it."
      );
    }

    const now = Date.now();
    const recentInWindow = await ctx.db
      .query("contactRateLimit")
      .withIndex("by_email_and_time", (q) =>
        q.eq("fromEmail", fromEmail).gt("submittedAt", now - WINDOW_MS)
      )
      .take(MAX_SUBMISSIONS);
    if (recentInWindow.length >= MAX_SUBMISSIONS) {
      throw new ConvexError(
        "You've submitted a few messages recently. Please wait an hour before sending another."
      );
    }
    const globalInWindow = await ctx.db
      .query("contactRateLimit")
      .withIndex("by_time", (q) => q.gt("submittedAt", now - WINDOW_MS))
      .take(MAX_SUBMISSIONS_GLOBAL);
    if (globalInWindow.length >= MAX_SUBMISSIONS_GLOBAL) {
      throw new ConvexError(
        "The contact form is receiving a lot of messages right now. Please try again later."
      );
    }

    const stale = await ctx.db
      .query("contactRateLimit")
      .withIndex("by_time", (q) => q.lte("submittedAt", now - WINDOW_MS))
      .take(PRUNE_BATCH);
    for (const row of stale) await ctx.db.delete("contactRateLimit", row._id);

    await ctx.db.insert("contactRateLimit", {
      fromEmail,
      submittedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: CONTACT_INBOX,
      subject: `New contact message from ${fromEmail}`,
      body: `From: ${fromEmail}\n\n${body}`,
      replyTo: fromEmail,
    });

    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: fromEmail,
      subject: "We've received your message",
      body:
        "Hi,\n\n" +
        "Thanks for reaching out to Student Outreach to the World. We've received " +
        "your message and will reply as soon as we can, usually within 2-3 " +
        "business days.\n\n" +
        "Blessings,\n" +
        "The SOW team",
    });

    return null;
  },
});
