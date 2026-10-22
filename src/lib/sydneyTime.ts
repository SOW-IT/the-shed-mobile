import { SYDNEY_TIME_ZONE } from "../../shared/flow";

export const sydneyDay = (ms: number) =>
  new Date(ms).toLocaleDateString("en-AU", {
    timeZone: SYDNEY_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });

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
    .replace(/[  ]/g, " ");

export const sydneyTime = (ms: number) =>
  new Date(ms)
    .toLocaleTimeString("en-AU", { timeZone: SYDNEY_TIME_ZONE, hour: "numeric", minute: "2-digit" })
    .replace(/[\u202f\u00a0]/g, " ");
