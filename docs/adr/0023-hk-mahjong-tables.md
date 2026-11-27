# Hong Kong Mahjong at two Café tables, on the 1v1 table pattern

Daniel asked (27 Nov 2026, t166u–t168u) for 4-player Hong Kong (Cantonese)
Mahjong in the online World's Café: two tables, humans plus bots, one hand
by default with "Play another round", 3 faan minimum and 10 faan cap
(configurable), SOW coins as points, a 5 second claim window, a bot taking
over anyone who walks away until they sit back down, a full-screen table
with each seat's own World character, and chat and emotes that work during
the game and show in the World.

## What it reuses from the 1v1 Café tables

The 1v1 games (`convex/cafeGames.ts`) set the pattern this follows:

- **Sitting is the way in.** A Café seat is a World seat (`SEATS.cafe`), and
  `world.sit` calls `cafeSat`. Mahjong seats are four more World seats per
  table (`mahjong-a-0`…`mahjong-b-3`), and `world.sit` calls `mahjongSat`,
  which takes the seat at the table, or refuses before the sit is written
  when someone (or a bot) has it.
- **Leaving is noticed where the World already notices it.** `cafeMoved`
  runs on every room change, join and removal; it now also tells the
  mahjong table. `world.move` (standing up) tells it too.
- **One small row per game for everyone, one heavy row for the players.**
  As `cafeGames` / `cafeBoards` split, `mahjongTables` holds the seats,
  host, settings and phase (read by everyone in the Café, so a tap on
  the table knows whether to sit, take over a bot or watch), and `mahjongHands`
  holds the wall and hands, read only by
  `mahjong.mine`, which hands each player their own tiles and nothing else.
- **Turns are timed by the scheduler, checked by a step counter.** Like
  `cafeGames.timeout` checks `moves`, every scheduled `mahjong.tick` carries
  the hand's `step` and does nothing if anything has happened since.
- **The rules are pure code in `shared/`.** As `shared/cafeGames.ts`'s
  `applyMove` is, the mahjong engine (`shared/mahjong/`) is pure functions
  the server runs and the tests cover; the phone only draws what the server
  says.
- **Chat and emotes are the World's own.** Players stay seated in the World
  during a hand, so `world.say` and `world.act` work unchanged, the chat bar
  stays on top of the table, and everyone in the Café sees the seated
  characters, their bubbles and emotes as usual.

## The game loop

```
              sit at an empty table
                       │  (first human is the host)
                       ▼
   ┌──────────────► LOBBY ◄───────────── someone's seat empties after a hand
   │   add/remove bots, settings,          (they left), or the hand was
   │   humans sit in empty seats           abandoned
   │                   │ host: Start (4 seats filled)
   │                   ▼
   │             COUNTDOWN  ── 3 s when everyone seated is ready, 10 s when
   │                   │       the host starts anyway; a seat emptying or
   │                   │       the host's Cancel stops it (startsAt)
   │                   ▼
   │                 DICE  ── dice pick the first dealer and the wall break
   │                   │ (timed, ~2.5 s)
   │                   ▼
   │              WALL SPLIT / DEAL  ── 4-4-4-1, flowers replaced, sorted
   │                   │ (timed, ~2.5 s)
   │                   ▼
   │     ┌────────► TURN  (seat to act holds 14: discard, self-draw win,
   │     │             │    concealed or promoted kong; 20 s, then the
   │     │             │    drawn tile is discarded for them)
   │     │             │ discard / promoted kong
   │     │             ▼
   │     │         CLAIM WINDOW (only when someone can claim; 10 s by
   │     │             │  default, 3 to 20 s;
   │     │             │  Hu > Pong/Kong > Chow, Hu goes to the first
   │     │             │  winner after the discarder)
   │     │ next seat   │
   │     │ draws, or   │ claimed: claimer's TURN (no draw, or a
   │     └─────────────┤  replacement draw after a kong)
   │                   │ win, or the wall runs out
   │                   ▼
   │               ROUND END / SCORING  ── faan list, coin transfers
   │                   │ every seated human taps "Play another round"
   └─────── (seat     ─┘──────────────► DICE (dealer stays on a dealer
            empty)                              win or a draw, else passes)
```

Bots act after a short pause (so the table can be followed) and never wait
on a timer. A human who stands up, leaves the Café or drops out of the World
mid-hand is played by a bot until they sit back down in their seat; coming
back to the Café puts them back in that table's room when it has space, and
seats them. When every human at a table is away, the hand pauses, and it is
abandoned (no coins move) if nobody comes back within two minutes.

