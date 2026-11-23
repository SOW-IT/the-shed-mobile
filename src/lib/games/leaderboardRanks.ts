// Places on a leaderboard, from rows that come best first.

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
