import { normalizeSubgroups } from "./rollcall";

const DAY_MS = 86_400_000;

export const LIKELIHOOD = {
  windowDays: 365,
  halfLifeDays: 45,
  anyEvent: 0.1,
  sharedTag: 0.5,
  sharedGroup: 1,
  sameWeeklySeries: 4,
  campus: 1,
} as const;

export type LikelihoodEvent = {
  eventId: string;
  dateStart: number;
  tagIds: readonly string[];
  subgroups: readonly string[];
  weekly?: boolean;
};

export type LikelihoodHistory = {
  events: readonly LikelihoodEvent[];
  attendees: readonly (readonly string[])[];
};

export const likelihoodWindowStart = (dateStart: number) =>
  dateStart - LIKELIHOOD.windowDays * DAY_MS;

const seriesKey = (subgroups: readonly string[]) => normalizeSubgroups([...subgroups]).sort().join("\n");

const historyIndexes = (target: LikelihoodEvent, history: LikelihoodHistory): number[] => {
  const from = likelihoodWindowStart(target.dateStart);
  const indexes: number[] = [];
  history.events.forEach((event, i) => {
    if (event.eventId === target.eventId) return;
    if (event.dateStart < from || event.dateStart >= target.dateStart) return;
    indexes.push(i);
  });
  return indexes;
};

export const likelihoodScores = (
  target: LikelihoodEvent,
  history: LikelihoodHistory
): Map<string, number> => {
  const tags = new Set(target.tagIds);
  const groups = new Set(normalizeSubgroups([...target.subgroups]));
  const series = target.weekly ? seriesKey(target.subgroups) : null;
  const scores = new Map<string, number>();
  for (const i of historyIndexes(target, history)) {
    const event = history.events[i];
    let weight = LIKELIHOOD.anyEvent;
    if (event.tagIds.some((tagId) => tags.has(tagId))) weight += LIKELIHOOD.sharedTag;
    if (normalizeSubgroups([...event.subgroups]).some((group) => groups.has(group))) {
      weight += LIKELIHOOD.sharedGroup;
    }
    if (series !== null && event.weekly && seriesKey(event.subgroups) === series) {
      weight += LIKELIHOOD.sameWeeklySeries;
    }
    const ageDays = (target.dateStart - event.dateStart) / DAY_MS;
    const points = weight * 0.5 ** (ageDays / LIKELIHOOD.halfLifeDays);
    for (const memberId of history.attendees[i] ?? []) {
      scores.set(memberId, (scores.get(memberId) ?? 0) + points);
    }
  }
  return scores;
};

export const rankedLikelihood = (scores: Map<string, number>) =>
  [...scores]
    .map(([memberId, score]) => ({ memberId, score: Math.round(score * 10_000) / 10_000 }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.memberId.localeCompare(b.memberId));

const fnv1a = (text: string) => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
};

export const likelihoodInputKey = (target: LikelihoodEvent, history: LikelihoodHistory): string => {
  const indexes = historyIndexes(target, history);
  const signIns = indexes.reduce((sum, i) => sum + (history.attendees[i]?.length ?? 0), 0);
  const inputs = indexes
    .map((i) => {
      const event = history.events[i];
      const attendees = [...(history.attendees[i] ?? [])].sort().join(",");
      return `${event.eventId}:${event.dateStart}:${seriesKey(event.subgroups)}:${[...event.tagIds].sort()}:${event.weekly ? 1 : 0}:${attendees}`;
    })
    .sort()
    .join(";");
  return [
    target.dateStart,
    seriesKey(target.subgroups),
    [...target.tagIds].sort().join(","),
    target.weekly ? "weekly" : "",
    indexes.length,
    signIns,
    fnv1a(inputs),
  ].join("|");
};

export const compareLikelihood = (
  aScore: number,
  bScore: number,
  aName: string,
  bName: string
): number => bScore - aScore || aName.localeCompare(bName);