## Joining mid-hand and watching (Daniel, 9:45am 27 Nov)

- The World draws only people at the tables, never bots, so a bot's seat
  looks free from outside. Sitting in it while a hand is running asks
  whether to replace the bot; yes hands over the bot's seat as it stands:
  its concealed tiles, melds, flowers, score and, when it's that seat's
  turn or a claim is open to it, the turn. Only a bot-held seat can be
  taken. A seat held for a human who walked away (a bot plays it for them)
  is never offered; `world.sit` refuses it.
- Tapping the table, or someone seated at it, during a hand opens it to
  watch: the same full-screen table, read-only, from `mahjong.watching`,
  which returns every seat's melds, flowers, discards and tile count but no
  concealed tiles and no wall.
- Before a hand starts, the lobby works as before: sit in a free seat.
  Seated people say they're ready (the lobby's `ready`, which the
  between-hands "Play another round" already used); bots and the host
  always are. The host can take someone off their seat (they get up from
  the stool), or start without them, which counts down 10 seconds instead
  of 3.
- While someone has walked away mid-hand, their seat shows the bot playing
  for them by the bot's name (`standIn` in the seat view), and their own
  again when they sit back down.

## Follow-ups (2.13.66)

- A host's rules are kept on their wallet (`worldWallets.mahjongSettings`)
  and used for the next table they open; the claim window defaults to 10 s
  and can be 3 to 20 s. If those rules play for coins the host can no
  longer cover, the table opens playing for points, with the rest of their
  rules.
- Taking someone off a seat names whom the host confirmed (`member`), so a
  confirmation can't take off someone who sat down in that seat since.
  Ready can't change once the countdown has started.
- The table's layout: A (the seat on your left) and C (on your right) run
  the full height of the table with their melds face up and their
  concealed tiles shown only as a count; B's and your discards sit between
  them in two rows; A's discards fill columns downward and C's upward,
  each starting at their own seat. Discards are as big as every pile still
  fits (never bigger than your hand's tiles), so they start big and shrink
  as the piles grow, and never grow back within a hand. On the web the
  table widens with the window (up to 1000 points).
- Nothing takes a row of its own that the board could use: the clock is a
  bar over the top of the chat log, the claim and win/kong chips float
  over your own discards (never the pile a claimed tile sits in), and your
  turn shows as a flashing glow on your tiles instead of a "Your turn" row.
- While the table is open it is full screen: it holds `useHideAppChrome`
  (the root layout then drops the sidebar and the drawer, whatever the
  route) and hides the status bar the way a game in play does
  (`FocusedStatusBar`), keeping to the safe area.
- Your hand is sized to the width (`tableLayout`): one row whenever all
  14 tiles fit at BIG_TILE (52) or more, else two rows of seven; tiles can
  grow to a tenth of the window's height (96 at most), and the table to
  1440 points wide. Another seat's plate, melds and discards all open the
  same popup (`Zoom`), kept above your own pile where the claim chips float.
- A claimed meld lays its claimed tile sideways toward the seat it came
  from (`meldOrder`): the giver's side on screen, for every seat.

## Coins

Coins live in `worldWallets.balance`, and every change writes a
`coinLedger` row. Settlement happens inside the mutation that ends the hand,
so it is one transaction: no client sends an amount, and a hand is settled
once (its state moves to "over" in the same write).

- **Points per faan** (HK "half-spicy" doubling table): 0→1, 1→2, 2→4, 3→8,
  4→16, 5→24, 6→32, 7→48, 8→64, 9→96, 10→128, … × the table's stake
  (coins per point, default 1).
- **Who pays.** Off a discard, the discarder pays the full value. A
  self-drawn win is paid half the value (rounded up) by each of the other
  three. A drawn hand moves nothing.
- **Nobody goes below zero.** A human pays at most their balance; the
  winner gets what was actually paid.
- **Bots play for the bank.** Coins a human pays a bot leave the economy;
  coins a bot pays a human come from the bank, at most
  `MAHJONG_BANK_DAILY_CAP` (200) a person per Sydney day, so playing three
  bots can't mint coins without limit. Bot-to-bot payments move nothing.
- Each transfer is a `coinLedger` row of kind `"mahjong"` (an additive
  literal), with the hand as its `runId`.
