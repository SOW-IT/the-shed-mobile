import { plural } from "./reminders";

export const SONGS_COUNTED = 100;

export const songsToReviewLabel = (count: number): string =>
  count > SONGS_COUNTED
    ? `Over ${SONGS_COUNTED} songs to review`
    : `${plural(count, "song")} to review`;
