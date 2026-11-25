// Places on a leaderboard, from rows that come best first.

import { clockTime } from "../../../shared/calendar";
import { dayMonthLabel } from "../../../shared/datetime";
import { fullName } from "../../../shared/names";

/** Numbers the rows: equal scores share the place of the first of them. */
export const withRanks = <R extends { score: number }>(rows: readonly R[]): (R & { rank: number })[] => {
  let rank = 0;
  let previous: number | null = null;
  return rows.map((row, index) => {
    if (row.score !== previous) {
      rank = index + 1;
      previous = row.score;
    }
    return { ...row, rank };
  });
};

export const leaderboardName = ({ name, isMe }: { name: string; isMe: boolean }): string =>
  isMe ? `${fullName(name)} (you)` : fullName(name);

export const leaderboardDate = (playedAt: number | undefined, now?: number): string | null => {
  if (playedAt === undefined) return null;
  const played = new Date(playedAt);
  return `${dayMonthLabel(playedAt, now)}, ${clockTime(played.getHours() * 60 + played.getMinutes())}`;
};
