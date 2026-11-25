import { CAFE_GAMES, cafeTableOf, isCafeGameKind, playingLine, playingTag, type Side, type Winner } from "../../shared/cafeGames";

export type PlayingTag = { tag: string; icon: string; with: string };

export type CafeChallengeView = {
  id: string;
  kind?: string;
  other: string | null;
  otherName: string;
  picked: "me" | "them" | "nobody";
  table?: string;
  expiresAt: number;
};

type Seated = { memberId: string; isMe: boolean; seat?: string };

export const shownChallenge = <C extends CafeChallengeView>(
  challenges: readonly C[],
  { now, people, dismissed }: { now: number; people: readonly Seated[]; dismissed: ReadonlySet<string> }
): C | null => {
  const me = people.find((p) => p.isMe);
  const stillAtTable = (c: C) => {
    if (c.table === undefined || c.picked !== "nobody") return true;
    const them = people.find((p) => p.memberId === c.other);
    return cafeTableOf(me?.seat) === c.table && cafeTableOf(them?.seat) === c.table;
  };
  const live = challenges.filter((c) => c.expiresAt > now && c.other !== null && !dismissed.has(`${c.id}:${c.picked}`) && stillAtTable(c));
  return live.find((c) => c.picked === "them") ?? live[0] ?? null;
};

export const gameLabel = (kind: string | undefined) => (kind !== undefined && isCafeGameKind(kind) ? CAFE_GAMES[kind].label : "a game");
export const gameIcon = (kind: string | undefined) => (kind !== undefined && isCafeGameKind(kind) ? CAFE_GAMES[kind].icon : "🎲");

export const challengeTitle = (c: CafeChallengeView) =>
  c.picked === "nobody"
    ? `Play ${c.otherName}?`
    : c.picked === "me"
      ? `Asked ${c.otherName}`
      : `${c.otherName} wants to play`;

type Playing = { a: string; b: string; kind: string };

export const playingByPerson = (games: readonly Playing[], nameOf: (memberId: string) => string) => {
  const tags = new Map<string, PlayingTag>();
  const lines = new Map<string, string>();
  for (const game of games) {
    tags.set(game.a, { tag: playingTag(game.kind, nameOf(game.b)), icon: gameIcon(game.kind), with: game.b });
    tags.set(game.b, { tag: playingTag(game.kind, nameOf(game.a)), icon: gameIcon(game.kind), with: game.a });
    lines.set(game.a, playingLine(game.kind));
    lines.set(game.b, playingLine(game.kind));
  }
  return { tags, lines };
};

type GameResult = { winner: Winner; why: "played" | "timeout" | "left" | "gaveUp" | "abandoned" };

export const resultWords = (result: GameResult, side: Side, opponentName: string) => {
  const won = result.winner === side;
  const title = result.winner === "draw" ? "Draw" : won ? "You win" : `${opponentName} wins`;
  const loser = won ? opponentName : "You";
  const detail =
    result.why === "abandoned"
      ? "You both left."
      : result.why === "timeout"
        ? `${loser} ran out of time.`
        : result.why === "left"
          ? `${loser} left the Café.`
          : result.why === "gaveUp"
            ? `${loser} gave up.`
            : null;
  return { title, detail, won: result.winner !== "draw" && won };
};

export const LOW_TIME_MS = 10_000;

export const lowTimeDelay = (endsAt: number, now: number) => Math.max(0, endsAt - now - LOW_TIME_MS);

export const lowTimeLevel = (endsAt: number, now: number) => Math.min(1, Math.max(0, 1 - (endsAt - now) / LOW_TIME_MS));

export type TurnMark = { mine: boolean; endsAt: number };

export const turnStarts = (before: TurnMark | null, now: TurnMark) =>
  now.mine && (before === null || !before.mine || before.endsAt !== now.endsAt);

export const turnEdge = (game: { result?: unknown; board: { turn: Side } }, side: Side): "mine" | "theirs" | "none" =>
  game.result !== undefined ? "none" : game.board.turn === side ? "mine" : "theirs";

export const freshSay = (say: { text: string; at: number } | undefined, now: number, bubbleMs: number) =>
  say !== undefined && now - say.at < bubbleMs ? say.text : null;

export const turnWords = (turn: Side, side: Side, opponentName: string) => (turn === side ? "Your turn" : `${opponentName}'s turn`);

export const secondsLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000));

export const rematchWords = (rematch: Side | undefined, side: Side, opponentName: string) =>
  rematch === undefined ? null : rematch === side ? `Waiting for ${opponentName}` : `${opponentName} wants a rematch`;
