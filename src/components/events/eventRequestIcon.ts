import type { AppIconName } from "@/components/ui";

export const EVENT_REQUEST_ICON = {
  outline: { material: "calendar-check-outline" },
  filled: { material: "calendar-check" },
} as const satisfies Record<"outline" | "filled", AppIconName>;
