import { v } from "convex/values";
import { internalAction } from "./_generated/server";

/**
 * Sends a notification email through Resend. Runs as a scheduled internal
 * action so request mutations never block (or fail) on email delivery.
 */
export const send = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    /** Optional Reply-To so a recipient can reply straight to the sender. */
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
      // Throw so the scheduled function shows as failed in the Convex dashboard
      // (rollover IT email, request notifications, …) instead of only logging.
      throw new Error(`Resend error ${response.status}: ${detail}`);
    }
    return null;
  },
});
