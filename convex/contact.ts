import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { optionalEmail } from "./model";

const CONTACT_INBOX = "info@sowaustralia.com";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MESSAGE = 5000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS = 3;

/** Public "Contact us" form (Home → Partner). */
export const submit = mutation({
  args: {
    email: v.string(),
    message: v.string(),
  },
  handler: async (ctx, { email, message }) => {
    // A signed-in caller always sends from their locked account email; the
    // client-supplied address is only trusted for anonymous visitors. This
    // stops a staff member from spoofing another person as the sender.
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
        "That message is a little too long — please shorten it."
      );
    }

    // Rate limit with a bounded read: the compound index lets us fetch only
    // this sender's rows inside the window, capped at MAX_SUBMISSIONS, so a
    // public endpoint can never be pushed into scanning an unbounded history
    // (which would also blow past Convex's transaction read limits).
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

    await ctx.db.insert("contactRateLimit", {
      fromEmail,
      submittedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: CONTACT_INBOX,
      subject: `New contact message from ${fromEmail}`,
      body: `From: ${fromEmail}\n\n${body}`,
      // So the team can reply straight to the sender instead of copying the
      // address out of the body.
      replyTo: fromEmail,
    });

    // Acknowledge to the sender. The submitted message is deliberately NOT
    // echoed back here: for anonymous visitors the recipient address is
    // caller-controlled, so echoing their text would let the form be used to
    // relay arbitrary content to arbitrary addresses. A fixed template keeps
    // the confirmation without that abuse vector.
    await ctx.scheduler.runAfter(0, internal.emails.send, {
      to: fromEmail,
      subject: "We've received your message — Student Outreach to the World",
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
