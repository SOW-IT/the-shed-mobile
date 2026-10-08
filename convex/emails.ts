import { v } from "convex/values";
import { internalAction } from "./_generated/server";

export const send = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    replyTo: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.warn("RESEND_API_KEY/RESEND_FROM_EMAIL not set; skipping email to", args.to);
      return null;
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        text: args.body,
        ...(args.replyTo ? { reply_to: args.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend error ${response.status}: ${detail}`);
    }
    return null;
  },
});

/**
 * Many emails in one Resend request (at most 100, Resend's batch size), for an
 * announcement. Callers space batches a second apart to stay under Resend's
 * request rate.
 */
export const sendBatch = internalAction({
  args: {
    messages: v.array(v.object({ to: v.string(), subject: v.string(), body: v.string() })),
    replyTo: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      console.warn(
        "RESEND_API_KEY/RESEND_FROM_EMAIL not set; skipping",
        args.messages.length,
        "emails"
      );
      return null;
    }
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        args.messages.map((message) => ({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.body,
          ...(args.replyTo ? { reply_to: args.replyTo } : {}),
        }))
      ),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Resend error ${response.status}: ${detail}`);
    }
    return null;
  },
});
