import { plural } from "./reminders";

export const SONGS_COUNTED = 100;

export const songsToReviewLabel = (count: number): string =>
  count > SONGS_COUNTED
    ? `Over ${SONGS_COUNTED} songs to review`
    : `${plural(count, "song")} to review`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const releaseDateLabel = (releaseDate: string | undefined): string | null => {
  const [year, month, day] = (releaseDate ?? "").split("-");
  if (!/^\d{4}$/.test(year ?? "")) return null;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return year;
  return day ? `${Number(day)} ${monthName} ${year}` : `${monthName} ${year}`;
};

export const songServiceLabel = (link: string): string =>
  /(^|\.)spotify\.com$/.test(safeHost(link))
    ? "Open in Spotify"
    : /(^|\.)(youtube\.com|youtu\.be)$/.test(safeHost(link))
      ? "Open in YouTube"
      : "Open link";

const safeHost = (link: string): string => {
  try {
    return new URL(link).hostname.toLowerCase();
  } catch {
    return "";
  }
};
