import { AccessibilityInfo, Platform } from "react-native";
import type { Reply } from "@shared/world";

/**
 * Says something to a screen reader without moving focus. On iOS that's a
 * queued announcement; on the web the text sits in a polite live region
 * where it's shown, so nothing is needed here.
 */
export const announce = (text: string) => {
  if (Platform.OS === "web") return;
  AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: true });
};

/** Whether you've already accepted the ask `from` made at `askAt`. */
export const accepted = (
  me: { reply?: Reply; answered?: Reply[] } | undefined,
  from: string,
  askAt: number
) =>
  (me?.reply?.to === from && me.reply.askAt === askAt) ||
  (me?.answered ?? []).some((a) => a.to === from && a.askAt === askAt);
