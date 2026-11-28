import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { PLAYING_BEAT_MS, PLAYING_READ_LIMIT, PLAYING_SCAN, PLAYING_SHOWN, PLAYING_TTL_MS, SCORE_GAME_IDS } from "../shared/games";
import { withHeight } from "../shared/world";
import { gameIdValidator } from "./gameScoreData";
import { nameFor } from "./gameScores";
import { optionalEmail, requireEmail } from "./model";
import { loadBlockFilter } from "./world";
import { worldLookValidator } from "./worldData";

const removePlayer = async (ctx: MutationCtx, email: string) => {
  for (const row of await ctx.db.query("gamePlayers").withIndex("by_email", (q) => q.eq("email", email)).take(10)) {
    await ctx.db.delete("gamePlayers", row._id);
  }
  for (const beat of await ctx.db.query("gamePlayerBeats").withIndex("by_email", (q) => q.eq("email", email)).take(10)) {
    await ctx.db.delete("gamePlayerBeats", beat._id);
  }
};

const startBeat = async (ctx: MutationCtx, email: string, now: number) => {
  const beatId = await ctx.db.insert("gamePlayerBeats", { email, lastSeen: now });
  await ctx.scheduler.runAfter(PLAYING_TTL_MS, internal.gamePlayers.expire, { beatId });
};

/**
 * Marks the caller as playing `game`, on going in and then every
 * PLAYING_BEAT_MS while they're in it. Going into another game moves them;
 * a beat in the same game writes only the heartbeat, at most once a beat.
 */
export const playing = mutation({
  args: { game: gameIdValidator },
  returns: v.null(),
  handler: async (ctx, { game }) => {
    const email = await requireEmail(ctx);
    const now = Date.now();
    const row = await ctx.db.query("gamePlayers").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!row) await ctx.db.insert("gamePlayers", { email, game, name: await nameFor(ctx, email), since: now });
    // Switching game also picks up a name changed since they went in.
    else if (row.game !== game) await ctx.db.patch("gamePlayers", row._id, { game, since: now, name: await nameFor(ctx, email) });
    const beat = await ctx.db.query("gamePlayerBeats").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (!beat) await startBeat(ctx, email, now);
    // A little under a beat, so a phone's timer running early still counts.
    else if (now - beat.lastSeen >= PLAYING_BEAT_MS / 2) await ctx.db.patch("gamePlayerBeats", beat._id, { lastSeen: now });
    return null;
  },
});

/** The caller left `game`: off its row at once. Leaving a game they've since switched from does nothing. */
export const left = mutation({
  args: { game: gameIdValidator },
  returns: v.null(),
  handler: async (ctx, { game }) => {
    const email = await optionalEmail(ctx);
    if (!email) return null;
    const row = await ctx.db.query("gamePlayers").withIndex("by_email", (q) => q.eq("email", email)).first();
    if (row?.game === game) await removePlayer(ctx, email);
    return null;
  },
});

/**
 * Clears a player whose phone stopped beating (a crash, a phone put away).
 * Each heartbeat row runs one of these, again until it's gone quiet; a row
 * that's gone (they left) ends it.
 */
export const expire = internalMutation({
  args: { beatId: v.id("gamePlayerBeats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const beat = await ctx.db.get("gamePlayerBeats", beatId);
    if (!beat) return null;
    const now = Date.now();
    const quietFor = now - beat.lastSeen;
    if (quietFor < PLAYING_TTL_MS) {
      await ctx.scheduler.runAfter(PLAYING_TTL_MS - quietFor, internal.gamePlayers.expire, { beatId });
      return null;
    }
    await removePlayer(ctx, beat.email);
    return null;
  },
});

const playerValidator = v.object({ id: v.id("gamePlayers"), name: v.string(), look: v.union(v.null(), worldLookValidator) });

/**
 * Who else is playing each game right now, for the Games list: the first
 * few with their World look, and how many in all. Games nobody's playing
 * are left out, and so is anyone blocked in the World either way.
 */
export const nowPlaying = query({
  args: {},
  returns: v.array(
    v.object({ game: gameIdValidator, count: v.number(), more: v.boolean(), players: v.array(playerValidator) })
  ),
  handler: async (ctx) => {
    const email = await optionalEmail(ctx);
    if (!email) return [];
    const isBlocked = await loadBlockFilter(ctx, email);
    const result = [];
    for (const game of SCORE_GAME_IDS) {
      // Newest first, reading on past rows the viewer can't see, so a run of
      // them never hides someone older; bounded by PLAYING_READ_LIMIT.
      const others = [];
      let read = 0;
      let more = false;
      for await (const row of ctx.db
        .query("gamePlayers")
        .withIndex("by_game_and_since", (q) => q.eq("game", game))
        .order("desc")) {
        if (others.length >= PLAYING_SCAN || read >= PLAYING_READ_LIMIT) {
          more = true;
          break;
        }
        read++;
        if (row.email !== email && !(await isBlocked(row.email))) others.push(row);
      }
      if (others.length === 0) continue;
      const players: { id: Id<"gamePlayers">; name: string; look: typeof worldLookValidator.type | null }[] = [];
      for (const row of others.slice(0, PLAYING_SHOWN)) {
        const saved = await ctx.db.query("worldLooks").withIndex("by_email", (q) => q.eq("email", row.email)).unique();
        players.push({ id: row._id, name: row.name, look: saved ? withHeight(saved.look, row.email) : null });
      }
      result.push({ game, count: others.length, more, players });
    }
    return result;
  },
});
