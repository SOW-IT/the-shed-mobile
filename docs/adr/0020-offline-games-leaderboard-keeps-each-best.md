# Offline games: one best per person, published from a phone queue

Daniel asked (2026-11-22) for three endless mini-games that work without a
connection, opened from the offline state and from three taps on the version
at the foot of Profile, and then for a leaderboard per game: scores saved on
the phone while offline and published once it is back online, without
duplicates on a retry.

What we weighed:

- **What the server keeps.** Every run would grow without bound and needs a
  "best per person" pass to read. We keep one `gameScores` row per person and
  game (`by_email_and_game`), holding their best run. Taking the higher of two
  scores gives the same answer however many times it's done, so a resent run
  can't duplicate anything. The cost: no run history and no play counts.
- **What the phone queues.** Because only the best counts, the queue holds at
  most the best unpublished run of each game, three entries at most. That
  keeps it well inside what SecureStore holds on iOS. Each run carries an id
  made on the phone (`runId`), kept across retries, and the server answers
  every run as accepted or rejected so the phone drops it either way.
- **Trust.** Scores come from the phone, so the server only checks them for
  sense: a whole number, under each game's cap, no more points than the run's
  length allows (`SCORE_LIMITS` in `shared/games.ts`), and an end time that
  isn't in the future or over a year old. It turns away a typo or a crude
  edit, not a determined cheat. Only signed-in people can publish, and the
  board is only shown to them, since it carries members' names.
- **Detecting offline.** The app has no network library, and adding one is a
  native change that waits for a store build. The connection that matters is
  the one to Convex, so `useOffline` watches the Convex client's connection
  state (down for four seconds), plus `navigator.onLine` on web. Signed in
  with no connection, the app used to wait on its loading screen for good; it
  now shows the offline screen with the games after the same four seconds.
- **Getting into the games offline.** The offline screen and the in-app
  offline pill open the games over the app rather than navigating to
  `/games`, because a web page that has lost its connection can't fetch a
  route it hasn't loaded yet.
