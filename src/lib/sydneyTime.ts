import { SYDNEY_TIME_ZONE } from "../../shared/flow";

/**
 * "6 Oct 2026, 8:49 pm" in Sydney time, wherever the viewer is, so a design
 * request's page and its PDF read the same.
 */
export const sydneyDateTime = (ms: number) =>
  new Date(ms)
    .toLocaleString("en-AU", {
      timeZone: SYDNEY_TIME_ZONE,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    // Newer Intl puts a narrow no-break space before "pm", which the PDF's
    // built-in fonts can't draw.
    .replace(/[  ]/g, " ");
