# Changelog

All notable changes to **The SHED** mobile app. This project follows
[semantic versioning](https://semver.org/); the marketing version lives in
`app.json` and the build number auto-increments per EAS build.

## [Unreleased]

## [2.13.51] - 2026-11-27

### Fixed
- **The status bar is readable on a screen opened over a game.** After any
  game over, the card's Leaderboard button opened the Leaderboard with a
  white status bar on its cream page, so the time and battery all but
  disappeared. The same happened on any screen a link opened while a dark
  game (Mystic Man, Sky Shooter, Swoop at night) was open. Status bars stack,
  and the last one mounted wins: the game stayed mounted underneath, and its
  light bar (light on the game-over card since 2.13.21, #569) stayed on top.
  A game's status bar, and the Games list's, now only counts while its
  screen is in front. Found by the iOS sweep, where every screen after the
  games, signed in or out, had the white bar. A new
  `status-bar-after-game` iOS check takes screenshots of both cases (the
  Leaderboard after a game over, and Notifications opened over Mystic Man).

## [2.13.50] - 2026-11-27

### Added
- **Hong Kong mahjong at two tables in the online World's Café.** Sit at
  an empty table and you host it. Its lobby is the arcade's panel: four
  seats (East, South, West, North), Add bot and Remove for the host, the
  rules (the minimum faan to win, 0 for a chicken hand by default, or 1 or
  3; a 10 faan cap; 30 seconds a turn, from 10 to 60; 5 seconds to chow,
  pong or win, from 3 to 15; and a Play for SOW coins switch, off by
  default), and
  Start game once every seat has a person or a bot. The host passes to
  the next person seated if they get up before the start. The rules stay
  until the table empties and can only change between hands.
- **A full game of Hong Kong Old Style rules, played full screen.** 136
  tiles, no flowers or seasons. The dice pick the dealer and where the wall
  breaks, the tiles are dealt and sorted, and play passes round the table.
  You can win (食糊 or 自摸), kong (concealed, exposed, or onto your pong,
  which someone can rob), pong, or chow from the player on your left. A
  claim opens a bar above your hand (5 seconds unless the host changes
  it), with Pass, and a Chow
  button for each way to chow. The dealer keeps the deal only by winning.
  After the hand a breakdown lists the winning hand, each faan, the points
  and any coins, and "Play another round" deals again once everyone has
  asked.
- **A table laid out for a phone, with big traditional tiles.** Each
  player sits on their own side with their face, wind, dealer mark, score
  and clock, an orange back for each tile they hold and their melds; the
  players to the left and right run theirs down the sides. Every player's
  discards sit in front of them toward a small counter in the middle, the
  newest lit, in spaces that never move as discards pile up. Tap anyone's
  discards to see them big, even on your turn or with a claim waiting;
  your hand, clock and claim buttons stay usable below it. Tiles look like
  real ones (circle dots, bamboo
  sticks with a bird on the 1, blue numerals over a red 萬, blue winds, a
  red 中, a green 發, a framed white dragon, orange backs) with a small
  1 to 9, E S W N or C F P in the corner. Tap a tile to lift it and tap it
  again to discard, or slide it up to discard it straight away.
- **Options at the table**, kept on your device: a bigger hand in two rows
  (off by default) and the corner numbers and letters (on by default).
- **SOW coins, when the host switches them on.** Points turn into coins at
  8 points a coin, each payment rounded to the nearest coin (a half rounds
  up), so a hand worth very little moves no coins. Everyone needs the most
  one hand can cost them to sit, take over a bot or start, and is told why
  if they're short. Coins only ever move between people: a bot never pays
  or collects. The discarder pays a win off their tile in full; a
  self-drawn win is paid half each by the other people at the table.
  Nobody pays more than they have.
- **Leaving a hand asks first.** Getting up from the table mid-hand says a
  bot will play your seat until you sit back down, with Stay and Leave.
  When coins are on, leaving gives the hand up: the same question also says
  what it costs, what a minimum win off your discard would, shared between
  the other people at the table, and the bot plays your seat for the rest
  of the hand. In the lobby and after a hand, leaving doesn't ask. With
  coins on, walking off or closing the app and not coming back before the
  hand ends costs the same.
- **Chat, emotes, watching and joining mid-hand.** The room's chat shows in
  two lines at the top of the table and as bubbles above each player, and
  the World's chat bar and emotes stay at the bottom; typing floats the
  input over the table without moving it. Anyone in the Café can tap the
  table, or someone at it, to watch without seeing anyone's tiles, and a
  🀄 tag shows over people playing. Bots aren't drawn in the World, so
  their seats look free; sitting in one during a hand asks whether to take
  it over. If you get up or drop out mid-hand, a bot plays your seat until
  you sit back down, and the Café room keeps your table while you're away.

## [2.13.49] - 2026-11-27

### Changed
- **The character editor's preview zooms to the part each tab changes.**
  Before, the Face, Eyes, Brows and Mouth tabs all showed the same face
  close-up, and the Outfit and Extras tabs showed the whole body. Now the
  camera glides close on the eyes, the brows or the mouth, frames the outfit
  from the mouth down to the shoes, and the head down to the waist for the
  extras. The Face, Hair and Body tabs keep their framing (face, head, whole
  body). The close-ups face you; the outfit and extras shots turn slowly,
  like the whole body, so you see a backpack. Moving a part with its slider
  doesn't move the camera, so you still see the part move. Verify has a new
  check that screenshots the preview on every tab, on web and iOS.
- **Zoom the character editor's preview yourself.** Pinch the preview with
  two fingers, or drag the zoom slider on its right edge: from the whole
  character up to closer than the eyes' close-up. The slider follows a pinch.
  Zooming in keeps the part the tab is about in the middle; zooming all the
  way out shows the whole character. Changing tabs zooms back to that tab's
  own shot. A pinch doesn't turn the character. On the web the slider takes
  the arrow keys, Page Up and Down, Home and End, and a trackpad pinch (or
  ctrl and the scroll wheel) on the preview zooms too.

## [2.13.48] - 2026-11-27

### Added
- **Eight more eye shapes for your World character.** The Eyes tab now has
  16 shapes. The new ones are Cat (a white almond tipped up at the outer
  corner, round a slit pupil), Puppy (big and round under a drooping lid),
  Starry (a twinkle for a pupil), Hearts, Tiny, Anime (a tall white eye with
  a big iris and a heavy top lash), Wink (one eye closed in a smiling arc)
  and Sharp (a flat-topped half moon that slopes down to the nose). They take
  your eye colour, eye shadow and the eye sliders like the others, and
  smiles, surprise and the other expressions still change them. Saved
  characters keep their eyes. Someone on an older version of the app sees a
  new shape as plain dots until they update.

## [2.13.47] - 2026-11-27

### Fixed
- **The web sweep builds the World's screen before it starts timing
  screens.** Every failed CI sweep in the last 200 runs (5 on main,
  including the one after #579 merged, and 6 on PRs) was the
  leader's `/world` "still changing after 15s". Only a signed-in visit
  loads the World's screen, so the dev server first built it (13-17 s on
  CI) inside the leader's 15 s. #586 made that less likely. When the sweep
  includes `/world`, it now signs in and opens the World once before the
  first pass, in a browser context of its own that's closed after, with no
  clock running, so the leader's visit gets it already built and the
  signed-out pass still starts signed out. A signed-out screen that finds
  a session is now reported as broken. With the bundle
  allowance forced to zero on a cold dev server, main's sweep still fails
  there and this one passes. Nothing in the app changed.
- **Swoop's "a perfect run finishes every world" test no longer times
  out on CI.** All 30 worlds ran as one test, which took 172–230 s on CI
  against a 240 s limit and failed twice. It's now one test per world,
  each with a 60 s limit, checking the same three seeds.

## [2.13.46] - 2026-11-27

### Added
- **Sleeves, a tank top, five more outfits and more colours in the
  character editor.** Under Outfit there's a new Sleeves choice (none,
  short or long) for any top with sleeves. Tank tops, the sundress and the
  hoodie don't have one. Until someone picks, every top stays sleeveless as
  before. The new tops are a tank top, a sailor top, a sweater vest worn
  over a white shirt, a sundress, a jumpsuit and a Hawaiian shirt, in the
  style of Tomodachi Life, Miis and The Sims. The sundress and jumpsuit come
  with their own bottoms. There are 14 more top colours, 8 more bottoms
  colours and 6 more favourite colours. The top, bottoms and favourite
  colour rows each end in an "any colour" swatch, which opens a picker
  under the row: hue, strength and lightness sliders, and a box for a hex
  code. Older looks draw as before. An app from before this update draws a
  new top, colour or sleeves as its default. The saved look gets one new
  optional field, `sleeves`.

## [2.13.45] - 2026-11-27

### Changed
- **In the World, arms and feet now move with the head and body.** Walking,
  each arm swings forward with the opposite foot. Each foot lifts and steps
  forward, at its highest as the body bobs highest, so it never drops away
  from the body. Seen side on, the feet cross past each other. The stride
  grows in over 120 ms when someone sets off and fades out when they stop,
  so the limbs never snap into place. Standing still, everyone breathes and
  sways a little and their arms follow a beat behind, while their feet stay
  planted. Seated people sway too. Swimming and emotes keep their own arm
  movements. The idle sway keeps the World's clock running at the gentle
  15 frames a second already used for swimmers. It is off on battery saver
  (or with the system's Reduce Motion) and while the World is in the
  background. The Runner game's two running frames now show arms and feet
  mid-stride.

## [2.13.44] - 2026-11-27

### Fixed
- **The hoodie is one hoodie from every side, and it turns with the body.**
  The hood was three separate shapes that took turns: a head-sized ball
  behind the head when facing the camera, a second lump at a fixed spot
  side-on, and a smaller drape over the back when facing away. They were
  different sizes in different places, so at some angles two or three
  showed at once and the hood jumped as someone turned. The hood's edge,
  the drawstrings and the pocket were drawn flat at the front whichever way
  the person faced. Now the hood is one pouch on the upper back that
  slides round as the body turns (like the backpack), and the edge round
  the neck, the drawstrings and the pocket sit on the body like the
  collared shirt's and the jacket's pieces: they turn with it, and hide
  from behind. It leans, bobs and stretches with the body, not the head.

## [2.13.43] - 2026-11-27

### Fixed
- **Walking away from the arcade closes its games list as you set off.**
  Since 2.13.37 the list closed once you were out of the arcade's reach,
  about a second after the tap: 1.5 steps of walking (0.7s) plus a check
  every 150ms. It now closes the moment your walk heads out of reach, from
  the tap itself. A step that ends within reach, to one side of the
  arcade, still keeps it open, and a list opened from a link elsewhere
  still stays until you've been to the arcade and left. A walk already
  under way that passes the arcade closes it once you're out of reach, as
  before. Verify's arcade check now times the close from the tap.

## [2.13.42] - 2026-11-27

### Changed
- **Café Games asks "Are you sure you want to leave?" before you go back.**
  Two players sharing a phone could lose a game of Four in a Row to one
  stray tap on the back arrow. Every way back out of Café Games now asks
  first, with Leave and Stay, in all four games and in the picker, during a
  game and after it: the back arrow, the swipe back from the left edge on
  iOS, the browser's back button, and Escape on web. During a game the
  dialog adds "This game ends if you leave." Stay keeps everything as it
  was. Leave goes back one step, as the back arrow always has: from a game
  to the picker, and from the picker to the Games list. Offline, Escape
  used to close the whole offline games window from inside a Café game;
  now it asks too, and while the question is up Escape answers Stay. On the
  Café Games page, reloading or closing the browser tab now gets the
  browser's own leave-page prompt. The online Café tables in the World
  aren't changed.

## [2.13.41] - 2026-11-27

### Changed
- **Home is hidden for now.** It's gone from the bottom tabs and from the
  sidebar on wide screens, for everyone. Signed out, the app opens on People.
  Signed in, it opens where it did before: People if you don't have a staff
  role, Attendance for campus leaders, and Reimbursements for other staff.
  Anything that used to lead to Home goes to one of those screens instead.
  That covers the sign-out and Delete account landings, "Go home" on Page not
  found, Back when there's nowhere to go back to, the "Waiting on you"
  reminder email and notification, and old links to `/home`. While Home is
  hidden, its pages (Home, Resources, Connect, Partner), the contact form,
  "Waiting on you" and Edit Home can't be reached. Nothing is deleted, and
  setting `HOME_TAB_SHOWN` in `shared/homeContent.ts` back to true brings
  Home back.

## [2.13.40] - 2026-11-27

### Fixed
- **The web sweep should fail the signed-in leader's World much less
  often.** About one sweep in ten failed with "still changing after 15s" on
  the leader's `/world`, on main and on PRs alike. The app was fine. Signed
  out, the World shows a sign-in prompt and never loads its own screen, so
  the first signed-in visit is when the dev server builds it, which takes
  about 13 seconds on CI. The sweep doesn't count bundle builds against a
  screen's 15 seconds, but it had one two-minute allowance for the whole
  run, and the signed-out pass had used it up. The build then counted as
  the World changing. Each pass (signed out, then each role) now gets its
  own allowance. Nothing in the app changed. This makes the failure less
  likely rather than impossible: on CI the leader pass spends an estimated
  65 seconds of its two minutes on page loads before it reaches the World,
  and 13 more building it, so a much slower run could still run out. One CI sweep has passed with
  the change; that isn't enough runs to show the failure is gone.

## [2.13.39] - 2026-11-27

### Fixed
- **Verify's arcade check closes the Arcade before the next check runs, for
  contributors.** The iOS simulator check `arcade-podium` ended with the
  World's Arcade panel still open, so `chapel-pews`, which runs next when a
  branch touches both the games and the World, could start under that panel
  and fail. The check now taps the panel's close button at the end and waits
  until only the World is showing. Nothing in the app changes.

## [2.13.38] - 2026-11-27

### Changed
- **Running out of time in Dots and Boxes draws a line for you.** When a
  player's 60 seconds run out, the server draws a random line that nobody
  has drawn yet, for them. It counts like any other line: a box it closes
  is theirs and they go again, and otherwise it's the other player's turn
  with a fresh 60 seconds. It happens on the server, so it still works if
  their phone is late, in the background or gone, and both players see the
  same board. Running out of time no longer skips the turn or loses a Dots
  and Boxes game; the game ends when the last line is drawn, as usual. The
  other Café games still pass the turn, and lose on a second miss in a row.

## [2.13.37] - 2026-11-27

### Changed
- **Walking away from the arcade closes its games.** With the arcade's games
  list open in the World, stepping a couple of steps away from the arcade
  (or being moved away) now closes the list, so it doesn't stay on screen
  once you've left. Walk back and tap the arcade to open it again. Opened
  from a link somewhere else in the Garden, the list stays until you've been
  to the arcade and walked off.

## [2.13.36] - 2026-11-27

### Fixed
- **The scissors paper rock check in verify works again.** It failed on
  main (a 60-second timeout) and blocked every PR that touches the World.
  The app was fine; the check was wrong. The World opens where you last
  were, and the Chapel check before it leaves the admin in the Chapel, so
  the staff member arrived in a different place and never showed up. The
  check then took the connection indicator, whose label keeps changing, for
  the new arrival and tapped it. Both players now walk to the Garden first,
  the check finds the staff member by the name the World shows for them,
  and it also checks that the ✊ button sits level with "Not now" and saves
  each player's screen if something goes wrong.

## [2.13.33] - 2026-11-27

### Fixed
- **The People list, its In the app list and the arcade agree on who's
  playing what.** Going from one game to another through the leaderboard
  used to leave the People list on the first game while the arcade showed
  the new one, and someone playing outside the World showed only "In the
  app". All three now read the game a player's phone reports from the game
  itself, so they show the same game, follow a switch straight away, and
  show nothing once the player leaves. People in another place show their
  game under Elsewhere too.

## [2.13.31] - 2026-11-27

### Changed
- **The World's chat reaches your backyard, both ways.** What you say in a
  backyard now goes to everyone in the World, as in any other place, and
  shows to them tagged [Backyard] (not whose backyard). You already saw the
  World's chat there; now you can answer it. Lines said in a backyard used
  to stay in that backyard, which no one else could hear, even though the
  chat box says "Talk to everyone in the World". Home is unchanged: what's
  said at home stays in that home, and so do who came into a backyard and
  anything said there before this update.
- **Your backyard lines are still there after you leave and come back.**
  An empty backyard closes when you leave, so your earlier lines used to
  vanish with it. They now stay in the chat for the hour, like the rest.

## [2.13.30] - 2026-11-27

### Changed
- **Scissors, paper, rock, in that order.** The duel's pick buttons now run
  Scissors, Paper, Rock, the same order as the chant, and the game is called
  "Scissors paper rock" on the person card, the ask and what VoiceOver reads.
- **Accepting a scissors paper rock ask is a ✊ button.** The yes button on
  the ask card was too narrow for "Rock paper scissors!". It now shows the
  game's ✊, and VoiceOver still reads "Accept scissors paper rock with" and
  their name. High five keeps its words.

## [2.13.28] - 2026-11-26

### Fixed
- **Returning to the World after backgrounding no longer rubber-bands or empties the room.** Replies that sat queued while offline or paused no longer skew the World clock ahead, the first frame after resuming draws at the current time instead of snapping from where everyone stood before, and coming back after a long background recovers cleanly in a single rejoin without flashing everyone away or dropping an immediate tap.

## [2.13.27] - 2026-11-26

### Added
- **Hold a finger on a Café board to see where your move will go.** In
  all four Café games your move now lands where you let go, not where you
  first touch. While your finger is down, the board shows exactly what
  you'd place and follows you as you drag: in Dots and Boxes the stick
  nearest your finger, see-through in your colour; in Five in a Row the
  whole row and column through the point, with a see-through stone on it;
  in Four in a Row the column, with a see-through piece where it would
  land; in Tic-tac-toe the square, with a faint mark. Let go off the board
  or on a taken spot and nothing is placed. A quick tap still plays
  straight away. On the web, the same preview follows the mouse and a
  click plays. This works in the World's Café and in two players on one
  phone.
- **Winning a Café game cheers, losing one cries.** When a Café game ends,
  the winner's character cheers and the loser's cries over their head,
  for everyone in the World to see, the same as scissors paper rock. A
  draw does neither.
- **Ask to visit someone's home when they're home.** In the World's People
  panel, anyone currently at their home has an enter-door button next to
  the invite button. Tapping it sends them a prompt to let you in, which
  invites you straight to their home.

### Changed
- **It's much more obvious when it's your turn in a Café game.** The game
  card turns your colour, with a glow around it, for as long as it's your
  turn, and "Your turn" is written in a stronger shade of your colour. The
  screen behind the card fills with your colour too, and flashes three
  times, brighter than before, when your turn starts. With reduce motion
  or battery saver on, the colours stay and the flashing doesn't.
- **If you ask for a rematch and the other player closes the game or
  leaves, your game closes too**, with a note saying they left, instead
  of waiting forever. If they leave before you ask, the Rematch button
  goes and the card says they left. This comes from the server, so it
  works even when their app was closed.

### Fixed
- **Feet on sideways seats now sit off to the side instead of dangling
  down over the armrest**, such as on the Library armchairs and side
  benches.

## [2.13.26] - 2026-11-26

### Added
- **Poke your devotional group.** Once you have finished today's devotional,
  tap **Poke group** on an active group to send a push and in-app notification
  to everyone in the group who hasn't done today's devotional yet. You can add
  an optional custom message (up to 160 characters) or leave it blank to send
  a default nudge. Tapping the notification opens today's devotional, and a
  group can be poked at most once an hour.

## [2.13.25] - 2026-11-26

### Changed
- **Devotionals save as you go.** The Save button is gone. What you type is
  kept on your phone half a second after you stop typing, and saved to your
  account when you go back, or when you switch away from the app. If you are
  offline it stays on your phone and is saved the next time you open that
  day. Typing no longer makes the header flicker or calls the server on
  every keystroke.

## [2.13.24] - 2026-11-26

### Changed
- **Mouths talk for as long as the line takes to say, not the whole bubble.** In the World a one-word "hi" talks for a quarter of the time its bubble is up, longer lines talk for longer, and only a long line talks until the bubble goes. The mouth always finishes closed.

### Fixed
- **Outfits now wrap around the body cleanly from every angle.** Overalls keep their front bib and crossed back braces in place as you turn; collared shirts show a full neckband, shifting collar points and front buttons; open jackets and flannels shift their inner tee and lapels to the facing side while keeping full plaid across the back; jumpers show neckline ribbing from every heading; polka dots and tie-dye prints wrap all the way around the torso with edge foreshortening and hide the tank scoop from behind.
- **Hats now match from the front, both sides, behind and seated on a Chapel pew.** Caps keep their top button visible when facing away; beanies wrap with a 3D cuff rim and tilted pompom; flower crowns form a full ring around the head; berets flip their tilt and stalk cleanly across turns; bows move around the crown and tuck behind on the far side; headbands curve flush around the head from every angle; royal crowns show five depth-sorted tines with a front jewel that hides from behind.
- **Accessories and glasses now follow head and body turns.** All five glasses styles foreshorten their lenses side-on, align the bridge between inner rims and add 3D temple arms that hook behind the ears; backpacks narrow side-on, sit flush behind the torso with wrapping straps and show a back pocket from behind; scarves keep a full wrap with a tail that moves behind on turns; bow ties shift to the facing edge and hide from behind; pearl necklaces wrap all the way around the neck with a front pendant; ear flowers stay on the left ear and hide behind the head when turned away.
- **Hair styles now read consistently from every side and from behind.** Long hair, bobs, mullets and wavy hair flow smoothly down the back of the head without a harsh outline seam, and wavy hair keeps its hem curls tucked along the back edge; ponytails, buns, space buns, pigtails, curls, mohawks, spikes and side braids project in 3D with proper front/back layering; side-swept fringes and parted curtains foreshorten and hide smoothly when facing away.

## [2.13.23] - 2026-11-26

### Added
- **A Go back button on every game-over card.** When a run ends in Sky
  Shooter, Mystic Man, Flap or Swoop, the card now has Go back under Play
  again and Leaderboard. It takes you straight back to the Games list, or to
  the arcade over the World if that's where you opened the game. Each game
  colours it its own way: night sky and laser blue in Sky Shooter, purple
  hills and gold in Mystic Man, a green pipe in Flap, and the bird's teal and
  cream in Swoop.

## [2.13.22] - 2026-11-26

### Added
- **The Library, a quiet room off the Garden.** Walk through the new pad on
  the Garden's left to bookshelves, a reading table with a green lamp, a
  globe and four armchairs by floor lamps. Sit in an armchair or at the
  table. Its only way out is back to the Garden.
- **Garden in the World's menu.** Next to Your home, the menu now takes you
  straight back to the Garden from anywhere.
- **People at their own home show in the online list.** Someone in their
  home or backyard is listed under Elsewhere as "At home", like anyone in
  another place, without saying whose home or what they are doing there.

### Changed
- **New ways between places.** The Garden leads to the Beach, the Café
  (where the Campfire pad was), the Chapel and the Library. The Café leads
  to the Garden and the Campfire, the Chapel to the Garden and the
  Campfire, the Campfire to the Chapel and the Café, and the Beach only back
  to the Garden. Every exit goes both ways, and the server now refuses a
  trip between places with no pad between them; the Garden and your home
  are the only jumps.
- **Sitting on a pew faces the front of the Chapel again**, the back of your
  head to the camera, for you and everyone watching, and **asks whether to
  open your devotionals**, as it did before 2.13.17.
- **Mouths move for as long as the chat bubble is up**, and stop closed the
  moment it goes. A new line keeps them talking until its own bubble ends.
- **Farm status cards show for 3 seconds**, go away when you tap somewhere
  else, and start again when you tap the same thing.
- **New wallets start with 100 coins**, up from 50.

### Removed
- **Going to a friend from the People list.** The Elsewhere rows no longer
  take you to where someone is; you can still invite them to your home.
- **The coins panel's shortcut to your backyard.** It still explains how to
  farm for coins; you walk there through your home.

### Fixed
- **The hoodie looks like a hoodie, and its hood no longer sits in front of
  the shoulders.** From the front the hood shows behind the head with a rim
  at the neck, two drawstrings and a pocket; from the side it curves behind
  the head and neck; from behind, and sitting on a pew, it lies on the upper
  back.
- **A tapped hen, cow, coop, barn or plant's card no longer hides under the
  chat log.** The card keeps below the log however many lines it shows, on
  small phones too.

## [2.13.21] - 2026-11-26

### Changed
- **The arcade games are v2, and they never stop getting harder.** Each
  game's leaderboard has a v2 board, shown first, and the old one stays
  readable as **v1 (legacy)** behind a toggle on the leaderboard. Older
  app versions keep playing v1 and posting to the v1 boards until they
  update. Your best on the Games list and the game-over card is your v2
  best.
- **A v2 board pays its top 3** (50, 25 and 10 coins) once 10 people have
  a score on it. The 10th score pays whoever is top 3 at that moment;
  after that, places pay as before. The v1 boards pay as they always did.
- **Mystic Man.** A new orange bar from 5,000: duck under it or jump it,
  longer than the yellow beam, with dark stripes. From 5,000 every
  obstacle comes in more sizes, wider apart the further you go. Past
  20,000 the speed keeps rising, chains get longer and tighter, the
  breaks between them shrink, and new runs of obstacles join: a weave at
  25,000, triple rocks at 30,000, then a staircase, a switchback, a
  tunnel and a gauntlet by 100,000. Two vines in a row from 10,000 and a
  rock step from 15,000.
- **Flap.** A point for each pipe, and nothing for time. Pipes come at a
  steady rhythm. The opening starts at 190 and narrows to 140 by pipe 100,
  then more slowly to 130 by pipe 200, where it stays just wide enough for
  a flap. Speed rises from 150 to 200 by pipe 100, then by 10 every 100
  pipes (210 at pipe 200). The sky drifts from afternoon through sunset to
  night by pipe 200 and stays dark, with the ground and clouds darkening
  along with it. The board stays phone-shaped: on an iPad or a wide window
  it gets black side borders instead of growing wider.
- **Sky Shooter.** You can now drag the plane all the way to the top of
  the screen, and enemies wait half a second on screen before firing. The
  plane upgrades to double shot at 3,000, double + diagonal cone at 6,000,
  triple + diagonal cone at 10,000, and all-around 360° fire at 15,000.
  Enemies ramp harder and harder as your score climbs toward 10,000 and
  beyond: spawning faster, shooting faster, unlocking big-enemy patterns
  earlier, gaining more health, bringing faster golden enemies from 6,000
  that fire a 3-shot spread (while basic enemies stay single-shot), and
  spawning giant, slow enemies from 10,000 that shoot 360° rings all
  around them. From 75 seconds a new wave every 30 seconds keeps pushing
  enemy count, speed and patterns even further.
- **Swoop** counts days, not worlds. Day 1 lasts 30 seconds and each day
  is a little shorter, down to 15 seconds from day 20. The bird starts
  faster and builds much more speed purely from good swoops down steeper
  hills. The first two days have narrower, steeper hills to launch from.
  From day 3 the ground gets harder by the same step every day, with no
  end: deeper, steeper hills, a smaller angle for a perfect landing,
  shorter flat ground, ground that rises and falls across the day, and new
  shapes through day 8: double humps, cliffs, deep gorges, uneven valleys,
  long drops, tall walls and the odd jagged climb. A clean run just makes
  it and a few mistakes don't.

### Fixed
- **Swoop's background hills no longer jump**, and the view no longer
  breathes in and out over every hill: the zoom eases towards a steadier
  target and holds after a big flight. The camera zooms out as far as
  needed so the bird, the ground below it and the lowest valley ahead on
  screen always stay in view, zooms back in when the bird slows down, and
  scales the bird proportionally with the hills.
- **The leaderboard podium shows everyone as their full Garden person**
  standing directly on top of their podium step and cheering (with a
  grounded shadow, their name above them, and their rank and score on the
  step), including people who haven't customized their World character yet.
- **Game over dims the whole screen**, the bands by the notch and the home
  bar too, and Sky Shooter and Mystic Man show a light clock on their dark
  screens.

## [2.13.20] - 2026-11-26

### Changed
- **NPC name tags wear their own colour in the World.** Sijin Y. and
  Josh K. now show warm gold name pills so you can tell NPCs apart from
  other players at a glance.
- **Backyard crops and animals reset at midnight Sydney time.** Planting a
  crop or buying an animal covers the rest of that day plus the following
  Sydney day (for example, planting lettuce at 11:58 pm waits 2 minutes
  plus 24 hours; planting at 10:00 pm waits 2 hours plus 24 hours). Every
  watering and feeding cycle after that resets at 12:00 am Sydney time, so
  tending a plant or animal at 11:59 pm lets you tend it again after
  midnight and then wait until the following midnight.
- **Plant and animal status cards are styled farm cards, not plain text
  boxes.** Tapping a plot or animal now shows its crop or animal artwork,
  a colour-coded status pill (Ready, Needs water, Growing, Wilted, Died,
  Fed, Hungry, Frail, Egg/Milk ready), a growth progress bar, and a
  pointer down to the plot or pen.
- **World chat messages are capped at 100 characters**, with a remaining
  count shown in the chat bar once you are within 20 characters of the
  limit.

### Fixed
- **Chat bubbles no longer stretch too wide when someone talks.** Speech
  bubbles over characters now wrap long or unbroken words cleanly inside a
  tighter width and clamp inside the screen edges, and the chat log wraps
  long unbroken strings without pushing wide on web.

## [2.13.19] - 2026-11-26

### Added
- **A podium for each leaderboard's top three.** Above the scores, 1st
  stands in the middle on the highest step, 2nd on the left and 3rd on the
  right, each as their World character cheering with their arms up and a
  few sparkles (still with Reduce Motion on). Names follow your World Names
  setting, with each person's score under it. Someone with no World
  character shows their initial, and a face that's still loading is blank.
  Equal scores stand level; with one or two people the other steps stand
  empty, and nothing shows before anyone has a score.
- **The Games list shows who's playing each game right now.** A game's row
  shows the faces of the people in it (their World look), with "Anna B. and
  Ben C. are playing", and past three people a count ("… and 4 others").
  It counts everyone in a game, not only people in the World, and updates
  live, in the arcade over the World and on the Games screen. You show up
  while a game is in front of you; leaving it, opening its leaderboard or
  putting your phone away takes you off, and someone whose app closed
  without saying so drops off within a minute. People you've blocked in the
  World, or who've blocked you, don't show, and names follow your World
  Names setting (initials, first name and last initial, or full name).

### Changed
- **No "On this device" line above a leaderboard.** Your best already
  shows on the Games list beside each game, and a score waiting to go up is
  noted there too, so the leaderboard starts with the podium. The
  "Sign in and your scores go on the leaderboard" note stays when you're
  signed out.
- **The World carries on behind the arcade.** The arcade's panel no longer
  dims the World or closes when you tap beside it: you can still walk, chat
  and tap people while it's open. Close it with ✕; opening another panel or
  going to another place closes it too. Picking a game goes into it full
  screen, and leaving the
  game, or pressing Play on a leaderboard you opened from there, brings you
  back to the World. The leaderboard opens from the panel's trophy, and the
  panel is still there when you come back. Your coins show in the panel on
  a narrow phone, where it covers the World's coin chip. On a phone the
  panel is solid, so the World's labels don't show through its text,
  and the chat log steps aside while it's open (lines still show over
  people's heads).
- **The Games list shows your coins and looks like the World.** Your coin
  balance sits next to the Leaderboard button, in the same coin chip as the
  World's, while you're signed in and online. The list wears the World's
  look: its cream chips along the top, and the games in a dark glass panel
  like the World's menus, over the garden's sky and lawn, the same in light
  and dark mode. The World row says who's online under its line.

## [2.13.18] - 2026-11-26

### Added
- **Chickens and cows in the backyard.** A chicken coop (50 coins, 4 hens)
  and a cow barn (80 coins, 2 cows) stand behind the plots, each with a pen.
  Before you buy one its spot is a fenced patch with a price tag; tap it for
  the offer, from anywhere in your backyard. Tap a bought coop or barn to buy
  a chick (24) or a calf (55) and name it, and to rename an animal with a
  name tag.
- **Feeding.** Each day after buying needs one feed, any time that day.
  Tap a hungry animal (it shows an empty bowl) to walk over and feed it one
  grain or hay from your Bag. Unfed today it's hungry, slower and makes no
  egg or milk; unfed two days in a row it's frail, grey and still; on the
  third it wanders off for good. Feeding resets the count. Visitors can feed your animals with their own
  feed, and the animal shows who fed it that day.
- **Growing and producing.** Chicks grow into pullets and hens over 4 fed
  days, calves into young cows and cows over 5; an unfed day pauses growth.
  A grown, fed hen lays an egg and a cow has a bottle of milk each day. One
  waits per animal until you tap to collect it, and it never spoils.
- **Josh Kim's farm shop in the Garden.** Josh, by the flower bed, sells
  seeds, grain and hay (+1 or +5) and name tags, and buys crops, eggs and
  milk, with Sell all. Plot, coop and barn offers come from him too. Sijin in
  the Café sells furniture and wallpaper only.
- **Names over the animals,** with who fed them, and the hungry bowl, nest
  egg or milk bottle above.
- **Farm reminders** at 6 pm now also count hungry animals, eggs to collect
  and cows to milk, still in one push a day.
- **Farming in How to get coins,** each row taking you to your backyard.
- **A tie-dye tank top and clear glasses** in the character editor.

### Changed
- **The plots moved down** to make room for the coop and the barn.

## [2.13.17] - 2026-11-26

### Changed
- **Sitting on a Chapel pew shows your face.** Pews face away from the
  camera, so the 30 degree turn other seats get still showed the back of
  your head. Pews now turn you 120 degrees, toward the aisle, to the same
  three-quarter view as a café stool. Everyone in the room sees the same.
- **Sitting on a pew no longer asks about Devotionals.**
- **Tapping the lectern takes you behind it, facing the pews.** You walk
  round to the far side and turn to face the room, the way whoever leads
  would, and everyone watching sees you face the same way. Tap the
  lectern again while you're standing there to open Devotionals.

## [2.13.16] - 2026-11-26

### Added
- **In the app, on the World's People list.** Between the people in the
  World and "Not here right now", a new list shows who has The SHED open
  on any other screen, with Poke and Invite like the offline list. It
  shows 10 at first, then "Show more", and hides when nobody is there.
  Walking into the World moves someone up to the World lists straight
  away; closing the app moves them down to "Not here right now", seen just
  now. Blocks work the same as everywhere else in the World.
- The app tells the server it's open once a minute while it's on screen,
  and stops when it goes to the background. People on older versions show
  in the World or under "Not here right now" as before.

## [2.13.15] - 2026-11-26

### Fixed
- **Sharp text at the top of the Café board and the World's panels.** On an
  iPhone with iOS 26, the system blurs whatever sits at the top edge of a
  scrolling area. On the Café board that was the game's name and Give up,
  smeared into a blur. The Café board, the Shop, Farm, People, Settings,
  Arcade and notice board panels, the character editor, the chat log, the
  decorating tray and the game-over card now keep their text sharp to the
  edge.

## [2.13.14] - 2026-11-25

### Added
- **Spectate a Café game.** Tap someone who's playing, in the Café or in
  People, and their card's **Play** button says **Spectate**. It opens their
  board as it happens, with both players, whose turn it is and the timer, and
  a **Watching** pill at the top. You can't move, and you can close it any
  time. When the game ends you see who won, with **Close** and no Rematch.
  The button goes back to **Play** once their game is over. Games on one
  phone can't be spectated.
- **See who's watching.** Players see a small eye with a count, such as
  "2 watching", at the top of the board.

### Changed
- **Your best is the same on every device.** The Best on the Games list, on
  each game's screen and on its game-over card is your own best for that
  game across all your devices, signed in. A higher best saved on this
  phone still counts and is published the usual way. Signed out or offline,
  it's this device's best as before.

### Fixed
- **Café board, after chatting.** What you say shows over the board's title
  in a solid bubble wide enough for a short sentence on one line, instead
  of a see-through one squeezed over your name. The highlight on a player's
  name goes when their turn ends, and the board lands on whole pixels when
  the keyboard closes.
- **Scroll the World chat during a Café game,** as a player or a spectator.

## [2.13.13] - 2026-11-25

### Fixed
- **Bottom buttons sit higher on pages opened from the World.** The
  Calendar from the notice board, the Praise List from the piano and other
  pages with no tab bar under them had their bottom buttons down by the
  iPhone's home bar. They now sit the same gap above it as they do above
  the tab bar elsewhere, and lists still scroll their last row clear of
  them. Forms opened from a page (a new event or design request, editing
  Home) get the same lift.

## [2.13.12] - 2026-11-25

### Added
- **A backyard farm in the World.** Every home has a back door to a
  backyard with 12 plots in a 3 by 4 grid. The front 4 are free; the rest
  cost 10, 20, 40, 80, 160, 320, 640 and 1280 coins, bought in order, and
  are the one thing you can buy from anywhere: tap a fenced plot for
  Sijin's offer. The first visit gives you 4 lettuce seeds.
- **Six crops.** Lettuce, carrot, strawberry, tomato, pumpkin and
  watermelon take 1 to 7 days. Seeds cost 3 to 60 coins at Sijin's new
  **Seeds** tab, and his **Sell** tab buys crops back for 4 to 80, or all
  at once with **Sell all**.
- **Watering.** Each day after planting needs one watering, any time that
  day. Tap a thirsty plant (it has a water drop) to walk over and water it.
  A day left dry wilts the plant: it loses a day of growing and a quarter
  of its price, and the third wilt kills it. Ripe crops wait, with no
  water. Visitors can water your plants, and the plot shows who did.
- **The Bag** in the World menu holds your seeds and crops, stacked by how
  often they wilted.
- **Farm reminders.** One push at 6 pm Sydney time when something needs
  water or is ready to harvest, at most once a day. Turn it off in World
  Settings.
- **Crops grow a little more every few hours**, with a new look each day:
  watermelon goes from sprout to vine, leaves, a yellow flower and a small
  striped melon to a big one; tomatoes flower, then go green, then red.
  Seeds look like each crop's real seeds. Planting pats a seed into the
  soil, watering tips a can over the plant and darkens the soil, and a
  harvest pops the crop up and into the Bag with a "+1" chip. With Reduce
  Motion or battery saver they change at once.

### Removed
- **The World's list view.** The World is always drawn now, also offline
  and with VoiceOver; the plots, the back door, Sijin and people have
  screen reader labels.

## [2.13.11] - 2026-11-25

### Fixed
- **The passage picker check passes on iPhone again.** The app was already closing the Book, Chapter and Verse pickers mid-scroll (fixed in 2.13.1); the repo's own iPhone check was wrong. Its tap outside the sheet landed on the status bar, which iOS keeps for itself, so it failed even with the list still. It now taps just below the status bar, and also checks a tap below the sheet and a swipe down on the title bar while the list is moving. Its Psalms step looked for a row named exactly "Psalms" when the row reads "Psalms, 150 chapters", so that part never ran before.

## [2.13.10] - 2026-11-25

### Changed
- **Each page's main button is back at the bottom.** Churches, Praise
  List, Reimbursements, Event Requests, Design Requests, Mentoring,
  Attendance and Grievances show their + button across the bottom of the
  page again, with the ⓘ beside it where the page has one, instead of left
  of the bell. Churches gets **+ Add church** there too. Page titles stay
  in the middle of the top bar, and Devotionals keeps **Today** up there.
  Who can use each button hasn't changed. Lists leave room at the end so
  the last row scrolls clear of the button, on phones and wide screens.

## [2.13.8] - 2026-11-25

### Added
- **See whose turn it is in a Café game.** When your turn starts, the edge of
  the screen pulses in your colour, then stays as a thin border until you
  move, and your phone gives a small tick. On their turn there's no border.
  In the last 10 seconds of your turn the sides of the screen glow amber,
  brighter as time runs out, and stop the moment you move. With battery
  saver or Reduce Motion on, the border and the glow hold still.
- **Chat during a Café game.** The board sits above the chat bar, so you
  can talk while you play. What each of you says shows over your name on
  the board, and when the keyboard opens the board moves up with it.
- **Café stats on a person's card.** A person's card (**More** when you tap
  them) shows their wins, losses and draws in each of the four games, and
  how the two of you have done against each other.
- **The chat log shades its edges** when there are lines above or below to
  scroll to.

### Changed
- **Text boxes move with the keyboard.** The World chat bar, sheets on
  iPhone and scrolling screens on Android now move with the keyboard as it
  opens and closes, instead of catching up after it.
- **The Café board's handle shows only on the end card,** where dragging it
  down closes the board. During a game there's no handle; use **Give up**.

### Fixed
- **A finished Café game stays closed.** Closing the result, or leaving the
  World after seeing it, no longer brings it back when you return from the
  arcade or open the World on another phone.

## [2.13.7] - 2026-11-25

### Fixed
- **Names that were only an email address now read as a name.** Someone with
  no staff profile this year, such as last year's staff, showed in the World
  and on game leaderboards as their email's "first.last". They now show as
  "First Last", so the World's tag reads "First L.". A real name from Google
  is kept as it is.

## [2.13.6] - 2026-11-25

### Changed
- **Mystic Man goes faster and chains obstacles after 10,000 points.** Up
  to 10,000 nothing changes. From there the top speed climbs from 1200 to
  1500 by 20,000 and then keeps creeping up towards 2000, never reaching it.
  Obstacles come in longer, tighter chains with less of a break between
  them, steeply up to 20,000 and a little more with every point after. Every
  chain is still clearable at the speed it comes at.
- **Swoop's worlds are narrower and rougher.** Worlds 1 and 2 are a quarter
  and a fifth narrower, and the hills close in until world 5, then stay
  that close. From world 3 the ground gets more uneven every world, with a
  big step at world 7 and again at 8: steeper faces, deeper drops, more
  cliffs and double humps, uneven valleys back to back and less flat ground
  to recover on. Worlds stop getting longer at world 7, and the day is long
  enough for good flying to finish every one. Finishing a world pays up to
  2,500 points, from world 10 on.
- **Flap gets less predictable as you score.** Pipes start evenly spaced,
  then come closer together and farther apart, and each gap sits farther
  from the last. Every gap can still be reached from the one before.
- **Every game shows the same distance ahead on every screen.** A tablet
  or computer draws the game bigger instead of showing more of what's
  coming, and a small phone draws it a little smaller. Phones and tablets
  are filled edge to edge; a screen of an unusual shape, like a wide
  computer window for Flap, gets plain black borders.
- **Each game's scene reaches the edges of the screen,** around the notch
  and the home bar too, instead of stopping at a plain strip.

### Fixed
- **Swoop's sun moves smoothly and never slides back** when good flying wins
  daylight back; it waits instead. The far hills drift slowly, as far-off
  hills should, and no longer jump when the camera zooms.
- **A swipe from the left edge no longer leaves the World in a browser,**
  the same as in the games. Leave from the World's menu.

## [2.13.5] - 2026-11-25

### Changed
- **Devotionals is a bottom tab.** It takes the place of the org chart,
  with the same book icon as before. The org chart is now **People** in
  the side menu, and links to it still open it. Signed out, People stays
  a tab.
- **Page titles sit in the top bar.** Churches, Praise List,
  Reimbursements, Event Requests, Design Requests, Mentoring, Insights,
  Announcements, Admin, Attendance and Grievances show their name in the
  middle of the top bar, like Devotionals. Each page's main button (Add,
  Request, Raise, Member, Event, Pairing, Mentor) is in the top bar too,
  left of the bell, instead of at the bottom of the page. Who can use it
  hasn't changed. On a wide screen the page shows its title and button
  itself.

### Fixed
- **Review items left open on merged PRs (#480 to #544).** A walk the
  system interrupts (a call, a system gesture) ends where your finger last
  was, not where it first went down. A poke link that reaches an open World
  closes the character editor and opens the poke list. On the web, a screen
  reader reads each note and each new ask once, not the countdown every
  second, and moving into a home doesn't read its old lines out. Travelling
  to the room you're in keeps the route you were walking. The character
  preview faces you again going from Hair to a face tab. A line said over an
  hour ago no longer comes back from the server. Local game bests save in
  order. A game's start card shrinks to fit a very short window instead of
  being cut off. Verify and pr-status tooling fixes.
- **Swipe the Café board down to close it.** Drag its handle or title down:
  on the end card it closes like Close, and during a game it asks
  **Give up?** first, so nobody loses a game by accident.

## [2.13.4] - 2026-11-25

### Added
- **A notice board on the Garden's left.** Opposite the Calendar board,
  a cork board shows your notifications and notices pinned up by admins.
  Tap it and you walk over and it opens: the admins' notices first, newest
  first, then your notifications, newest first, with new ones marked. Tap a
  notification to mark it read and open it, the same as from the bell; back
  brings you to the World. Admins pin a notice with **Pin a notice**, and
  can edit it or take it down from the board. In the list view it's the
  **Notice board** button.
- **The campfire burns.** Its flames flicker and smoke rises and drifts
  away. It holds still when the World is in the background, and with
  battery saver or Reduce Motion on.
- **The arcade opens over the World.** Walk to the cabinet and its games
  open in a panel like People and Settings, with the leaderboard at the
  top. Each game shows who in the World is playing it, such as "Kate R.
  and 2 others playing Flap", and People shows "Playing Flap" next to
  them.

### Changed
- **Tapping yourself walks there, like a tap on the ground.** Your Outfit
  and Emotes bubble is gone; tapping someone else still opens theirs.
  Emotes are on the flower in the chat bar.
- **The top-left menu has no trips.** Going to the Chapel, Campfire, Café
  or Beach from the menu is gone: walk to their pads in the World, or go
  with someone from People. **Outfit** sits above **Your home** and opens
  your character, and **Leave** is still at the bottom.
- **The place's name on its own.** The top-left button says "Garden",
  "Café", "Chapel", "Beach" and "Campfire", without "The".
- **No swiping out of the World.** You leave by tapping **Leave** in the
  top-left menu. Android's back and the browser's back ask first, as the
  list view's back arrow does. A touch at the left edge of the Garden on
  iPhone now walks like anywhere else.
- **Not here right now shows faces, most recently seen first.** In
  People, each person has their World character's face and when they were
  last seen, and the list is in that order, newest first; people who've
  never been seen come last, by name. It shows 10 at a time, and **Show
  more** brings the next 10.
- **Leaving a home takes you back where you came from.** Go to a home
  from the Café, say, and walking out the door or pressing back takes you
  back to the Café, not the Garden. The door's sign says where it leads,
  and it remembers after you leave the World and come back. With nowhere
  to go back to, it leads to the Garden.
- **Sitting shows your face.** On a chair, bench, log, pew or the couch
  you turn about 30 degrees toward the camera. Two people at a Café table
  still face each other.

### Fixed
- **Going through a pad puts you on the pad back, facing into the room.**
  Walk from the Café into the Chapel and you arrive on the Chapel's Café pad
  on its right, facing west into the Chapel; from the Garden you arrive on
  the Chapel's Garden pad at the front, facing in. The same goes for every
  pair of places with pads between them, both ways. Everyone else in the
  room sees you arrive in the same spot facing the same way. If someone is
  already standing on the pad, you arrive just beside it, still facing in.
  A pad at the front of a place, whose name sits above it, moves its name
  beside the pad while someone stands on it, so it doesn't sit on their
  name tag.
  Standing on the pad after you arrive doesn't send you back; any walk
  that ends on a pad, even a step across the one you arrived on, takes you
  through it. A home, a poke, an invite or opening the World arrive where they
  did before.
- **A hoodie's hood sits behind your head when you face the camera.** It
  used to cover your chin.

## [2.13.3] - 2026-11-25

### Added
- **Whoever was already in a game's top 3 is paid for it.** 2.12.49 paid a
  place only when a new best reached it, so the people already 1st, 2nd or
  3rd had nothing for their place. Within an hour of this release they're
  paid once: 50 coins for 1st, 25 for 2nd and 10 for 3rd on each game's
  leaderboard, with equal scores sharing a place as the leaderboard shows.
  Anyone 2.12.49 already paid on that leaderboard gets only what they're
  still owed, which is usually nothing.

### Changed
- **Leaderboards show the time of each best as well as the day**, in your
  own time zone, on the small line under the name: "24 Nov, 3:42 pm", or
  "24 Nov 2025, 3:42 pm" for an earlier year.

## [2.13.2] - 2026-11-25

### Added
- **Table games in the Café.** Play Four in a Row, Tic-tac-toe, Dots and Boxes or Five in a Row against someone else in the Café. Sit at the same table as someone and you both get a "Play them?" prompt with the four games; either of you picks one and the other says yes. Or tap anyone in the Café and choose **Play**. Challenges run out after 30 seconds, and saying no (or ignoring it) keeps the prompt away from that pair for five minutes.
- **The board opens over the World** with you and them on either side of "vs", whose turn it is and a one-minute timer for each move. Every game is one round. Counters drop, marks and stones pop in, lines draw along and the winning line lights up. Missing a turn passes it; missing two in a row loses. At the end you see who won, **Rematch** and **Close**. **Give up** ends a game early. Leaving the Café or the World for more than 20 seconds loses the game, so a short drop-out doesn't. Battery saver turns the motion off.
- **Everyone sees who's playing whom.** A tag like "Four in a Row vs Kate R." shows over both players (just the game's icon when they sit together), and People says "Playing Four in a Row".
- **Café records.** Each person's wins, losses and draws per game show on their card, for example "Four in a Row 5–2". Games pay no coins.
- **Café Games in Games, for two people on one phone.** The same four games, played offline with no timer: pass the phone between turns. Tap a name to change it; the phone remembers. Rematch lets the other player start. These games don't count towards records or coins.
- **A warm café tabletop look** for all of it, in light linen or dark walnut to match the app's theme.

## [2.13.1] - 2026-11-25

### Fixed
- **On iPhone a picker closes while its list is still moving.** After a
  flick through the devotional Book list, tapping the close button or
  outside the sheet did nothing until the list stopped. Now it closes
  straight away, in the Book, Chapter and Verse pickers and every other
  picker and sheet.

### Added
- **Swipe a sheet down to close it.** Drag a picker's or sheet's title bar
  down, or flick it, and it closes; let go early and it springs back. On
  iPhone, pulling a list down past its top closes it too.

## [2.13.0] - 2026-11-25

### Fixed
- **The World now draws on Android phones.** Android 10 and later show the
  Garden, the Chapel, the Campfire, the Café, the Beach and homes like an
  iPhone does, instead of only the list of who's here and what they said.
  Android can't show the slanted shapes the World is drawn from, so they
  were turned off in 2.12.12; each one is now drawn as flat pieces Android
  can show. Android 9 and older still get the list.
- **One person no longer fills the chat log with joins and leaves.** A
  dropped connection used to end the visit and start a new one, writing a
  "left" and a "joined" line each time. Now the visit carries on through a
  dropped connection, a "left" line waits a minute and isn't written if
  they come back in that time, and coming back within that minute writes
  no "joined" line. Moving between places still writes nothing.
- **On Android the field you're typing in stays above the keyboard**, on
  forms such as a grievance or an event request, in the devotional editor
  and in the World's chat bar. Before, the keyboard covered it.
- **The World's buttons and cards have their dark drop edge on Android**,
  like on an iPhone.

## [2.12.55] - 2026-11-25

### Fixed
- **Delete group works on iPhone.** Its confirmation used to open behind the group settings sheet, so nothing happened. It now shows on top, and deleting removes the group, its members and invites, and the invite and reminder notifications for it. Everyone's own devotionals stay. You go back to Groups, and the group drops off every member's list straight away; a member looking at it is taken back to Groups too.

### Changed
- **History is now Yours.**
- **Past groups.** Groups that have ended move to a **Past groups** list under your current and upcoming ones, 10 at a time with **Show more**.
- **Swipe between Yours and Groups.** Tapping the tabs still works. The tabs now run edge to edge like the other tabbed screens.
- **Devotionals and Today in the top bar.** The title sits in the top bar, and **Today** sits next to the bell.
- **Green ticks on Yours.** A day you chose a passage for turns green with a tick, like a day everyone finished in a group.
- **The Chapel opens Devotionals.** Sitting down or tapping the pulpit, then **Open**, takes you to Yours and Groups instead of straight into today. Back takes you to the World, and the open book shows over your character until then.

## [2.12.54] - 2026-11-25

### Added
- **Leaderboards show when each score was set**, under the name: "24 Nov"
  for this year, "24 Nov 2025" for an earlier one. It's the day of that
  person's best run, on every game's leaderboard.
- **A push when someone knocks you down the top 3.** If you're 1st, 2nd or
  3rd on a game's leaderboard and someone's new best passes you, you get one
  push, such as "Daniel Kim just beat you in Flap" with "You're now 3rd" or
  "You're out of the top 3". Tapping it opens that game's leaderboard. An
  equal score doesn't count as passing you.
- **One Names setting in the World.** Settings in the World's top-left
  menu has Names, shown with your own name: initials ("DK"), first name and
  last initial ("Daniel K.") or the full name ("Daniel Kim"). It covers
  everywhere the World shows a person: name tags, the chat log, the People
  list, a person's card, invites, asks and rock paper scissors. It replaces
  Chat names: if you had picked Initials there you get DK, First name gives
  Daniel K., and otherwise it starts at Daniel K. It's saved on this device
  and changes only what you see.

### Changed
- **Leaderboards show full names again**, such as "Daniel Kim", whatever the
  World's Names setting is. 2.12.47 had shortened them to "Daniel K.".
- **A high five in the World is quicker**, about 1.75 seconds instead of 2.6,
  with the same reach, slap and step back.

## [2.12.53] - 2026-11-25

### Changed
- **Swoop's bird is a little heavier, so it doesn't fly quite as high.**
  Off the same hill at the same speed it now climbs a little less, and
  comes back down a little sooner. Diving while you hold is a little
  stronger to match, so diving down a slope and letting go at the bottom
  still carries it over the next hill, and good flying gets through as many
  worlds before night. Perfect landings work as before.
- **In Swoop the hills stay on screen however high you fly.** The camera
  zooms out as the bird climbs, far enough to keep the ground under it in
  view, and back in as it comes down. Before, a high flight could leave
  only sky on screen.
- **Swoop's world progress is a bar right across the top**, under the score
  bar, and the world you're on sits next to Swoop's name.
- **Swoop's first worlds have much wider, gentler hills.** World 1's hills
  are about two and a half times as wide as before, and each world after it
  is a little narrower, back to the usual hills by world 6.
- **New hill shapes from world 3:** double humps, a steep drop into a long
  flat run-out, a long gentle ramp up to a sharp crest, flat-topped
  plateaus, and valleys much deeper or shallower than the rest. They're
  rare in world 3 and turn up more often in later worlds.

## [2.12.52] - 2026-11-25

### Changed
- **Devotional groups only see your days from the day you join.** Days before you accepted the invite don't show you to the group, and they count only the people who were in it then, so a day everyone did stays green. The owner counts from the group's start date, people already in a group are unchanged, and your own History still shows every day.

## [2.12.51] - 2026-11-25

### Added
- **Devotional groups.** Open the new **Groups** tab inside Devotionals to create a group with a name, start and end dates, and a sharing level (**Count only**, **Passage**, or **Everything**). Group owners can invite anyone with an account in THE SHED (with search), view pending invites, rename or edit the group, remove members, or delete the group. Invitees get a push notification and email with a link into the app to accept or decline, and only see the group name and owner until they accept.
- **Shared group progress calendar.** Inside a group, see today's progress at the top and browse a month-by-month calendar coloured from red to green by how many members completed each day (with a green highlight and check when everyone is done, and neutral styling for upcoming days). Tap any day in range to see who has and hasn't done it, along with passages, Notes, and Prayer up to each member's effective sharing level.
- **Personal sharing level.** Choose Count only, Passage, or Everything from the devotional editor or from group settings. It applies across all your groups, and others always see the lower of the group's setting and yours (defaulting to each group's level until you change it).
- **8 pm Sydney devotional reminders.** Members of an active group who haven't chosen a passage for today receive one push reminder at 8 pm Sydney time across both AEST and AEDT. Turn it off any time under **Devotional reminders** on your Profile or in group settings.

### Changed
- **Renamed "Prayer points" to "Prayer"** in the devotional editor and validation messages.
- **Clearer saving in the devotional editor.** "Saved" now pops up briefly and fades away, while an error stays on screen until you fix or dismiss it. Save is greyed out until you change the passage, Notes, Prayer or what you share with groups, and going back only saves when something changed. The sharing choice is saved with the rest of the day.

## [2.12.50] - 2026-11-25

### Changed
- **A devotional's passage is chosen from lists instead of typed.** Pick the
  book (search by name, or scroll the Old and New Testaments), then the
  chapter from that book's chapters, and if you like a first and last verse.
  A book with one chapter, like Jude, goes straight to its verses. Passages
  you saved before open in the lists as they were, and they're saved in the
  same form. "Type a reference instead" is still there for a passage the
  lists can't hold, like two passages or a range across chapters, and a saved
  one of those opens in the typed box.

## [2.12.49] - 2026-11-25

### Changed
- **Games pay coins only for a top-3 place on the leaderboard.** 1st pays 50
  coins, 2nd 25 and 3rd 10, on each game's leaderboard (Sky Shooter, Mystic
  Man, Flap, Swoop and any game added later). You're paid when a new best
  puts you in a place, and each place pays you once per game: climbing from
  3rd to 1st pays the 40 you haven't had yet, and being knocked off 1st and
  winning it back pays nothing more. Equal scores share a place, as the
  leaderboard shows. Scoring past a mark no longer pays (Swoop's marks from
  2.12.46 go too), and the 200-a-day limit is gone, since no game can pay
  anyone more than 50. Coins you already have stay. If a game's leaderboard
  is ever wiped, its places can be won again.
- **The game-over card says why you earned coins**, such as "2nd place on
  Flap: +25", and the coins card in the World lists what each place pays.

### Fixed
- **The coins chip on the game-over card shows up.** Since coins arrived in
  2.12.37 the server paid a run but the card never showed the chip, because
  it kept its first look (nothing paid yet) and missed the answer that came a
  moment later.

## [2.12.48] - 2026-11-25

### Fixed
- **Swoop's night is easier to read.** Once the sky turns dark, the
  phone's clock, signal and battery turn white instead of staying black
  on the navy sky.
- **The character picker no longer shows Sij as a plain person icon.**
  The faces are drawn by the World's character art, which loads after the
  app starts. Until it arrived, Sij (and your own character) showed the
  person icon that means "no World character", which on a slow first
  load could stay for several seconds. Now a blank face shows while it
  loads, and opening the Games menu starts loading the faces, so they're
  usually ready by the time a game's start card appears.

## [2.12.47] - 2026-11-25

### Changed
- **The World and the games show a first name and a last initial.** Where a
  name showed in full ("Daniel Kim"), it now reads "Daniel K." (a one-word
  name stays as it is): the people lists and sheets, chat log lines (with the
  "first name" style), the World list, action hints, the person sheet, duel
  prompts, invite cards and the game leaderboards. Name tags already did this.
  Your own still shows as "You" where it did.

### Fixed
- **The newer hats sit right on curly hair, an afro and a bun.**
  - With an afro, the bow, party hat and crown sit on top of it instead of
    sinking into it, and the beret squashes it so it puffs out at the sides.
  - With curly hair, the headband shows across the top instead of hiding
    under the curls.
  - A bun is tucked under a beret instead of poking out above it.

## [2.12.46] - 2026-11-24

### Added
- **A new game, Swoop.** Hold anywhere and the bird gets heavy and dives;
  let go and it's light again. Dive down into a valley, let go at the
  bottom, and the speed throws the bird off the next hill and high into the
  sky. Come down along a downslope for a perfect landing; come down onto
  the slope going up and you lose speed. Each world has to be finished
  before the sun sets across the top of the screen, or night falls and the
  run is over. Perfect landings and long flights win back a little
  daylight. Every world is longer, with steeper and bumpier hills, tighter
  valleys, a shorter day and less room for a perfect landing. The score is
  the distance flown plus bonuses, on one leaderboard for the whole run,
  and good runs earn coins like the other games. Play as your World
  character's head, Sij, or Swoop's own bird. It works offline, and on a
  phone held upright it turns sideways like Mystic Man.

## [2.12.45] - 2026-11-24

### Added
- **Walking around objects in the World.** Tapping across the Garden, Chapel, Campfire, Café, Beach or your home now routes around tables, fires, pews, the arcade, the notice board, the piano and the pulpit instead of walking straight through them, and everyone else in the room sees the same path.
- **Interactive object highlights.** Tapping a seat, the arcade, the notice board, the piano or the pulpit highlights it with a soft outline until you arrive and interact. Tapping somewhere else clears the highlight, and battery saver / reduced motion keeps it still and subtle.
- **Garden notice board and Chapel piano.** The Garden now has a calendar notice board that opens the Calendar, and the Chapel piano opens the Praise List. Going back returns you to your spot in the World without leaving it.
- **Daily devotionals.** Sitting in the Chapel or tapping the pulpit asks whether you want to open today's private daily devotional, and shows a small open-book icon over your head in the World while you're doing it. You can also open Devotionals from the side menu.
- **Devotionals screen and history.** Enter and validate Protestant canon Bible passage references (such as Psalm 23 or John 15:1-17) in a top passage container, with separate Notes and Prayer sections below. Changes save on your phone straight away and sync online when you press Save, go back, or come back online. If the same day was changed on another device in the meantime, you choose which version to keep instead of one silently replacing the other. Browse past devotionals in Month view (marked days) and Week view (passage references), paged by month, for today and earlier days only.

## [2.12.44] - 2026-11-24

### Changed
- **Flap stops speeding up before it gets impossible.** The pipes used to
  keep speeding up and the gaps kept narrowing until a minute in, which is
  about a score of 500, and by then the game was too fast to play. Now the
  speed and the gap follow your score and level off: the pipes start at the
  same speed, are a fifth faster by 250, and never go faster than a third
  above where they started (200 instead of 240). The narrowest gap is 150
  instead of 130. It's still harder at 500 than at the start, but a good run
  can keep going.

### Fixed
- **No sky under the ground in Flap.** On phones with a home bar, on iPads,
  in landscape and on wide browser windows, a light blue strip of sky showed
  below the ground or beside it. The ground now runs to the bottom and the
  sides of the screen.

## [2.12.43] - 2026-11-24

### Added
- **Play Mystic Man and Flap as yourself.** Mystic Man runs as your World
  character, and in Flap your character's head flaps through the gaps.
  The start card has three pictures to pick from: you, Sij from the Café,
  or the original Mystic Man or bird. Each game keeps its own pick on this
  phone, so it's still there next time. If you haven't made a World
  character yet, "You" plays the original.

### Fixed
- **The game-over card no longer looks blurred at the top.** On a phone
  held sideways the card was taller than the space for it, so it sat in a
  scrolling area pushed up against the top edge, where iPhones on iOS 26
  blur and fade whatever scrolls under it. On smaller screens the bottom
  button was cut off too. When the space is short, the card now lays out
  side by side (score on the left, Play again and Leaderboard on the
  right) and always fits, with nothing scrolling. The start card does the
  same.

## [2.12.42] - 2026-11-24

### Added
- **World settings.** The place menu has a Settings row (gear), and tapping
  the signal bars opens it too. Each choice is saved on this phone or
  browser:
  - Chat times: off by default.
  - Chat names: initials ("DK", the default) or first names ("Daniel").
  - Ping: shows the milliseconds next to the bars. Off by default.
  - Battery saver: draws at 30 frames a second, the walk marker and typing
    dots stand still, bubbles appear without the bounce, people standing in
    water stop paddling, the editor preview doesn't turn by itself, the
    coins card doesn't spin, and menus fade instead of sliding. Until you
    set it, it follows the phone's Reduce Motion.
  - Name tags: everyone, or only people near you. Anyone talking, typing,
    emoting or playing keeps their tag.
- **A Flannel outfit.** An open flannel shirt in your shirt colour with an
  orange plaid, over a black tee.
- **Sijin looks like Sijin.** Bald, with a short beard, a big grin and
  narrow smiling eyes, in the Flannel. The shop and anywhere else that draws
  him show the same look.
- **A Short beard** in the character editor: a close beard along the jaw
  with a moustache.
- **Pick your own background colour.** The circle behind your avatar in the
  People list and on invites can be one of ten colours, under Body in the
  editor. Everyone keeps today's mint until they pick one.
- **Tap your coins to see how to get more.** A card pops up with your
  balance and a spinning coin: the scores that earn 10 or 20 coins in Flap,
  Mystic Man and Sky Shooter, the 200 a day limit, and that Sijin in the
  Café sells furniture.
- **Mouths move when people talk.** Whoever says something opens and closes
  their mouth for a moment, longer for a longer line, on everyone's screen.
- **A beach ball.** Walk into it at the Beach, or tap it when you're close,
  and it rolls, slows down, bounces off the edges and can float out to sea.
  Everyone in the room sees it in the same place.
- **Rock paper scissors shows the picks.** At the reveal each player's
  bubble shows their ✊, ✋ or ✌️ instead of "Rock!".

### Fixed
- **Height shows.** The editor preview used to shrink taller characters to
  fit, so moving the Height slider changed nothing you could see. Now the
  tallest stands about 1.3 times the height of the shortest, in the editor
  and in the World. Anyone who never picked a height gets one from their email,
  so a crowd isn't all one size. Name tags, tap areas, seats, swimming and
  high fives follow each height.
- **Caps, straw hats and headphones sit on the head.** The cap's crown
  follows the head down to above the ears and its peak points the way you
  face, from the front, side and back. The straw hat's crown sits on the head
  with a wide brim around it, above the eyes. Headphones have a band over the
  top of the head (over an afro, too) and a cup on each ear, the far one
  hidden behind the head.
- **Ping shows your real connection.** It used to time the World's writes,
  which wait for the server to save and send everyone's updates back, so it
  read about 130 ms from Sydney. It now times a small read, which is what
  the trip to the server takes, and shows the middle of the last five.
- **Round avatars are centred.** The small round avatars in the People
  list, invites and the shop sat a couple of pixels right of the middle.
- **You can sit on the Campfire's back log.** Tapping it used to walk you to
  it; now it sits you down like the side logs.
- **The web sweep waits for the World to load.** The first visit compiles
  the World's code on demand, which took longer on CI than a screen gets to
  settle; the timer now starts once that code has arrived.

### Changed
- **The World does nothing while nothing moves.** The scene used to redraw
  once a second and check the place pads five times a second with everyone
  standing still. Now it wakes only when something is due (a bubble fading,
  an emote ending), and draws nothing in between. Opening a menu or typing
  a line no longer redraws the scene, and the walk marker spins on its own.
- **The World stops drawing when you can't see it.** It pauses in the
  background and behind the character editor. Someone standing in water
  paddles at 15 frames a second instead of 60. A web tab left hidden for 30
  seconds stops receiving World updates and picks them up again when you come
  back; you stay in the room the whole time.
- **The character editor is lighter.** The preview only animates while it
  turns or zooms, so it no longer redraws 60 times a second at rest.
- **Less network traffic.** A new chat line sends only the newest lines
  instead of the whole log, the floating chat log asks for 30 lines instead
  of 150, sending a line no longer sends a separate "stopped typing" first,
  and a change in someone's signal bars no longer resends the room's list
  of people. Rock paper scissors counts down once a second.
- **Menus close the way they open.** The place menu, People, Sijin's shop,
  Settings, the leave dialog, the emote tray, the decorate tray and invite
  cards play their opening animation backwards when you close them,
  tapping outside included, instead of vanishing.
- **"joined the World".** Join lines in the chat log say someone joined the
  World, not a place. Leave lines still say "left".
- **Name tags and bubbles stay over their owners.** They're no longer pushed
  aside or stacked; someone standing in front is drawn over the tag of
  someone behind them.
- **The invite button is an envelope.** Inviting someone to your home uses
  a mail icon instead of a house.

## [2.12.41] - 2026-11-24

### Fixed
- **Phones that only need an over-the-air update are no longer sent to the
  App Store.** After 2.12.40, a phone on the newest store build running an
  older update could be told to update in the App Store or Play Store when a
  restart was all it needed. The version each over-the-air update publishes
  is now kept apart from the recommended store version. Phones from 2.12.41
  on hear about both and restart into the update; older phones only see the
  store version, and pick up the update the next time the app starts.

## [2.12.40] - 2026-11-24

### Changed
- **Phones on an older version are asked to update after every release.**
  Once an over-the-air update is published to production, the recommended
  version for iOS and Android moves up to the new version, so phones below it
  get the Update button and can restart into it straight away instead of
  waiting for a cold start. Before, the recommended version only moved when
  someone set it by hand. It only ever goes up, the minimum version is left
  alone, and a platform whose update can't reach its store build keeps its
  current recommended version. The run's summary and the Google Chat post say
  what it was set to.

## [2.12.39] - 2026-11-24

### Changed
- **The app updates itself.** When there's a newer over-the-air update for
  your phone, The SHED downloads it straight away and restarts into it as
  soon as it's downloaded, without waiting for you. It won't restart while
  you're in the middle of something: a draft, a form, a game or the World.
  Then the top bar says "Update ready" and the app restarts when you finish,
  or the next time you come back to it. Tap "Update ready" to restart now.
- **An Update button at the top.** It sits in the top bar on every screen
  that has one whenever your phone isn't on the newest update: "Updating…"
  while it downloads, "Update ready" once it's waiting for you, and
  "Retry update" if the download failed (it also tries again at the next
  check). It never sends you to the store when a restart will do.
- **The store when only a new build will do.** When your version is behind
  and nothing over the air reaches it, the same button shows with the App
  Store or Play Store icon and opens the store. It waits until the phone
  has heard back from the update server first, and when the version it
  should be on goes up (as it does after every update is published), it
  asks the update server again straight away before offering the store.
- **The phone asks for updates while it's open.** On launch, when you come
  back to the app and every 15 minutes, at most once per 15 minutes.
- **No more update popup.** The "Update The SHED" popup at each launch and
  the pill with a close button are gone; the button above replaces them.
  The profile's Update button follows the same rule. Versions below the
  minimum still get the full-screen update screen.

## [2.12.38] - 2026-11-24

### Changed
- **Reimbursement lists ask the server less, part two.** The names under
  each request's approval steps (who approved, who's next) were fetched
  card by card. The All, Review and Requests lists now fetch them once for
  every card on screen, so All with 20 ongoing requests opens 20 live
  queries instead of 39 (59 before 2.12.23). The names look the same.

## [2.12.37] - 2026-11-24

### Added
- **SOW coins.** Your balance sits by the place button, on a gold SOW coin.
  Everyone starts with 50. Beat a game and earn coins, once per run and only
  for the best tier you reached: Flap over 500 is 10 and over 750 is 20,
  Mystic Man over 12,000 is 10 and over 15,000 is 20, Sky Shooter over
  10,000 is 10 and over 12,000 is 20. Up to 200 a day. The game-over card
  pops a "+20" when they land, and runs played offline pay when they sync.
- **A home of your own.** "Your home" in the place menu takes you to your
  own room. Only you and people you invite can come in: tap someone and
  then the house, or the house by their name under People. They get a card
  in the World to come over, or a notification if they're not in. An
  invite lasts a day. The door pad takes you back to the Garden.
- **Sijin Yang runs a shop in the Café.** He stands by the counter. Tap him
  for wallpapers (20 coins each) and furniture from a 10-coin rug to a
  150-coin bed, each shown as a picture.
- **Decorate.** At home, the palette button opens what you own. Tap
  something to put it down, tap it again to turn it or put it away, and tap
  the floor to move it. Pick a wallpaper the same way. Visitors see it all,
  and you walk round the furniture.
- **A poke brings them to you.** Opening a poke puts them beside you, where
  you are now, or where you poked from if you've gone.

### Changed
- **Furniture fits the people.** The Café counter, tables, stools and
  couch, the Chapel pews, lectern, altar and piano, the Campfire logs and
  lantern, and the Beach umbrella, sandcastle and net are lower, and seats
  sit at the new heights.
- **Name tags side by side move apart.** Two people standing together no
  longer have their names on top of each other.
- **Arriving by a pad never covers a pad's name.**

## [2.12.36] - 2026-11-24

### Fixed
- **Going from the Chapel back to the Garden no longer crashes test
  builds.** A round shape that had been squashed sent React Native an empty
  transform, which threw "Cannot read property 'forEach' of null". Shapes
  now always send one, and a lint rule stops a transform from being left
  out like that again. A full-screen attendance chart had the same pattern
  when the phone turned back upright, and is fixed the same way.
- **Mystic Man's start card says the controls once.** On a phone it ends
  with "Tap to start." instead of repeating them; on the web it lists only
  the keys.
- **The game-over card says where your score went.** Online and signed in
  it says "Saved to the leaderboard."; it only says it'll go on when you're
  online when you're offline.

## [2.12.35] - 2026-11-24

### Added
- **Move, size and tilt your eyes, brows and mouth.** The character editor
  has Eyes, Brows and Mouth tabs, each with Mii-style sliders: up and down,
  spacing, size and tilt (the mouth has up and down, size and tilt). Reset
  puts them back. The preview comes in close on your face while you're on
  the face tabs, and turns back to face you.
- **More ways to look like you.** Six more hairstyles (mohawk, space buns,
  a braid, curtains, a mullet, wavy), pink, blue and platinum hair, four
  more skin tones, a brow colour, lashes and almond eyes, a cat mouth and a
  tongue out, round and line blush, more freckles, moles, eyeshadow and
  lipstick, a goatee, a wide moustache and a chin strap.
- **Glasses of your own.** Round, square, sunglasses or big round, worn
  with any extra, so glasses and a backpack can go together now.
- **Hats and extras.** A beret, a bow, a headband, a party hat and a crown;
  a bow tie, a necklace, headphones and a flower behind your ear.
- **Tops and bottoms.** A collared shirt, a jacket, a jumper and polka dots,
  and trousers, shorts or a skirt in a colour of your own.
- **A favourite colour.** You wear it as your shoes, and on a beret, bow,
  headband, party hat, bow tie or necklace.
- **Poke anyone on staff.** "Not here right now" in People here now lists
  everyone with a staff profile this year who isn't in the world, by name,
  with Load more until you reach the end, not just a few people who'd been
  in before. You can poke someone who has never visited; the limits are the
  same (one poke an hour, and nobody poked twice in ten minutes).
- **See who's in the World.** The side menu shows "3 online" next to World,
  the Games list card says how many people are in right now, and the People
  button in the World has a badge with the count. Nothing shows when
  nobody's in.
- **A game-style People list.** People in the World opens a see-through
  dark panel over the World instead of a white sheet. Each row has the
  person's character, their name ("Daniel K."), where they are, and their
  connection as one to four bars (green, amber or red). Tap someone here to
  wave, high five, duel, mute, block or report. The button on the right of
  each row walks you over to someone here, or takes you to someone's place
  (into the same room as them, when there's space) and walks you over. The poke list and your blocked people are at the bottom.
- **Your connection at the top.** Wi-fi bars sit next to the People
  button; tap them to see your ping in milliseconds for a moment. Each
  phone times its own round trips to the server and shares its bars only
  when they change, at most once every 30 seconds.
- **One menu from the place button.** The place button ("The Garden") is
  at the top left now. Tap it for a menu that drops down with every other
  place (and how many people are in each) and Leave at the bottom. Leave
  asks first, in a World-styled dialog. Tap outside or the button again to
  close the menu.

### Changed
- **No back button in the World.** Leave from the place menu instead. Going
  back with a swipe or the back button asks with the same World-styled
  "Leave the World?" dialog.
- **Chat history lasts an hour**, not 15 minutes, and the log keeps up to
  150 lines (it was 50), so a busy hour still fits. Speech bubbles still go
  after 8 seconds.
- **The chat log reads on every backdrop.** It sits on a faint dark band,
  so the white and yellow text shows on the Café's and Chapel's cream walls
  and windows, and it shows whole messages only: no stray end of a wrapped
  line at the top.
- **Smoother World menus.** The People list, the place menu and the Leave
  dialog slide and fade in with their rows one after another, and ease out
  when they close. With Reduce Motion on, they appear and go without
  moving.
- **The editor's camera glides.** Switching tabs moves the preview smoothly
  between a close-up of the face (face, eyes, brows, mouth), head and
  shoulders (hair and hats) and the whole body (body, outfit, extras),
  instead of jumping. Hats moved into the Hair tab, now called Hair & hat.
- **The cap fits the head.** Its crown follows the head and comes down the
  sides to just above the ears, the hair only shows below its edge, and the
  peak points the way you face, turning with you and going behind your head
  when you face away. Buns and space buns tuck under it, curls peek out
  below it, and long hair, a bob, wavy hair and a ponytail start under its
  edge.
- **The Games list card is called World**, like the side menu.
- **One way into the character editor.** The Customise buttons are gone
  from the People list and your own card. Tap your character and press
  Outfit (or tap yourself in the list view) to change your look.
- **Randomise** picks from all the new choices too, with glasses, makeup,
  moles and the rest kept rare so not everyone gets everything.
- **Looks saved before this update don't change.** Every new part starts
  where it was drawn before, and an older app shows a newer look with the
  parts it knows.

## [2.12.34] - 2026-11-24

### Changed
- **Unread comment counts cost far less to work out.** The red comment counts
  on Home, the Reimbursements tab and the All, Review, Requests and Past lists
  now look at a request's approvals only when it has comments you haven't
  read. Most requests have no comments, so over 40 requests a Head of
  Department's count reads 25 records instead of 365. The numbers shown are
  the same.

## [2.12.33] - 2026-11-24

### Changed
- **Calendar history is a small button at the top.** Admins open it from a
  clock button next to the Month and Week switch, instead of a button under
  the calendar.
- **Counts are chips.** The Review sections, Ready to Pay and the All list's
  "Requests" heading show their count as a chip instead of "(2)" in the title. My mentees on Mentoring shows its year the same way.
- **Shorter text across the app.** Empty lists say what's empty and stop
  there ("All caught up", "No notifications", "No past requests") instead of
  adding a sentence about what would show up. Helper lines on Churches,
  Mentoring, Grievances, Profile (Spotify), Admin (Teams, Step timing, App
  errors, directory sync), Finance settings, Praise Managers and Acting as are
  cut to the part you need. What each role can see or change, what gets
  deleted, and dates like 1 October stay.
- **No duplicate Make a request button.** An empty Mine tab on Requests no
  longer repeats the "+ Make Request" button already at the bottom; "See past
  requests" stays when you have some.

## [2.12.32] - 2026-11-24

### Changed
- **Mystic Man is faster again.** His top speed is a quarter higher (960 to
  1200), and he keeps speeding up for longer to reach it.
- **Combos that keep getting longer.** From 15 seconds in, obstacles
  sometimes come one straight after another, in a random order: a hop and
  then straight under the vines, a hop into the big jump, two hops, out of a
  slide into a hop, two slides back to back (swipe down again), and any
  other mix. They start as pairs and grow by one every 15 seconds you last,
  up to ten in a row, and come more often as the run goes on. Each gap is
  worked out from how long the move before it takes to land, a quarter of a
  second to react, and the run-up the next move needs, so every combo is
  tight but possible, even a little early or late.
- **Obstacles come closer together.** The clear run between patterns is
  shorter, with less extra space thrown in.
- **Mystic Man wears coral.** His cloak is a warm coral with a light trim
  and a light outline, so he stands out from the night sky, the hills, the
  ground and every obstacle, even at full speed.

### Fixed
- **The start and game-over cards are crisp.** In Mystic Man, Sky Shooter
  and Flap, the card is solid instead of letting the game show through, its
  text is full white, and Play again and Leaderboard have their own bright
  colours instead of the app's dark green. Only the game around the card is
  dimmed.

## [2.12.31] - 2026-11-24

### Changed
- **Loading spinners on the website stop using the computer.** The spinning
  SOW mark and the pulsing grey placeholders were redrawn by the page's code
  every frame. On the website they're now animations the browser runs by
  itself, so a spinner left on screen (like the one at the bottom of a long
  All list) no longer keeps a laptop or phone busy. They look the same, and
  the app on phones is unchanged.

## [2.12.30] - 2026-11-24

### Fixed
- **Hats, hair and the scarf look right in the World.** Every hair style,
  hat, outfit and accessory was checked from the front, side and back:
  - The cap's peak sits at the cap's lower edge, not across the forehead,
    and from behind the cap no longer covers the whole head like a helmet.
  - The beanie's cuff runs along its lower edge instead of near the top.
  - On the oval and long face shapes, the beanie's pompom, the sun hat and
    the flower crown sit on top of the head instead of sinking into it.
  - Curly hair, a bun and an afro tuck under a cap, beanie or sun hat
    instead of showing through or ballooning above it.
  - A ponytail and an afro show from behind.
  - Spiky hair has proper spikes, and the side-swept fringe falls over the
    forehead instead of floating off the head.
  - The scarf wraps under the chin, where you can see it.

## [2.12.29] - 2026-11-24

### Changed
- **Reimbursement lists on the website stop using the computer while you
  read.** The moving fill on each request's current approval step was
  redrawn by the page's code every frame, once per card, so a list of
  requests kept the computer or phone busy (about half of a slow phone's
  processor on All) even when nothing changed. On the website it's now a
  CSS animation the browser runs by itself. It looks the same. The app on
  phones already ran it this way.

## [2.12.25] - 2026-11-24

### Changed
- **Swim in the pond and the sea.** Walk into the Garden pond or past the
  shallows at the Beach and you swim: you sink to your shoulders with a
  ripple round you, and your arms stroke as you move.
- **Rock paper scissors duels.** Tap someone and pick Duel: you walk over and
  ask "Rock paper scissors?". If they accept, you both get five seconds to
  pick rock, paper or scissors, while you both shout "Scissors… Paper…
  Rock!" over your heads (not in the chat). On "Rock!" your picks show over
  your heads, then the winner cheers and the loser cries. A draw goes again
  with three seconds to pick. Nobody sees a pick until the reveal, and
  anyone who doesn't pick in time gets one picked for them.
- **Join and leave lines in the chat.** The chat log now says when someone
  comes into the World and when they leave, in yellow like a game server:
  "[12:04] Daniel K. joined the Garden", "[12:09] Daniel K. left". Moving
  between places writes no line, and you don't see these lines for anyone
  you've blocked. A leave line from another place says where they left,
  and VoiceOver reads that place out too.
- **Last-name initials on name tags.** Name tags in the World show your
  first name and the first letter of your last name, "Daniel K." instead of
  "Daniel", so two people with the same first name can be told apart. Your
  own tag still says "You".
- **Randomise asks first.** In the character editor, Randomise now asks
  "Randomise your character?" before it replaces your look.
- **Duels in the list view.** Someone's sheet in the list view has a Rock
  paper scissors button, and the list shows the picks and who won (read
  aloud by VoiceOver).

### Fixed
- **Praying looks like praying.** The Pray emote now shows two small hands
  held together under the chin, instead of a long loop down the chest.
- **Duel fixes.** A pick sent just as a round ends can't count in the next
  round, each player has their own limit on changes of mind, a late reveal
  still gives the next round its full time, a new duel straight after another
  shows its buttons at once, and you don't see duels of someone you've
  blocked.
- **Swimmers keep swimming when they stop,** treading water instead of
  freezing.
## [2.12.23] - 2026-11-24

### Changed
- **Reimbursement lists ask the server less.** Each request card used to ask
  for its own count of unread comments. The All, Review, Requests and Past
  lists now ask once for every card on screen, so opening All with 20 ongoing
  requests opens 39 live queries instead of 59. The counts and badges look
  the same.

## [2.12.21] - 2026-11-23

### Changed
- **The website opens faster.** The code that makes Event Request and Design
  Request PDFs (about a fifth of the shared code every page loaded) is now
  fetched only when you press Download PDF. Every page downloads about 208 KB
  less, and on a slow connection the sign-in screen is ready about a quarter
  of a second sooner. The PDFs and the app on phones are unchanged.

## [2.12.20] - 2026-11-23

### Fixed
- **Update restarts the app; it doesn't send you to the store.** When your
  version is behind and there's an over-the-air update for your app, the
  popup, the top-bar pill and the Update button on your profile now say
  "Restart to update" and restart into it, downloading it first if needed.
  The store is a separate prompt, "Open the App Store" (or Play Store),
  shown only when no over-the-air update can bring you up to date and you
  need a new build. The app checks for an over-the-air update before it
  ever offers the store.

## [2.12.19] - 2026-11-23

### Changed
- **Leaderboard moves to the top of Games.** It's now a small button at the
  top right, next to the "Games" title, instead of its own card at the bottom
  of the list. It opens the same leaderboard as before.
- **Shorter lines under each game.** Each game in the list has one short line
  ("Fly and shoot.", "Run and jump.", "Tap through the gaps.") instead of the
  full how-to-play text, which still shows on the game's start card.

## [2.12.18] - 2026-11-23

### Changed
- **See who's typing.** Three dots bounce over someone's head while they
  write a line, and stop when they send it or stop typing.
- **Leaving the app for a moment keeps you in the World.** Switching apps or
  locking the phone no longer takes you out; you're still standing there when
  you come back. Away for more than about a minute and a half, you're taken
  out as before.
- **You come back where you left.** Opening the World again puts you in the
  place and on the spot you were in when you left, not back at the Garden
  gate.
- **No more hearing ring.** Everyone in the World sees the chat, so the ring
  round you, the faded bubbles for people "out of earshot" and the list
  view's "Can hear you" are gone.
- **Tap a line in the chat log** to mute, block or report whoever said it,
  even if they're somewhere else.
- **Walking is faster,** about one and a half times the old pace, with
  quicker steps to match.
- **One chat for the whole World.** The chat log shows every place's
  lines, with the place in brackets when it isn't yours, and includes
  the last 15 minutes from before you arrived. Speech bubbles over heads
  still only show in your own place.
- **Name tags and speech bubbles stay over their owners' heads.** When
  they overlap, the newest message draws on top and the rest go behind,
  rather than being pushed up the screen.
- **The chat log sits at the top of the World.** The last few lines show
  over the scenery with the time and who said them, in place of the "can
  hear you" pill, and you can scroll up through older lines. Speech
  bubbles over heads are unchanged.
- **Fewer buttons in People here.** Customize your character and Show as a
  list are gone. Tap yourself and pick Outfit to change your look. In the
  list view, tap your own name.
- **Update from your profile.** When your app is behind the recommended
  version, an Update button sits under the version number. It downloads
  the latest update and restarts the app, and only sends you to the store
  when a store update is needed. The update pill and the required-update
  screen do the same.
- **Delete account looks dangerous now:** a solid red card with a warning
  sign. What it does hasn't changed.
- **Admin, Users shows each person's app version and when they were last
  online,** with versions behind the newest one marked.

### Fixed
- **Opening the character editor from People here could freeze the
  screen** so nothing could be tapped. That way in is gone.
- **Swiping up from the bottom of the screen no longer walks you there.**
  Touches below the chat bar, where the iPhone's home swipe starts, are
  ignored.
- **Admin, Users shows activity for everyone** on very long lists, not just
  the first 600 people.
- **Update copes with an update being pulled** between checking and
  downloading, and applies a rollback instead of sending you to the store.

## [2.12.17] - 2026-11-23

### Changed
- **Mystic Man goes faster.** His top speed is a third higher than before, and
  he keeps speeding up for longer to get there. Every obstacle is still sized
  so the right move clears it at any speed.
- **Mystic Man's scores start again.** The faster game made the old scores
  unfair, so the leaderboard was cleared and everyone who was on it got a
  push. A best saved on a phone before the reset no longer shows, and an old
  run waiting to be sent from a phone that was offline is turned away, so the
  old scores can't come back.
- **An update you should install asks every time you open the app.** When
  your version is older than the recommended one, a popup asks you to update
  each time the app starts, until you do; "Not now" closes it until next
  time, and the Update pill in the top bar works the same way. Update
  installs an over-the-air update and restarts straight away when there is
  one for your build, and opens the store when you need a new build.

### Fixed
- **Mystic Man's cards are sharp.** On a phone held upright, the game-over
  card (and everything else in the game) could look slightly blurred,
  because the sideways game sat half a pixel off. It now lines up exactly.
- **Tapping a poke opens the Garden.** A poke's push opened the app but went
  nowhere; it now takes you to the Garden. A push about a game opens that
  game.

## [2.12.16] - 2026-11-23

### Changed
- **Mystic Man plays in landscape.** Turn your phone sideways: on a phone held
  upright the game is drawn turned a quarter turn, so it fills the screen when
  you hold it sideways, and the rest of the app stays as it was. On a computer
  it plays on a wide board, as before.
- **A small hop and a big jump.** Tap for a small hop; swipe up for the big
  jump; swipe down to duck. The hop starts the moment your finger touches the
  screen, not when you lift it, and a swipe up in the same touch turns it into
  the big jump, so nothing feels late. On a computer, tap ↑, W or space to hop, hold it (or
  press Shift with it) for the big jump, and press ↓ or S to duck.
- **More kinds of obstacle.** Besides the small rocks you can hop, there are
  now tall rocks and long logs that need the big jump, pairs of rocks back to
  back that need it too, and hanging vines you can only duck under. The
  floating beam is still there: duck or jump it.
- **Every run can be cleared.** Obstacles are sized from how high and far the
  hop and the big jump really go at the speed you're running, and there's
  always room to land and react before the next one, so nothing is ever
  impossible with the right move.

## [2.12.15] - 2026-11-23

### Changed
- **No swiping back out of a game.** In Sky Shooter, Mystic Man and Flap,
  a sideways swipe is always a move in the game. Before, a swipe right in
  Sky Shooter could be taken for "go back" and close the game. The way out
  is the back button at the top left, which still asks "Leave this game?"
  during a run. On the web, the browser's own swipe back (from the edge of
  a phone's screen, or two fingers on a trackpad) is kept off the game the
  same way; the browser's back button still asks first during a run.
- **Back from a game is always the games menu.** Going from a game to the
  leaderboard and playing again, over and over, used to pile up screens, so
  getting back out took a tap of the back button per screen. Now Play on
  the leaderboard swaps the old game and the leaderboard for the new game:
  there's only ever one game open, with at most the leaderboard on top of it.
- **The leaderboard shows everyone.** Each game's board used to stop at the
  top 10. It now shows 25 at a time with **Load more** at the bottom, which
  keeps going until every score is on the list ("That's everyone."). Your
  own best and place stay at the top, and your row is marked "(you)" in the
  list. Older versions of the app keep the top 10 as before.

## [2.12.14] - 2026-11-23

### Added
- **Every merge is posted to Google Chat.** When a pull request lands on
  `main`, a card in the team's Chat space says which version just went out,
  the PR's title and author, who merged it, and links to the PR and the deploy
  runs. It reminds you that web and the backend go live straight away and
  phones follow over the air.

### Changed
- **Chat posts move to a new space.** Merges, over-the-air update reports,
  EAS Production results and the backup and usage alerts all use one webhook,
  which now points at a dedicated space instead of Data and IT.

## [2.12.13] - 2026-11-23

### Added
- **Four more places to walk to.** Walk onto one of the labelled circles
  and stop there, and you step through to that place, arriving beside the
  circle that leads back. From the Garden, the Beach is through the gate at
  the top, the Campfire is on the right and the Chapel is at the bottom
  right. The Beach also leads to the Campfire, the Campfire to the Café,
  and the Café to the Chapel, so you can walk the whole way round. Every
  place is its own room, with its own chat, and up to 20 people before
  another opens.
- **Sit down.** Tap a seat and you walk over and sit: the pews in the
  Chapel, the logs round the Campfire, the stools and the couch in the
  Café, the picnic blanket in the Garden and the towel on the Beach.
  Everyone sees you sitting. Tap the ground to get up and walk. If the seat
  you tapped is taken, you get the nearest free one beside it.
- **See where everyone is.** A circle's label shows how many people are
  through it, and People here lists who is in each of the other places.
  From the same sheet you can go to any place the circles lead to without
  walking, which is also how you get around in the list view.

### Changed
- **The side menu calls it World,** since the Garden is now one place of
  five.
- **Your character's editor fills the screen.** The preview is bigger, the
  tabs fit on one line and the pictures of each choice fill the width, so
  more of them show at once. Once you turn your character by hand it stays
  facing the way you left it, rather than starting to spin again.

## [2.12.12] - 2026-11-23

### Added
- **See who's not in the Garden, and poke them.** People here now has "Not
  here right now": everyone who has visited, with how long ago. Poke sends
  them a notification asking them to join you, with a short message of your
  own if you like. You can poke once an hour, and nobody gets poked more
  than once in ten minutes.
- **Outfits.** As well as a T-shirt you can wear a dress, a skirt, overalls,
  a striped tee or a hoodie, in any of the colours.
- **The arcade is somewhere you go.** Tap the cabinet and you walk over to
  it before the games open. While you play, everyone else still sees you
  there, faded, with "Playing" over your head. Come back and you're back to
  normal, in the same spot.
- **A check before you leave.** Going back from the Garden, by the button,
  a swipe or the browser's back, asks "Leave the garden?" first.

### Changed
- **Tapping someone opens a small bubble over their head.** It has High
  five, Wave and More, and pops up right where they are instead of a sheet
  that covers the garden. More still has mute, block and report. Tap
  yourself for Outfit and Emotes (the shirt button in the corner is gone).
  Tap the ground, or the person again, and it goes away.
- **High five from anywhere.** Choose High five on someone across the garden
  and you walk over and stand beside them first. The ask goes out when you
  get there. Tap the ground to change your mind on the way.
- **Walking is smoother.** Steps start and stop gently instead of snapping,
  characters turn to a new direction rather than flipping, you no longer
  slip back a step just after you tap, and other people no longer flicker
  for a moment each time they change direction. Speech bubbles fade in and
  out, and the timer on a high-five ask runs smoothly.
- **Dragging is smoother too.** While your finger is down, your walk and the
  flower marker follow it on your own phone only. Everyone else sees where
  you went when you let go.
- **You keep facing the way you walked.** Characters used to turn back
  toward the screen after stopping.
- **Six emotes, acted out.** Wave, Laugh, Cheer, Sad, Angry and Pray. Your
  character jumps, doubles up, slumps, stomps, or bows their head with
  hands together, so you can read it from the body and not only the icon.
  A new emote takes over from the one playing.
- **Pick your character's features by looking at them.** Face shape, eyes,
  eyebrows, nose, mouth, hairstyle, hat, extras, blush, freckles and beard
  each show as little pictures on a plain character, instead of words like
  "Short" or "Bun". Skin tones now run from lightest to darkest.
- **The games leaderboard is easier to get around.** The Play button is at
  the top of each game's page, and on a phone you can swipe left and right
  between the games, the same as the tabs on Attendance.
- **The Garden is in the side menu,** under Announcements, as well as in
  Games. Praise List now sits under Churches. Profile is no longer a menu
  item: tap your photo at the top of the menu.

### Fixed
- **Typing on iPhone.** The chat box now rises to sit just above the
  keyboard, and the garden stays put behind it instead of being squashed.
  Tap anywhere, or the cross, to put the keyboard away.
- **An emote no longer flips back to the one before it.** Tapping emotes
  quickly could show the new one and then swap it for the old.
- **Speech bubble tails point at the right person on iPhone.** The little
  tail under a short bubble such as "High five?" sat off to one side.
- **Blank chat lines.** A message made only of invisible characters is no
  longer sent, and characters that flip the direction of text are removed.
- **The two buttons on a high-five ask line up.**
- **The character editor's tabs are readable in dark mode.** Hair, Body,
  Outfit and Extras were pale text on a pale button.
- **The walk marker no longer lingers** at your feet after you come back to
  the garden from another app.
- **Opening the Garden from Games while you're at the arcade** takes you
  back to where you were, not into a second copy of it.

## [2.12.11] - 2026-11-23

### Changed
- **Org Chart search looks through every year.** Type a name, role or team
  and the Org Chart lists each staff year it turns up in, newest first, with
  the role and team held that year and the year on a chip. Searching "Daniel
  Kim" lists every year from Student Leader at UNSW in 2020 to Head of
  Division in 2027. Tap a result to open that year's chart showing just that
  person, with "Show everyone" to see the whole year. Each word you type
  matches the start of a word, so "dan ki" works, and a search shows up to 40
  results. The search used to cover only the year on screen.

## [2.12.9] - 2026-11-23

### Changed
- **Every over-the-air release now says whether phones will get it.** After
  each merge, EAS Update compares the update's runtime on iOS and Android with
  the newest store build's, puts a table in the run's summary and posts the
  result to the Data and IT space in Google Chat, with links to each update.
  When an update can't reach the store build (native code or a fingerprint
  input such as `.gitignore` changed), the post says so and the run turns red,
  instead of the log saying "Published!" while no phone can load it. A failed
  publish is posted too. The post also reminds you that phones switch to the
  update on their second launch after it, or after 10 minutes away.

## [2.12.7] - 2026-11-23

### Added
- **The Garden: a place online to hang out.** Open Games and tap The Garden
  to walk into a little courtyard with everyone else who's there. Tap the
  ground to walk, and type to talk: what you say floats over your head. The
  chip at the top says how many people can hear you; people further away
  still show up, but their bubbles are faded. The flower button gives you
  emotes, and the arcade cabinet in the corner opens the games. Up to 20
  people share a garden, and more open another. Voices now carry half as far
  again as in the first design, so you can talk to people a little further away.
- **High fives.** Walk up to someone, tap them and choose High five. They see
  "High five?" over your head and have 10 seconds to say yes; if they do, you
  both turn to each other and slap hands. If they don't, it quietly goes away.
- **Twelve emotes with faces.** Wave, smile, laugh, cheer, love, surprised,
  think, pout, cry, angry, sleepy and pray. Your character's face and body act
  each one out for a few seconds, with an icon over your head, for everyone
  nearby to see.
- **Make your character your own.** Tap the shirt button (or yourself) to
  choose your skin, hairstyle, hair colour and shirt, plus a cap, beanie,
  flower crown or sun hat, and glasses, a backpack or a scarf. A turning
  preview shows it as you go, Randomise picks one for you, and Save shows it
  to everyone in the garden. Until you save, you keep the look you were given.
- **Walk by holding, not just tapping.** Press anywhere on the ground and you
  start walking straight away; keep your finger down or drag it and you follow
  it. A quick tap still walks there, and holding on someone never opens their
  card by mistake. Other people glide smoothly after you instead of jumping.
- **High fives that really touch.** When someone says yes, you both step in,
  your hands meet above your heads with a little spark, and you step back.
- **Make your character, Mii-style.** The editor now has tabs for Face, Hair,
  Body, Outfit and Extras: face shape, eyes and eye colour, eyebrows, nose and
  mouth; twelve hairstyles including buzz, ponytail, bald, bob and afro; height
  and build sliders; blush, freckles and a beard or moustache. Swipe the
  preview to turn your character around. Everyone else sees your new look.
- **Everything you do shows instantly.** Your messages, emotes, high fives and
  new look appear on your own screen straight away, while they're still on
  their way. A message shows "Sending…" until it arrives, and if something
  can't be sent it quietly goes back with a short note.
- **Mute, block and report.** Tap someone to wave, mute their bubbles for
  this visit, block them (you won't see each other in the garden again until
  you unblock them under People here), or report them to the leaders. Chat is
  cleared after 15 minutes, but a report keeps the last few lines, and the
  reported person's own, so leaders can see what happened.
- **A list view of the garden.** Under People here, "Show as a list" shows
  who's here, who can hear you and what's been said, with the same chat and
  emotes. It opens by itself with VoiceOver on, and when you're offline the
  garden says so and offers the games instead.
## [2.12.5] - 2026-11-23

### Changed
- **The app is smaller, and the Event Requests page loads faster on the
  web.** The calendar-check icon on Event Requests and the Spotify logo on
  Profile each came with a whole icon font: 1.3 MB and 166 KB for three
  icons. They now use fonts cut down to just those icons, which draw exactly
  the same. The loading spinner uses a smaller copy of the SOW mark instead
  of the 1024-pixel splash image. Each over-the-air update and the app
  download carry about 1.9 MB less, and a signed-in visit to Event Requests
  on the web downloads 1.6 MB less. Nothing looks different.

## [2.12.4] - 2026-11-22

### Changed
- **Going back mid-game asks first.** In the offline games, pressing back
  during a run (the back button, swiping back on iPhone, or the browser's back
  button) now pauses the game and asks "Leave this game?". **Continue** is the
  main button and picks up where you left off; tapping outside the box or
  pressing Escape does the same. **Leave game** ends the run without saving
  its score. Before a run starts and after it ends, back works straight away,
  as before.

## [2.12.1] - 2026-11-22

### Fixed
- **Verify runs on this Mac take turns, for contributors.** A run of
  `node scripts/verify.mjs` that takes screenshots now holds a lock for the
  whole Mac (`~/.cache/theshed-verify/verify.lock`) while it uses the
  simulator, Metro and the local Convex backend. A second run, from any
  worktree or tmux session, says whose run has it and waits its turn by
  itself, so nobody needs a `pgrep` waiter: two of those once matched each
  other's shell text and waited for each other forever. Two runs starting at
  the same moment can no longer both get going. The lock is given back when
  a run ends, fails, or is interrupted, and a run killed outright leaves a
  lock the next run takes over. Nothing changes for people using the app.

## [2.12.0] - 2026-11-22

### Added
- **Three little games for when you're offline.** Sky Shooter: drag to fly a
  plane that fires on its own while enemies come in from every edge. Mystic
  Man: he runs faster and faster; swipe up to jump the rocks and swipe down to
  slide under the floating beams (the up and down arrow keys on a computer).
  Flap: tap to flap through the gaps. The longer you last, the higher your
  score, and each game remembers your best on this device. They need no
  internet and no sign-in.
- **A way in when there's no connection.** If The SHED can't connect when you
  open it, you now see "You're offline" with a button to play a game while you
  wait, instead of a loading screen that never finishes. If the connection
  drops while you're using the app, a small "Offline · Play a game" note
  appears at the top. When the connection comes back, a small "Online" note
  shows for a moment and the back button takes you into The SHED. Nothing
  stops, reloads or closes a game you're playing.
- **The games fill the screen.** While you play, the side menu and status bar
  step aside; a small back button and the game-over card are the ways out.
- **A leaderboard for each game.** It shows the top ten scores at SOW, one per
  person and by name, plus your own best and your place. Anyone can look at
  it, signed in or not. Scores you set
  offline or signed out are kept on your device and go up on their own once
  you're online and signed in. Sending the same score twice changes nothing,
  and scores that can't be real are turned away.

## [2.11.64] - 2026-11-22

### Added
- **Fix a guest's name after adding them.** On an event's attendance page, tap
  the left side of a guest's row (or swipe it right) and tap the pencil to fix
  a typo. The name changes on that event only, and the event's total stays the
  same. You can do it after the event ends too, once editing is turned on.
- **Total attendance in the page header.** The chip at the top right of an
  event's attendance page now reads **Total**: everyone signed in plus guests,
  the same number the event's export and averages use.

### Changed
- **Add a guest from beside "Not signed in".** The small **+ Guest** button now
  sits next to the Not signed in heading, so you no longer scroll to the end of
  Signed in to find it. The name box opens just below it.

### Fixed
- **"Not signed in" scrolls again after an event ends.** On a wide but short
  window, such as a laptop browser window, the ended-event
  note and Enable editing button left so little room that both lists grew to
  their full length. They stopped scrolling, and "Not signed in" never loaded
  past its first ten people. The lists now keep room for at least three people
  each, and the page scrolls to show them.

## [2.11.62] - 2026-11-22

### Changed
- **`pr-status` applies the big-PR CodeRabbit rule, for contributors.**
  `node scripts/pr-status.mjs <number>` now works out whether the PR needs
  a CodeRabbit review: more than 300 changed lines of app or Convex code, or
  a change to the schema, deletion or migration, auth or permissions, or
  notifications. Small, config and tooling PRs don't. A review still counts
  when it covered the same app and Convex changes as the head, so a clean
  merge of `main` doesn't need a new one. A big PR with no review covering
  its head now reports NOT DONE. `--big` and `--not-big` override the path
  rules. The pr-shepherd skill follows the same rule. Nothing changes for
  people using the app.

## [2.11.60] - 2026-11-22

### Changed
- **Environment variables are read in one place per runtime, for
  contributors.** The app reads its build-time variables in `src/env.ts`,
  and the backend reads its own through `env()` in `convex/environment.ts`,
  which lists every name its functions use. Lint rejects `process.env`
  anywhere else in `src/` and `convex/`, with two exceptions:
  `convex/auth.config.ts` reads `CONVEX_SITE_URL` directly, the form Convex
  documents for that file, and Convex tests may set `process.env` to stage a
  variable. Nothing changes for people using the app.

## [2.11.59] - 2026-11-22

### Removed
- **Duplicated and dead code, for contributors.**
  - Code written twice is now one shared piece: about 20 components, hooks
    and helpers, such as the delete warning on events and members, the
    campus picker and pills, comment previews, "load more", the request
    badges, short dates and search debouncing.
  - Gone: a one-off church reminder nobody ran any more, an unused prop, two
    file shims, and a finished release checklist.
  - Screens look and behave the same.

## [2.11.58] - 2026-11-22

### Changed
- **Backend reads and writes name their table.** Every `ctx.db.get`,
  `patch`, `replace` and `delete` passes the table name with the id, as the
  Convex guidelines ask, and lint now requires it. Nothing changes for people
  using the app.

## [2.11.57] - 2026-11-22

### Removed
- **Unused code, for contributors.** Exports and types that nothing imports
  lose `export`, or go when nothing uses them at all. The `npx convex dev`
  welcome page in `convex/` goes too. CI now runs `knip`, so unused files,
  exports and dependencies fail the build. Nothing changes for people using
  the app.

## [2.11.55] - 2026-11-22

### Added
- **Add someone to one event without making them a member.** When someone
  comes just once, say a member's parents, you can now count them without
  adding them to the members list. While searching, tap the small **Guest**
  button beside Create to add the name you typed. Or tap **Add a guest** under
  Signed in and type a name. Guests are listed under Signed in with a "Guest"
  label. They count toward the event's total, its export and campus averages,
  but they never show up in Members, search for other events, merges or
  Insights about people. Remove one the same way you undo a sign-in.

## [2.11.54] - 2026-11-22

### Added
- **Announcements can go to specific people.** Under Send to, "People" opens a
  searchable list of this year's leaders. Search by name, email or
  department, tick people one by one, or select everyone the search shows.
  All leaders and Groups work as before, and so do scheduling, the limits,
  the preview and the history, which names the people it went to.
- **See who won't get a push before you send.** The form lists everyone in
  the audience a push can't reach, and why: no app, or notifications off.
  One tap emails just those people, or you can email everyone. The
  confirmation before sending always opens and shows the same list with both
  options. If someone would get neither a push nor an email, it warns you
  first.

## [2.11.52] - 2026-11-22

### Fixed
- **Typecheck passes again once Metro has run, for contributors.** 2.11.30
  removed two router casts that weren't needless. A notification's link and
  an Insights link come from the backend, so typed routes can't check them,
  and without a cast `npm run typecheck` failed in any checkout where Metro
  had generated `.expo/types/router.d.ts`. CI doesn't generate that file, so
  it didn't catch this. They're now `as Href`, the narrow cast a review
  asked for in #161. Nothing changes for people using the app.

## [2.11.49] - 2026-11-22

### Changed
- **Background jobs start a few minutes past the hour.** The morning
  reminder digest now goes out at 22:07 UTC (9:07am in Sydney in summer,
  8:07am in winter) instead of on the hour. The Monday directory sync, the
  30 September prefill and receipt purge, the nightly Insights rebuild and
  the church map refresh each move by 3 to 11 minutes too. Minute 0 is the
  busiest minute for scheduled jobs, so they now start off-peak.
- **Two database indexes that only repeated the start of a longer one are
  gone,** on comment reactions and grievances. Their queries use the longer
  index and return the same rows in the same order. The next Convex
  production deploy drops them.
- **Lint catches duplicate indexes and on-the-hour crons, for contributors.**
  `@convex-dev/no-duplicate-indexes` and `@convex-dev/no-top-of-hour-crons`
  are on. The eight indexes kept for their sort order say why next to them.

## [2.11.46] - 2026-11-22

### Changed
- **Colours come from the theme, for contributors.** A colour written into a
  screen is how a dark-mode miss happens, so lint now rejects hex and `rgb()`
  literals outside `src/theme.ts` and the calendar palette. Colours that are
  the same in both themes (white on a badge, shadows, the QR code) live in
  `fixedColours`. The only screen that looks different is the "Configuration
  error" screen, which now follows the dark theme too.

## [2.11.45] - 2026-11-22

### Changed
- **List rows keep their own state when another row goes, for contributors.**
  Lists were keyed by position, so removing a staff assignment or a church
  service time handed that row's open picker to the row below it. Rows are
  now keyed by what they show, editable lists keep an id per row
  (`src/lib/listKeys.ts`, `useRowIds`), and lint rejects an index key
  (`react/no-array-index-key`). Fixed positions, like the weekday header and
  chart points, say why in a disable comment.

## [2.11.44] - 2026-11-22

### Changed
- **Verify's before and after screenshots match when nothing changed, for
  contributors.** Each screenshot waits until two frames in a row are
  identical, on iOS and web, so none is caught mid-transition. The iOS status
  bar shows 9:41 throughout, and seeded events sit at a round hour. Times the
  server stamps can still differ (`docs/verification.md` → "Still open").
  Verify also stops leaving the checkout's `.env.local` pointed at its
  throwaway backend, which the Convex CLI wrote there on every run. Nothing
  changes for people using the app.

## [2.11.43] - 2026-11-22

### Changed
- **Form inputs have test ids, for contributors.** Every text field gets a
  test id from its label, or its accessibility label when it shows none
  (`field-title`, `field-phone`), so a Maestro flow on
  the iOS Simulator or a Playwright script on web can fill in a form
  (`docs/verification.md` → "Filling in a form"). Nothing changes for people
  using the app.

## [2.11.42] - 2026-11-22

### Changed
- **CodeRabbit only reviews big changes, for contributors.** Automatic
  reviews are off. A review is requested only when a PR has more than 300
  lines of app or Convex code, or it touches the schema, data deletion,
  auth, or notification sending. Smaller PRs go through once CI and verify
  pass. Nothing changes for people using the app.

## [2.11.31] - 2026-11-21

### Added
- **Previous and next buttons beside the month or week on bigger screens.**
  On a tablet or a computer, the calendar's month or week now has a ‹ button
  on its left and a › button on its right, so you can go back or forward with
  a click or a tap instead of a swipe or the arrow keys. They move the same way
  a swipe does. Phones look the same as before: swipe to change the month or
  week.

## [2.11.30] - 2026-11-21

### Changed
- **No more `as never`, for contributors.** The cast fits any type, so it
  switched type checking off where it was used. The six in the app weren't
  needed or now name the real type, the tests' fixtures assert to the type
  they stand in for, and lint rejects new ones. Nothing changes for people
  using the app.

## [2.11.21] - 2026-11-21

### Fixed
- **Sign-in and sign-out problems show a message on the web.** If signing
  out fails, or a sign-in is turned away or goes wrong, the web app now says
  so, as the phone apps already did. Before, nothing happened.

### Changed
- **Lint covers the whole repo, for contributors.** CI lints `convex/`,
  `shared/` and `scripts/` too, warnings fail, and the new rules come from
  mistakes that reviews kept catching.

## [2.11.20] - 2026-11-21

### Changed
- **One command to check a branch, for contributors.** `node scripts/verify.mjs`
  reads the diff and decides what to check from a feature map
  (`scripts/verify/feature-map.json`). Then it opens the screens the change
  affects on the web and the iOS Simulator, against a throwaway local
  backend, with before and after screenshots (`docs/verification.md`). A
  `pr-shepherd` skill and `scripts/pr-status.mjs` take a PR from open to green.
  Nothing changes for people using the app.

## [2.11.19] - 2026-11-19

### Added
- **Calendar history, for admins.** A "Calendar history" button under the
  Calendar lists every calendar entry added, edited or deleted, newest
  first: who did it and when, and for an edit, each field that changed from
  what to what. An entry turned into an attendance event gets its own line,
  with a link to the event. Entries that event requests add or update aren't
  listed. Admins previewing another role don't see it.
- **Connect someone's attendance record to their old staff profile, from
  Admin.** Every staff card in Admin, including those in past years and
  under "Previously staff", has a connect button. Search for the person
  (for example signed in at an event under a personal email), review what
  merges, and confirm: their attendance moves onto the record linked to that
  staff profile, which keeps the personal email.

### Changed
- **SOW events on the Calendar wear their tag's colour,** instead of teal:
  a Retreat in the Retreat tag's colour, Missions in Missions'. With more
  than one coloured tag, the first one counts. A SOW event with no coloured
  tag is black, SOW's own colour, and shows in the theme's light text colour
  on the dark theme so it stays visible, as does SOW's dot in the Calendar's
  filters. Google Calendar gets the nearest of its colours, or Graphite.

### Fixed
- **Taking attendance at a calendar entry keeps its dates and times.**
  Ticking "Take attendance" and pressing Next used to open the attendance
  form at today's date and the nearest half hour. It now carries over the
  entry's start and end, and a multi-day entry stays multi-day.

## [2.11.18] - 2026-11-19

### Changed
- **Updates install themselves, with no popup.** "An update is ready" is
  gone. Once a new version has downloaded, The SHED restarts onto it when you
  come back after being away for 10 minutes or more, so it never restarts
  while you're using it. A quick trip to another app, Control Centre or the
  notification shade doesn't count, and neither does choosing a photo or
  file, sharing an export or signing in with Google. It also waits while a
  request, receipt, event or design request, grievance, event form,
  announcement or Edit Home is open, however long you were away, so nothing
  you've typed is lost.

## [2.11.17] - 2026-11-19

### Added
- **Raise a Grievance has a "How it works" button,** like Make Request on
  Finance. It walks through the form, who sees it (only the grievance team's
  departments), the emails that follow, being looked after, how it's closed,
  and following along when signed in.
- **Send Reminder on an event form that hasn't been submitted.** Whoever
  reviews event forms, and the Head of the event's department, can chase a
  Marketing, Risk or Finance form still being filled in, or sent back for
  changes. The requester (and whoever submitted it before it was sent back)
  gets a push and an email straight away, with how far off the event is and
  any changes asked for. Once a day per form; the button says who last sent
  one and when. The morning digest's reminders carry on as before.
- **A calendar entry can have its own colour.** Adding or editing an event or
  deadline on the Calendar offers the full palette, or its usual grey or red.
  It shows in the month, the week and the day's list, and Google Calendar
  gets the nearest of its colours.

### Changed
- **Attendance tags have 30 colours to choose from,** up from 17: slate,
  stone, brown, maroon, crimson, coral, gold, olive, forest, sky, navy,
  lavender and plum join the rest. They're picked from a grid of swatches
  instead of a long list.
- **Tapping a day on the Calendar no longer scrolls down to its events.** The
  screen stays where it is; the day's events are just below the month.

## [2.11.16] - 2026-11-18

### Changed
- **The Calendar's month is shorter, leaving more room for the day's events
  below it.** Each week takes less height and the weeks sit closer together.
  A day shows up to two events in the month, or one and "+N more"; tapping
  the day lists them all just below.
- **The Week view is as tall as the month,** so switching between them
  doesn't move the day's events. The hours scroll inside it, opening at 7am.
- **The date heading under the month is gone.** The picked day is already
  highlighted in the month, so its events start straight away. A day with
  nothing on says so in one short line instead of a large empty-state box.

### Fixed
- **The Month/Week switch's highlight is a pill like the switch around it,**
  instead of a rounded rectangle inside an oval.

## [2.11.15] - 2026-11-18

### Changed
- **The little dots between pieces of text are gone.** Lines of facts, like
  a request's department, date and age, or who did something and when, are
  separate pieces with space between them. Counts and years beside a heading
  sit in a small grey chip, as in "Closed 2" and "Teams 2027". Status pills
  no longer start with a dot; their colour already shows the state.
- **Wording that ran together with dots reads as sentences.** Roles and
  campuses are listed with commas, church service times put a semicolon
  between days ("Sunday 9am and 6pm; Saturday 6:30pm"), attendance shows
  "4/6 (67%)", a risk's rating reads "High (12)", a held week reads
  "Week 3 (Weekly Bible Study)", and a push about a new event says where it
  is ("Camp at UNSW"). A bank account shows as "Account ending 1234".
- **A campus's programs on Home show as tags** instead of a bulleted list.

## [2.11.14] - 2026-11-18

### Added
- **Whoever raised a grievance can email back and forth with the person
  looking after it.** Once someone on the grievance team takes it on, every
  email we send about it replies to them, so answering the email reaches
  them directly, whether or not the person who raised it has an account.
  The emails say so. If it's given to someone else, the person who raised it
  is emailed who's looking after it now. The team gets an Email button on
  each grievance that starts an email to the person who raised it.

### Fixed
- **Tapping a grievance notification opens the grievance.** It opened the
  app and stayed on whatever screen was showing. This covers updates to the
  person who raised it, the team's notices, and the reminder to hand over
  last year's grievances.
- **Someone given a grievance gets a notification meant for them.** It reads
  "You're looking after grievance …" instead of the notice the rest of the
  team gets.
- **Phones Apple won't deliver to stop getting retried.** A device that
  Apple rejects as a bad device is forgotten, as one that's no longer
  registered already was. Opening the app on it again registers it afresh.

## [2.11.13] - 2026-11-17

### Changed
- **The calendar puts its controls along the bottom.** The month (or week)
  you're looking at is named in the top bar, and the calendar starts right
  under it; swipe to move between months. A bar along the bottom stays put
  as you scroll: Today on the left, always there, the Month/Week switch in
  the middle, and a + to add an event on the right. The ‹ › arrows are gone;
  with a screen reader, swipe up or down on the month's name to change it,
  and on the web the ← → keys move between months or weeks.

### Fixed
- **Tapping a day scrolls down to its events again.** On a phone, the list
  for the day you tapped now comes into view, with the bottom of the month
  still showing above it.

## [2.11.12] - 2026-11-16

### Changed
- **Swiping the calendar slides the next month or week in under your
  finger.** Like moving between tabs, the month (or week) beside the one
  you're on follows your finger into view, already showing its events, and
  settles into place when you let go; a short swipe springs back. The ‹ ›
  arrows slide the same way, and Today slides when it's next door and jumps
  when it's further away. Before, a swipe nudged the calendar a little and
  faded the new month in. With Reduce Motion on, it changes straight over.

## [2.11.11] - 2026-11-13

### Fixed
- **A broken or mistyped event link says "Event not found" again.** Opening
  an attendance event whose link isn't a real event id showed "Something went
  wrong" and a server error. The check-in list on that screen refused the
  link before the screen could say the event doesn't exist; it now treats it
  as an event with nobody waiting, so the screen shows "Event not found".

## [2.11.10] - 2026-11-11

### Changed
- **Screens are tidied up with no visible change.** Admin's Roles,
  Divisions, Departments and Universities editors, the status pills, the
  "How it works" guides, the date and time pickers and the Insights charts
  each share one implementation instead of several copies. The Praise List
  tabs are in separate files, and unused styles, an unused icon and
  duplicate date formatters are gone. Screens look and behave as before.

## [2.11.9] - 2026-11-11

### Changed
- **The test suite is about 3,000 lines shorter and checks the same things.**
  Tests share one setup instead of each file building its own, near-identical
  tests became tables, and duplicates went. A few tests that only checked a
  reminder time was set now check who gets reminded. Coverage is unchanged.
  Nothing changes in the app.

## [2.11.8] - 2026-11-11

### Changed
- **Backend tidy-up with no visible change.** Name lookups, comment checks
  and a dozen small helpers that were written out several times now live
  in one place, and the Insights and Home types come straight from the
  checks the server already runs on them.

## [2.11.7] - 2026-11-11

### Removed
- **One-off tools that have done their job.** The Praise List backfill, the
  avatar shrink-all job, the member repair tools and the import from the old
  web app's design requests. Each was checked against production first: the
  backfill would change none of the 32 songs, no avatar is left to shrink, and
  the 15 imported design requests are all in. Nothing changes in the app.
- **Calendar categories from before 2.10.14.** Older apps already show the
  update screen, and no event or calendar entry still has one.

## [2.11.6] - 2026-11-11

### Removed
- **Unused tooling and the Maestro suite are gone.** The Maestro flows never
  ran in CI and needed a setup file that isn't in the repo; the web sweep in
  CI opens every screen instead. Also gone: the copy of the Convex agent
  skills under `.agents/`, two scripts nothing called, and the done list in
  `LAUNCH.md`. Nothing changes in the app.

### Changed
- **The README says what's in the app in a page, not seven.** The detail
  lives in `CHANGELOG.md` and `docs/context/`, and the Tests section now
  covers the web sweep and the `e2e-auth` sign-in.

## [2.11.5] - 2026-11-11

### Added
- **Admins can act as a campus leader.** "Campus leader" is now under Roles
  in Acting as. It shows the app the way a campus leader sees it: Home opens
  on Attendance, there are no Reimbursements, Event or Design requests or
  their badges, no Admin, and calendar items don't link into event requests.
  As with every other role, it only changes what you see. Anything you can
  really do, you still can.

### Fixed
- **Editing Attendance's Tags and Metadata follows the role you're acting
  as.** An admin who also leads a campus could still edit them while acting
  as a staff member who can't. They're now editable only when the role
  you're looking through is an admin or a campus leader, and read-only
  otherwise.
## [2.11.4] - 2026-11-10

### Changed
- **Each song in a request has its own note.** The note sits under the song
  you're adding, and **Add another song** (was "Add song to list") is below
  it, so you write a song's note, then move on to the next. Songs already in
  your list show their note and can have it edited, including songs from an
  imported playlist. Praise Managers' emails list each song's note under it.
- **Spotify search waits a little longer after you stop typing** (0.6
  seconds), and each person can search Spotify 30 times a minute. Past that,
  the form says to wait a minute.
- **The app asks Spotify for a new access key about once an hour** instead
  of before every search, autofill or release date lookup.

## [2.11.3] - 2026-11-10

### Added
- **Search Spotify when requesting a song.** Type a song or artist in the
  request form and pick from Spotify's results, instead of finding the song
  in Spotify and pasting its link. Picking one fills in the title, artist,
  link and artwork, and the same duplicate checks run.
- **Tap a song to see its history.** Who suggested it and when, who approved
  or declined it and when, the release date when Spotify has one, and a
  button to open it in Spotify or YouTube. It works on Approved, Mine and To
  review.
- **Sort the Praise List by recently approved or by release date**, as well
  as by song name and artist.
- **Mine shows this year's Praise Managers** at the top, so you know who
  reviews your requests.

### Changed
- **The Approved Playlist tab is now Approved**, and it loads 15 songs at a
  time, fetching the next 15 as you scroll. Search looks through the whole
  list, not only the songs already loaded. Mine and To review load the same
  way.
- **Request notes are only shown to Praise Managers, admins and the person
  who asked.** Everyone still sees who suggested each song.

## [2.11.2] - 2026-11-10

### Changed
- **Praise Managers are chosen on the Praise List**, in a Praise Managers tab
  after To review that admins see, instead of in Admin → Teams. It opens on
  this staff year, with a switch to next year's for getting them ready
  before 1 October.

## [2.11.1] - 2026-11-10

### Changed
- **A declined song can be requested again.** Before, a song that had been
  declined could never be asked for again, by anyone. Now the request form
  says "This song was declined before" and sends it as a new request, and a
  declined song under Mine has a **Request again** button. The declined
  request stays as it was, with its reason. A song that's pending or already
  on the Praise List still can't be requested twice.
- **Praise Managers are chosen in Admin → Teams**, next to Admins, instead of
  Admin → System. Adding one is a search like adding an admin, and removing
  one asks by name instead of by email.
- **Home's "Waiting on you" counts songs to review** for Praise Managers, as
  the side menu already did.
- **Praise Managers are emailed about each song request**, as well as the
  push they already got. The email has the title, artist, link and the
  requester's note, and a link to To review. Several songs sent together are
  one email listing them all, and a push for a single song in a batch now
  names it instead of saying "1 song".

### Fixed
- **The app ships three icon fonts again, not nineteen.** 2.9.17 cut the
  icon fonts down to the ones the app uses, and the Praise List brought all
  19 back. Fonts are now 1.9 MB instead of 4 MB, so downloads and updates
  are about 2 MB smaller. The third font is for the Spotify logo on Profile.
- **The Praise List page explains itself when you can't use it.** Signed out,
  it asks you to sign in and brings you back; signed in without a role this
  year, it says the Praise List is for SOW staff. Before, both saw empty tabs
  with no explanation.
- **Spotify and Praise List errors show in the app on the website too.**
  Connecting or disconnecting Spotify on Profile, and a song that couldn't be
  deleted, showed a browser pop-up on the website. They now show on the
  Profile card and as a toast, as on phones.
- An admin action refused to someone who isn't an admin names the
  department that's always admin this year instead of always saying "Data
  and IT".
- **Deleting your account deletes your saved bank accounts.** The account
  name, BSB and number stayed behind and came back for the next sign-in
  with that email.
- **Only people who can see a request can react to its comments or mark
  them read,** and unread comment counts only cover requests you can see.
- **A changed sign-in email keeps your roles and requests.** Being an
  admin, Director or Praise Manager, saved bank accounts, song, design and
  event requests, grievances and notifications now move to the new email
  with your staff profile and reimbursement requests.
- **A delegate covering for a Head is nudged and told about cancellations**
  as well as the Head, as they already were about new requests.
- **Spotify asks you to reconnect after you remove The SHED's access.**
  Importing a playlist said the link was wrong. It now disconnects Spotify
  and asks you to connect it again from Profile.
- **Mine loads faster with declined songs in it.** Whether a declined song
  can be requested again is checked when you tap **Request again**, which
  says so if someone else's request for that recording is pending or on the
  Praise List.

## [2.11.0] - 2026-11-09

### Added
- **Praise List** (`/music`, in the side menu for staff): the approved
  worship songs, searchable and sortable, and requests to add more from a
  Spotify or YouTube link or typed in, reviewed by Praise Managers chosen in
  Admin. It went live on 6 and 8 November under 2.10.32's and 2.10.33's
  version numbers without an entry of its own; the fixes below came after.

### Fixed
- **Praise List works on the website.** Messages and questions on the
  Praise List, such as "Possible duplicate: request this version anyway?",
  "Request sent" and every error, showed only on phones. On the website the
  button did nothing, so a song that looked like another could never be
  sent. They now appear on the website as well.
- **Editing a song no longer warns that it duplicates itself.** Editing a
  request or approved song with a YouTube or typed-in link said the song had
  "already been requested", because it matched its own entry.
- **Error messages on the Praise List are readable.** They show only the
  reason (for example "This recording was already requested") without the
  server's technical prefix, and YouTube playlist errors now show their
  reason on the live site, not "Server Error".
- **Acting as a role shows that role's Praise List.** A Praise Manager acting
  as, say, Music staff still saw To Review and the edit, delete and approve
  buttons. They now see what that role sees. An admin acting as Praise
  Manager still sees the queue, without the buttons, and anyone who can't
  review keeps a Mine tab for their own requests.
- **Praise Managers carry into the new staff year.** On 1 October the new
  year starts with last year's Praise Managers who are still on staff, as
  the Budget Manager already does. Before, the new year would have had none,
  so no one could review requests. A new year whose list an admin emptied
  stays empty.
- **Deleting your account also removes your Spotify connection.**
- **Notifications about new song requests show the requester's name**, not
  their email, and say "1 song" or "3 songs". A Praise Manager adding a song
  is told it's on the playlist, not that it awaits review.
- **Changing a song's link clears the old artwork and recording code**, so
  the new link isn't checked against the old song.
- **Spotify playlists bring each song's recording code (ISRC)** when Spotify
  has one, so the same recording on another Spotify release is refused.
  YouTube songs have no recording code, so a song requested from both is only
  flagged when the title and artist match.
- **YouTube Music artists lose the " - Topic"** that YouTube adds to its
  automatic channels.
- **Only signed-in users can look up Spotify songs or YouTube playlists**
  through The SHED's Spotify app and YouTube key.
- **Editing a song no longer loses it.** "Add song to list" showed while
  editing and emptied the form, so Save Changes then said the title was
  missing. Typing in the Music Link box also emptied the title, artist and
  link before anything was looked up. Both are fixed: the box only fills the
  song in when you tap Autofill.
- **A Praise Manager editing an approved song sees why Save is greyed out.**
  The "already requested" warning lived inside the autofill box, which is
  hidden for approved songs.
- **The same YouTube video can't be requested twice**, whichever link form
  it's pasted in (youtu.be, YouTube Music, Shorts) and whatever title it's
  given, just like a Spotify track. Existing requests pick this up from
  `musicBackfill:backfill`.
- **YouTube songs keep their thumbnail** on the playlist and request cards.
  Spotify artwork is kept only from Spotify's own image servers.
- **YouTube titles lose "(Official Video)" and "(4K Remaster)"** when
  autofilled.
- "Praise Manger" in the guide is now "Praise Manager", and messages say
  "1 song" or "3 songs" instead of "song(s)".
- **Only this year's staff can review songs.** During the October grace a
  Praise Manager without a staff profile for the new year can't approve,
  decline or edit, as admins already work.
- **Changing the Music Link after Autofill clears the old song**, so the
  form can't send the previous song by mistake. Pasting the same song in a
  different link form keeps it. `http://` Spotify links now autofill.
- **A Praise Manager acting as another role is told the truth**: their songs
  still go straight onto the playlist, so the form says so.
- Declining one song and quickly opening another no longer lets the first
  decision close or mark the second sheet.
- A Spotify connection made while the account was being deleted now reports
  an error instead of success. Former staff who are still connected keep the
  Disconnect button on Profile.

### Changed
- **Praise List works like the other request forms.** New requests and
  approve or decline decisions also arrive as push notifications (no email).
  The side menu shows how many songs wait for review, for Praise Managers
  and an admin acting as one. The tabs are Approved Playlist, Mine and To
  review.
- **Declining a song asks for an optional reason on every platform** in a
  sheet, like declining a reimbursement. Before, Android couldn't give a
  reason and the website asked in two browser pop-ups. Declined songs show
  who asked for them.
- **Messages appear in the app, not as pop-ups.** Problems with a request
  show above the form's buttons, "Request sent for review" and similar show
  as a short toast, and deleting a request (or removing an approved song)
  asks in the app's own dialog.
- The request form is quieter: the Spotify connection status shows only for
  Spotify playlists, the song list appears once a song is in it, and title
  and artist start with capitals on phones. The guide explains autofill and
  how to follow a request.
- The Spotify card on Profile shows for staff (only staff have the Praise
  List) and for anyone still connected, so they can disconnect. It says
  what it's for, and disconnecting asks in the app.

## [2.10.33] - 2026-11-07

### Changed
- **Starting an EAS store build sends an over-the-air update when that's
  enough.** When EAS Production or EAS Staging is run and a platform's
  native code is the same as its last store build, which reached the store,
  the run now publishes the commit over the air with `eas update` instead of
  making a new store build. Phones get the change in minutes and nobody
  waits for store review. A platform whose native code changed still gets a
  store build, and ticking **force** still builds anyway. Production only
  sends `main` over the air. The app itself is unchanged.

## [2.10.32] - 2026-11-06

### Fixed
- **Acting as a role shows only what that role sees.** As with Finance
  settings in 2.10.31, an admin acting as a role could still see things
  from their own account: the Review tab with their own reviewed requests,
  the Edit button on Home, Edit on other people's calendar entries, and the
  grievance team's view and badge if they're on that team. These now
  follow the role being previewed, so acting as Events staff looks like
  Events staff. Without acting as a role, nothing changes.

## [2.10.31] - 2026-11-06

### Fixed
- **Acting as a role no longer shows Finance settings that role can't see.**
  An admin acting as, say, Events staff or the Events Head saw a Finance
  settings button on Reimbursements → Review. Finance settings now show only
  when the role being previewed would see them: the finance team, the
  Director or the always-admin department. Without acting as a role, admins
  still see and change them as before.

## [2.10.30] - 2026-11-05

### Fixed
- **The automated checks no longer fail at random.** The design request,
  grievance and reminder tests could end with an error after every test had
  passed, which could turn CI red with nothing actually broken. They now
  only call off emails that haven't started sending yet, so a run passes or
  fails on the tests alone. The app itself is unchanged.

## [2.10.29] - 2026-11-05

### Changed
- **"An update is ready" is now a popup in the middle of the screen.** When a
  new version has downloaded, a card appears over the app with a big Restart
  button, so it's hard to miss. If a sheet is open, it waits until the sheet
  closes. Not now closes it, and the update is then picked up the next time
  the app is opened from scratch.

## [2.10.28] - 2026-11-05

### Added
- **Admins choose which department does each job.** Admin → Teams lists the
  finance team, the events team, design requests, who reviews the Marketing,
  Risk and Finance forms, and the department whose members are always
  admins, for each staff year. Nothing changes until someone picks a
  different department. Renaming a department keeps its jobs, so Marketing
  renamed to Design still handles design requests and Marketing forms. A
  department that does a job can't be deleted until another department takes
  it over, and the Departments list shows which jobs each one does. Moving a
  job asks first, and the always-admin job can't move somewhere that leaves
  nobody an admin.
- **The October rollover keeps these settings.** A staff year keeps the year
  before's team jobs until an admin changes them, so 1 October changes
  nothing. On 1 October the new year also takes any Budget Manager or
  Director threshold it doesn't have yet from the year just ended (a Budget
  Manager only while they're still on the finance team).

### Changed
- **Admin is shorter: Users, Structure, Teams and System.** Teams has the
  admins and the department jobs; System has app errors and the directory
  sync. Everything else moved to the screen it's about.
- **Finance settings moved next to the requests.** A "Finance settings"
  button at the top of the All tab in Reimbursements and Event Requests opens
  the Budget Manager, both Director thresholds, approver delegation and step
  timing. Everyone in the finance team can see them; the Finance Head,
  whoever covers for them, and admins can change them. Someone covering the
  Finance Head from another department finds the button on Review. The
  Finance Head no longer has Admin in the menu.
- **The grievance team picks its own departments.** It's under Grievances →
  Settings, for the people who handle grievances, instead of in Admin.
- **Suggested merges are in Attendance.** While there are people who may be
  the same member, a button at the top of Attendance → Members opens them,
  for anyone with a staff role, campus leaders included.

## [2.10.27] - 2026-11-05

### Changed
- **Admins choose who else is an admin.** The Director and everyone in Data
  and IT are always admins. Anyone else on staff this year is an admin only
  once an admin adds them in Admin → Other → Admins, where you search by name
  or email, and they can be removed again (with a confirm). Being in People
  and Culture, Training and Development, or heading the Human Resources or
  Governance division no longer makes someone an admin by itself. Someone
  chosen stays an admin after 1 October as long as they're still on staff.
- **Insights is only for staff and campus leaders.** Someone signed in
  without a staff role (last year's staff and leaders, mostly) used to get an
  Insights tab with the General totals; it's gone, and the Insights link
  takes them Home.

## [2.10.25] - 2026-11-04

### Fixed
- **The web app moves onto a new release instead of showing "Something went
  wrong".** A tab left open from before a release used to fail the next time
  it opened a screen it hadn't loaded yet, because that screen's code had
  been replaced. The site now answers a request for old code with "not
  found" instead of the app's own page, and the app reloads itself once onto
  the new release and opens the screen you asked for. If the new release
  can't load either, you see "This part of The SHED couldn't load" with a
  Reload button, and it isn't retried in a loop.
- **Links to maps, websites, Instagram, email and phone numbers always do
  something.** On iPhone, a church's address or website could do nothing at
  all when iOS wouldn't open it. Web links now try again inside the app,
  addresses fall back to Google Maps, and if nothing can open you're told
  why, with the address, email or number to use instead.
- **A dropped connection shows a plain message.** Signing in, uploading a
  receipt or saving something while offline says to check your internet
  connection instead of "Failed to fetch" or "Network request failed".
- **The error log only lists real problems.** Almost every web page load
  logged a "Requiring unknown module" error even though nothing went wrong,
  and short network drops were logged as app errors. Neither is logged any
  more, and a screen that recovers by reloading isn't logged either.

## [2.10.24] - 2026-11-04

### Added
- **Admins can act as a department or role.** "Acting as", under your name
  at the top of the menu, picks All views (the default) or a role: the
  Director, the Budget Manager, or the staff or Head of any of this year's
  departments. The app then looks the way it does for someone in that role:
  their tabs, queues, badges and Waiting on you, and no Admin or
  Announcements unless the role has them (Mentoring stays only if you mentor
  someone yourself, since your mentees are yours). Acting as Marketing staff
  shows every design request, the Marketing queue and the Marketing forms
  waiting for review; Compliance staff see the Risk forms; Finance see every
  reimbursement. Acting as ordinary staff of a department shows only that
  department's event requests, with no All tab; Events staff, the reviewing
  teams and the Director see All. A chip at the top of the screen says who
  you're acting as, and tapping it goes back to All views. The choice is
  saved to your account, so it follows you to your other devices.
- **Acting as never lets you do more.** Approving, completing, editing,
  paying and commenting still go by your own roles; anything you can't do is
  shown read-only, and comment threads you can't add to say who can.

### Changed
- **Admins see every view by default.** On All views an admin sees the
  Marketing queue and every design request, every event request and every
  team's forms waiting for review, and every reimbursement queue, the All tab
  and the export, as
  Finance would. Badges still count only what's waiting on you, and unread
  comment badges only threads you're part of. Grievances stay with the
  grievance team.

## [2.10.23] - 2026-11-04

### Changed
- **Event Requests has a calendar with a tick, and the Calendar has the
  plain calendar.** Event Requests used the calendar icon, which looked more
  like a calendar than the Calendar tab's own icon did. Event Requests now
  shows a calendar with a tick in the side menu, the sidebar on wide screens,
  its empty and "not found" pages, the "Make an Event Request" button and the
  "Waiting on you" card on Home. The Calendar's bottom tab and its side menu
  entry take the old Event Requests calendar.
- **Insights sits at the bottom of the side menu, just above
  Announcements.** For staff it used to come second, under Profile; on wide
  screens it sat under Calendar. It now comes after Mentoring, with only
  Announcements and Admin below it, for everyone who has it in the menu.
- **Announcements is its own screen, like Insights.** Choosing Announcements
  in the side menu used to slide it in on top of the screen you were on, with
  a back arrow and no top bar. It now opens in place with the top bar, the
  bell and the bottom tabs, and the side menu shows it as the screen you're
  on. An announcement still opens on top, and going back from it lands on
  Announcements, even after reloading the page in a browser. Links to
  `/announcements` and to an announcement in pushes, emails and the bell keep
  working.

## [2.10.22] - 2026-11-04

### Added
- **Reimbursements have a Past tab.** Your requests from earlier staff years
  used to sit under Mine, below this year's, in a "Past requests" list. They
  now have their own tab, right after Mine, newest first with a divider for
  each staff year. It opens with the ten most recent and loads the next ten
  as you scroll near the end, with a spinner while they load and a line
  saying how many there are once you reach the last one. Cards work as they
  did: tap one for its details, timeline and comments, and the notes about
  deleted receipt files show above the list. A declined one now has the
  Resubmit button too, which opens a new request on Mine filled in from it.
  The tab only shows for someone who has a request from an earlier year.

### Changed
- **Mine is this staff year's requests.** Last year's requests that aren't
  paid or declined yet stay on Mine as before, and move to Past once they
  are. With nothing this year, Mine says so and has a button to see
  past requests.
- **A link to an earlier year's request opens Past.** A notification or
  email about a comment on an older request opens the Past tab with that
  request on top, opened up, and its comments showing when the link was for
  a comment.

## [2.10.21] - 2026-11-04

### Added
- **A comment still unread a day later is in the morning reminder.** Each
  design or event request comment goes in once, to the requester, the form's
  submitter and approver (the Marketing Head for a design request) and anyone
  else who has commented there and still can, by notification, push and email.

### Changed
- **Event requests stay with staff.** Campus leaders still can't see them,
  and who sees what is unchanged: the requester's department sees its own
  (Mine), and the Events department, the reviewing teams, the Director and
  admins see every event (All). Unread comment counts only show for people
  who can comment on that thread.
- **Only the requester and the Marketing team see design requests.** Admins
  no longer see the Marketing queue or other people's design requests.
- **Event and design request cards are easier to scan.** They show the
  request's name with no number or year, and "Edited" and the status at the
  top right next to the name, with the whole card outlined in the status's
  colour and no arrow on the right. Event cards spread Marketing, Risk and
  Finance left, middle and right, a little bigger, and no longer say "Waiting
  on you" (To review shows that, with its count). Design cards say when the
  request was submitted.
- **History reads newest first, as a timeline.** Event request, design
  request and reimbursement histories put the latest step at the top, joined
  by a line, with more space for longer gaps and how long each gap was ("3
  days earlier").
- **Design request emails and notifications name what was asked for.** They
  say "Design request: Booklet" instead of "Design request #4 (2027)". Event
  request reminders, PDFs and file names drop the number too.

## [2.10.20] - 2026-11-03

### Changed
- **A new Other event or SOW event starts at the nearest half hour and runs
  two hours.** New events used to start at 5 pm today and end at 7 pm. They
  now start at the half hour nearest the current time (1:37 pm becomes
  1:30 pm) and end two hours later, running into the next day when it's late
  in the evening. New weeklies still start a week after the campus's last
  weekly, on the same day and at the same times.

### Fixed
- **Switching a new weekly to "Other event" moves it back to today.** The
  date and times used to stay on the campus's weekly day, such as next
  Wednesday at 6:30 pm. Times you've changed yourself are kept when you
  switch.
- **A new weekly after one that ran past midnight ends the next day.** Its
  end used to land before its start (11 pm to 1 am on the same day), so it
  couldn't be saved without fixing the date.

## [2.10.19] - 2026-11-03

### Added
- **Swipe the Calendar to change month or week.** Swiping the month grid
  left goes to the next month and swiping right goes to the previous one;
  in the week view the same swipe moves a week at a time. It does exactly
  what the arrows beside the title do, including which day is picked. The
  calendar follows your finger a little while you swipe, a short or mostly
  up-and-down drag still scrolls the page or the hours, and the filter chips
  below keep scrolling sideways as before. With Reduce Motion on, the month
  changes without the slide.
## [2.10.18] - 2026-11-02

### Changed
- **Roll call lists the 50 people most likely to come, and the search finds
  everyone else.** "Not signed in" used to list the whole pool, about 1,400
  people. It now lists the 50 most likely to come, staff and members
  together, in the same order as before, and its count is how many of them
  haven't signed in yet. Typing in the search still filters that list and
  also looks up everyone else, members by a word of their name and staff by
  name, email, role or campus, so anyone can still be signed in. Someone
  signed out stays listed for the rest of the visit. Self check-in's
  "Similar names" and its "Who is it?" search look through everyone the same
  way. App versions before 2.10.18 still get the whole list.
- **Attendance reads much less from the database.** The roll call's list
  reads about 50 KB instead of about 430 KB, and each page of the Members
  tab about 60 KB instead of about 470 KB: its default A to Z view now reads
  one page at a time, with the total kept as a stored count. Searching,
  filtering or sorting the Members tab by a field still reads everyone, but
  only looks up photos for the rows on the page. Insights roles are read for
  the people shown instead of a whole campus at a time.

## [2.10.17] - 2026-11-02

### Changed
- **Attendance only loads the tab you are looking at on phones.** Opening
  Attendance used to load Events, Members, Tags, Metadata and Audit all at
  once, so every visit pulled the full members list (about 440 KB of database
  reads) even when you only wanted the roll call. Each tab now loads the
  first time you swipe or tap to it, and the next tab starts loading as you
  swipe towards it, so nothing shows up blank. The same applies to the Home,
  Reimbursements, Design Requests and Grievances tab strips.
- **The Members list loads 60 people at a time instead of 30.** Each page
  costs the same database read, so a scroll through the list now takes half
  as many.
- **Home's "Waiting on you" card no longer scans every open reimbursement for
  people who cannot approve any.** Staff who are not a Head of Department,
  the Budget Manager, a Director or a delegate (this staff year or last)
  skip the reimbursement queue check, cutting that card's database reads
  from about 160 KB to 9 KB per load. Approvers see exactly what they saw
  before.

## [2.10.16] - 2026-11-02

### Fixed
- **Last year's grievance team is asked to hand over by 31 December.** From
  1 October, someone whose grievance role was last year's keeps seeing and
  handling grievances until 31 December, the same grace every role has over
  the rollover, but new grievances and "Give to" only go to this year's
  team. Submitted now shows them a notice saying when the access ends and
  how many open grievances they're looking after, and on 1 December anyone
  still looking after open grievances without a role on this year's team is
  emailed and pushed to give them to the team or resolve them.
- **Grievances sent signed out with your email no longer block you signed
  in.** The "three an hour" limit counted grievances sent signed out with an
  address against that address's signed-in account too, so someone could
  stop a staff member raising one. Signed-in and signed-out sending now each
  have their own three an hour.
- **Changes reach the shared Google Calendar after Google has a hiccup.** A
  copy to Google that failed was never tried again, and an edit made while
  it was being written was lost with it, so Google kept the old details
  until the next change. A failed copy is now tried again after 1, 5 and 30
  minutes with the latest details, and an edit that arrives mid-copy is
  written again a minute later in case that copy never finishes.
- **An event's end can't be set before its start.** The end's date and time
  pickers start from the start, in event requests, the Calendar's entries
  and Attendance's events. A request ending at the minute it starts, which
  could be approved but never went on the Calendar, is refused.
- **Small wording fixes.** The Calendar's filter chips read "3 events" to
  screen readers instead of "3 people"; the grievance team's notice for a
  resolved grievance says "resolved it" instead of "closed it"; "Grievance
  not found" names the grievance team's departments as set in Admin instead
  of always People and Culture and Compliance; and a calendar event made
  from an event request says "Event request", not "Calendar only", for
  people who can't open the request, and a deadline doesn't say "Calendar
  only" at all.

### Changed
- **Past requests are one list.** Under Reimbursements' Mine and Reviewed
  (and All, Design Requests and Event Requests), requests from earlier staff
  years are one "Past requests" list, newest first, loading more as you
  scroll, instead of a section per staff year. The notes about receipt
  files show once, above the list.
- **Shorter explanations.** The deadline's description in the Calendar's
  Add and Edit sheets is gone, and the explanations on Home's grievance
  card, Admin's grievance team and step timing cards, the form options
  sheet, the Calendar's "Take attendance" step, the "Grievance sent" screen
  and the event request's attendance box are a sentence each.

## [2.10.15] - 2026-11-02

### Changed
- **The Calendar uses the whole width of a phone.** The month and the week
  run edge to edge instead of sitting in a padded card, so each day is about
  a quarter wider and more of each event's name fits: a week's day goes from
  about 41 to 50 points on an iPhone. Wider screens keep the card.

## [2.10.14] - 2026-11-01

### Added
- **A week view on the Calendar, like Google Calendar's.** Switch between
  Month and Week at the top. The week shows the hours down the side and
  each event where it happens, side by side when they overlap, with events
  running over several days and all-day deadlines in a strip along the top
  and a red line at the time now. Tap an event to open it, or tap an empty
  hour to add something then with the time filled in. The Calendar remembers
  Month or Week on each phone or browser, and `/calendar?view=week` opens
  the week.
- **Deadlines for things that are due or going out.** "Add Event" has Event
  and Deadline: a deadline is a name, a day and, if you like, a time, with
  no end, for things like applications closing or a post going live. It
  shows with a flag on the month, the week and the day's list ("Due
  11:59 pm", or "Due all day"), and can be turned back into an event. The
  shared Google Calendar gets it as an all-day event, with any time in its
  title.
- **Event requests can take attendance, and go on the Calendar once
  approved.** The event form has a "Take attendance at this event" box. When
  every form is signed off, an event that takes attendance becomes an SOW
  attendance event; one that doesn't becomes a calendar event. Each links to
  the others: the request has "Attendance" and "On the Calendar" buttons, the
  roll-call says "From an event request", and the calendar row opens the
  request. They follow the request: editing its name or times moves them,
  ticking or unticking attendance swaps one for the other, and cancelling
  removes them, except an attendance event someone was signed in to.

### Changed
- **Adding to the Calendar is simpler.** An entry is an Event or a Deadline,
  with no Category or Where. Ticking "Take attendance" asks where it's held,
  then carries on in Attendance's event form for its tags, whether it's a
  weekly and any other campuses; an existing calendar event can be switched
  to take attendance the same way, and becomes that attendance event. An
  attendance event's calendar category now comes only from its tags (TWIG,
  PPN), its term (Weekly) and where it's held (Campus or SOW event), so
  Attendance's "Calendar category" picker is gone.
- **Calendar takes Insights' place in the bottom bar.** For staff and campus
  leaders the bottom bar is Home, Attendance, Calendar, Org Chart and
  Grievances, and Insights moves to the side menu (it stays in the sidebar on
  wide screens). Signed in without a staff role, Insights is still a tab.
  Signed out, Insights isn't shown at all and a link to it opens Home, so the
  public General numbers and "Sign in to view more" are gone.
- **Events running over several days are one bar across the Calendar.** A
  camp or retreat is a single bar from its first day to its last instead of a
  separate row on each day, so it's easy to spot and its name has room. It
  carries on along the next week's row when it runs past Sunday, and busy
  days still end with "+N more".
- **Weeklies and campus events wear their campus's colour.** A Weekly or
  Campus event held at one campus is coloured like that campus everywhere
  else in the app (USYD red, UNSW green, UTS blue, MACQ yellow, ACU purple,
  WSU dark red) instead of the same blue or orange for every campus, and the
  "Where" chips double as the key. One held at several campuses keeps the
  Weekly or Campus event colour. The shared Google Calendar follows with the
  nearest of Google's colours once each event is copied again.
- **Send Grievance is at the end of the form** instead of pinned to the
  bottom of the screen.
- **Save and Cancel on Attendance's Tags and Metadata fade out** until
  something has changed.
- **The Calendar has one icon everywhere**: the bottom tab now uses the side
  menu's, so it isn't mistaken for Event Requests.

### Fixed
- **Deleting a calendar entry works on iPhone.** Tapping Delete in a calendar
  entry did nothing on iOS, because its "are you sure?" box couldn't open over
  the entry; it now opens on top of it, as it always did on web.

## [2.10.13] - 2026-10-31

### Changed
- **Dependency update from Dependabot**, with no visible change to the app:
  `convex-test` 0.0.65, used only by the backend tests.

## [2.10.12] - 2026-10-31

### Added
- **A Calendar of every SOW event.** Staff and campus leaders get Calendar in
  the side menu: a month where each day shows the start of its events' names
  in coloured rows, so you can tell them apart at a glance. Tap a day to see
  its events in full below; tap an attendance event to open its roll-call.
  TWIGs, PPNs, weeklies and campus and SOW events from Attendance all appear
  on their own. Chips show only some categories or campuses, and events
  running over several days show on each day with their dates. Today is
  ringed in the app's green.
- **Add things to the calendar, with or without attendance.** "Add Event"
  puts an entry on the day you picked, for things like marketing schedules,
  deadlines and timelines, with a category and notes; whoever added it, or an
  admin, can edit or delete it. Tick "Take attendance at this event" to make
  it an attendance event instead, so leaders can sign people in. Attendance
  events can also be given a calendar category in Attendance.
- **Copies to a shared Google Calendar.** Once the "SOW Events" Google
  Calendar is set up (see LAUNCH.md), every event and entry, and each change
  to them, is copied to it, and everyone at sow.org.au can add it to their own
  Google Calendar. Setting it up copies the past year's events and everything
  ahead. Changes made in Google don't come back to the app.

## [2.10.11] - 2026-10-31

### Added
- **Raise a grievance, and follow it until it's resolved.** Grievances is
  the fifth tab at the bottom of the app for everyone, signed in or not.
  Anyone can raise a grievance with SOW in confidence: what it's about, what
  happened, and optionally where, when, who was involved and what they'd
  like to happen. Only the grievance team sees it. Whoever raised it is
  emailed as it moves from submitted to in progress (with who's looking
  after it) to resolved with the outcome, or closed with a reason; signed
  in, they also follow it under Mine and get a push at each step.
- **The grievance team handles grievances in the app.** People and Culture
  and Compliance to start; admins choose the departments in Admin → Other.
  The team gets a push for each new grievance (nothing goes to an email
  inbox) and works on them under Submitted, listed by staff year. Open
  grievances move to the new staff year on 1 October. Anyone on the team can
  take one on or give it to a teammate, resolve it or close it as not
  proceeding, and edit the "What is it about?" options. Each grievance has a
  random reference only the team sees. The tab counts new grievances and the
  open ones you're looking after.

## [2.10.10] - 2026-10-29

### Fixed
- **CI's Expo SDK version check passes again.** Expo 58.0.21 and React
  Native 0.88.1, with Expo Router 58.0.28, Expo UI 58.0.25,
  expo-auth-session 58.0.16, expo-constants 58.0.14, expo-dev-client
  58.0.17, expo-file-system 58.0.13, expo-font 58.0.11,
  expo-image-manipulator 58.0.16, expo-linking 58.0.15, expo-notifications
  58.1.7, expo-sharing 58.0.21, expo-splash-screen 58.0.12, expo-system-ui
  58.0.7, expo-updates 58.0.19 and expo-web-browser 58.0.7: the Expo SDK 58
  patch releases, which CI's SDK version check now expects. No visible
  change to the app, but the native code changes, so phones get this
  release from the App Store and Google Play rather than over the air.

## [2.10.9] - 2026-10-29

### Added
- **Search and filter the Org chart.** A search box at the top finds people
  by name, email or role, or by the department, division or campus they sit
  in, so "finance" lists the Finance team and "unsw exec" lists UNSW's
  executives. Every word typed has to match. Below it, a chip for each
  division and campus (and Staff, in a year that has general staff) says how
  many people it covers; pick any number to see only those parts of the
  chart. A line under the chips counts who is showing, and "Show everyone"
  clears the search and the chips.

### Changed
- **Filter chips wrap on wide screens.** On an iPad or a computer, the chips
  on Churches and the Org chart now wrap onto another line instead of
  running past the edge of the column, where a mouse couldn't reach them.

## [2.10.7] - 2026-10-26

### Changed
- **Dependency updates from Dependabot**, with no visible change to the app:
  `convex` 1.48.0, `convex-helpers` 0.1.129, `jose` 6.2.13, `convex-test`
  0.0.64 and `expo/expo-github-action` 9.0.1 in the EAS workflows.
- **Backend tests follow convex-test's real-backend clock.** convex-test now
  pins `Date.now()` per transaction the way Convex does, which can land one
  millisecond after a frozen test clock, and keeps a stored file's content
  type. Nine tests that expected the old behaviour now allow for it.

## [2.10.6] - 2026-10-26

### Added
- **Filter the Events list by tag and by host.** A filter button next to the
  create button opens a sheet where you can pick any number of tags, from
  both the Weeklies and Other events lists, and choose whether to see events
  this campus hosts or ones another campus shared with it. Picking several
  tags shows events with any of them. The button shows how many filters are
  on, a line above the list says what they are, and Clear (on that line, in
  the sheet, or under "No events match") turns them all off. The filtering
  happens on the server, so it covers every event, not just the ones already
  loaded.

### Changed
- **Create event is now a round + button** in the bottom corner, beside the
  new filter button, instead of a full-width bar. Screen readers still
  announce it as "Create event".

## [2.10.5] - 2026-10-26

### Changed
- **Tooling updates from Dependabot**, with no change to the app itself.
  Playwright, which drives the CI web sweep, moves from 1.58.2 to 1.64.1, and
  the sweep's screenshot upload uses `actions/upload-artifact` 7.0.2.
  Dependabot no longer proposes `react-native-pager-view` updates: the Expo SDK
  sets its version, and CI's `expo install --check` rejects any other.

## [2.10.4] - 2026-10-23

### Added
- **A command-line tool for adding mentoring pairings**
  (`mentoring:setPairings`) in any staff year, including past years the app
  can't change. It checks each pair the way the Mentoring screen does, finds
  an external mentor by name or adds them, records the admin who asked for
  the change, and saves nothing if any pair fails.

## [2.10.3] - 2026-10-23

### Added
- **Each year keeps its own role titles.** A year's role list can say what an
  app role was called that year, and the org chart, profile history, Admin's
  Users list, mentoring and the side menu show that year's title. 2019 and
  2020 called Head of Department "Department Overseer", and they will again
  once the history fix below runs. A rename in a later year never changes
  earlier ones.
- **A command-line tool for correcting past years**
  (`history:setRoleTitle`, `history:setPastAssignments`), since Admin only
  edits this year and next. It refuses both of those years.

### Changed
- **Long role titles wrap onto a second line on the org chart** instead of
  being cut off.

### Removed
- **The one-off mentoring import from the old app.** It ran against
  production on 2026-10-23 (24 pairings copied in).

## [2.10.2] - 2026-10-23

### Changed
- **The roll call puts the people most likely to come at the top of "Not
  signed in".** Each person is scored from the last 180 days of sign-ins,
  newest counting most (a sign-in's weight halves every 45 days), with the
  most weight on the same campus's weeklies, then shared groups and tags,
  plus a bonus when their campus is one of the event's. Replayed over every
  2026 event, 31% of returning people were in the top ten of the list when
  they signed in (12% before) and the typical person sat 21st, not 75th. The
  old order only looked at the current staff year's latest 60 events, so it
  started from nothing every 1 October.
- **Each event's order is worked out ahead of time, not on every load.** It
  is ranked when the event is saved within a week of starting (or up to 30
  days after), and nightly for events on now or in the next week; it is
  not ranked again unless a new event, sign-in, or the event's date, groups,
  tags or weekly mark changed, and it is only rewritten when the order
  actually moves. Renaming an event, or moving its end time, ranks nothing.
  Opening the roll call reads a 7 KB stored order instead of the history
  snapshot; on dev, a past event's roll call dropped from 1.26 MB to 402 KB
  a load. The nightly rebuild reads about 60 KB on a quiet night and writes
  nothing, with a full re-read every two weeks.

## [2.10.1] - 2026-10-23

### Added
- **Mentoring, in the side menu.** Admins (the Human Resources division
  among them) pair each Campus leader with a mentor for the staff year: a
  leader who isn't a Campus leader, or an external mentor such as a pastor.
  Pairings has a list per year with search, and "+ Add pairing" picks the
  Campus leader (anyone already paired is greyed out with their mentor's
  name), then the mentor. Tap a pairing to change the mentor or remove it.
  Only this year and next can change; earlier years are read-only, and
  pairings never carry over. A pairing whose mentee is no longer a Campus
  leader, or whose leader mentor has left or become a Campus leader, is
  flagged.
- **External mentors.** A reusable list with name, email, phone and notes,
  on its own tab or added straight from the mentor picker. Saving blocks a
  second mentor with the same email, warns about a matching name, and warns
  when the email belongs to a leader (pick them under Leaders instead).
  Someone named in any pairing can't be deleted.
- **Mentors see their mentees.** A leader mentoring someone this year gets
  Mentoring in their side menu, listing just their own mentees with role,
  campus and email. Admins who mentor get it as a "My mentees" tab.
- **Pairings from the old app.** `scripts/import-mentoring.mjs` copies the
  old SHED app's mentees into Mentoring, matching people by their old id or
  email. A mentor with no profile that year becomes an external mentor, a
  mentee with no profile is listed and skipped, and re-running never
  overwrites a pairing changed here. It runs once against production and is
  then removed in a later release.

### Changed
- **Requests fold into one group in the side menu.** Reimbursements, Event
  Requests and Design Requests sit under a collapsible Requests item, so the
  menu stays short. It starts closed, opens by itself on any of those pages,
  shows their combined count while closed, and remembers being open or
  closed on the device.
- **A changed email carries its mentoring with it**, like approver
  delegations do, when someone signs in under a new address.

## [2.10.0] - 2026-10-22

### Removed
- **Server code kept only for app builds older than 2.9.25.** 2.9.25 becomes
  the minimum app version (see LAUNCH.md for the release order), so these
  go:
  - the old bell list (`notifications.list`; the paged feed replaced it in
    2.9.18);
  - `requests.reviewedInYear`, `designRequests.years` and
    `eventRequests.years`, and the unused `year` argument on Mine,
    Finance's All requests and the event and design Mine lists (2.9.15
    replaced the year pickers). `requests.requestYears` now returns only
    `reviewedBefore`, the one field the app reads;
  - the Insights charts that drew Overall as a third bar for apps that
    didn't ask for lines (2.9.8); `lines` is still accepted;
  - check-in's `campuses` field (2.9.25 reads `universities`);
  - the "newer pages" links (`NEWER_PAGES`, the `#app` marker, tailored
    email links and the bell's link filter), which only ever covered
    `/checkin`. The web still keeps `/checkin` to itself.
- **`events.attendanceCount` leaves the schema.** Head counts have lived in
  `eventAttendanceCounts` since 2.9.29, and no event on prod or dev still
  has the old field. `attendanceCounts:backfill` stays as a recount.
- **The 2.9.9 one-off `renameNotesField`.** Prod already had "Other
  Information"; dev was renamed before this release.
- **Server one-offs nothing calls:** `admin:ensureUniversity`,
  `admin:removeUniversityRow`, `admin:fillTagScopesWithAllGroups`,
  `admin:nameStaffProfilesFromEmail`, `admin:stripAssignmentsInProfiles`,
  `memberRepair:capitalizeMemberNames` and `notifications:unreadCountFor`.
  No screen, script, workflow or 2.9.25 to 2.9.29 build uses them.
- **Code comments**, in every TypeScript, JavaScript and YAML file. Lint,
  type and test directives stay, and so do the version tags on pinned
  GitHub Actions. Also gone: the unused `Chip` component, a second copy of
  `ALUMNI` and two menu helpers that only renamed `showsReimbursements`.

### Changed
- **Less explaining on screen.** The self check-in sheet opens straight to
  its button, the check-in page drops the line under each result and the
  note under the form, and the sheet's waiting list loses its prompts.
  Elsewhere, the email-reminder toggle, Suggested Merges, Role, receipt-file
  notices, the contact form, the finance form and admin's year and delegate
  notes keep one short sentence or none.
- **Expo SDK 58 patch updates** (`expo` 58.0.17, `expo-updates` 58.0.18,
  `expo-router` 58.0.25 and eight more), which CI's dependency check now
  asks for. They change the app's runtime fingerprint, so 2.10.0 reaches
  phones as a store update rather than over the air.
- **The church map on iPhone is Apple Maps, and the iPhone app is about 10 MB
  smaller to download** (an estimated 36 MB to 26 MB; 13 MB less once
  installed). Google's map library for iOS was about two thirds of the
  app's own code, and Apple encrypts app code before compressing the
  download, so it barely shrank. The pins, names and tap-to-open work as
  before on Apple's muted map, which needs no key. Android and the web keep
  Google Maps (`docs/adr/0013-apple-maps-on-iphone.md`).
- **Church pins on Google Maps stop redrawing on every frame.** Google Maps
  turned each custom pin back into an image on every frame while the map
  moved, the likely cause of the map's lag on iPhone up to 2.9.29 (Apple
  Maps pins are plain views, so 2.10.0's iPhone map doesn't do it). A pin
  now draws for its first half second and again only when it changes
  (picked, renamed, resized, recoloured or the theme flips). On Android this applies
  to builds with a Maps key; production has none yet, so it shows no map.

## [2.9.29] - 2026-10-21

### Changed
- **Signing someone in no longer makes every phone on that roll call fetch
  the whole sign-in list again.** Each event's head count used to live on the
  event itself, and the roll call's list of everyone (about half a megabyte
  from the database) reads the event, so every sign-in reloaded it on every
  phone showing that event. The count now lives beside the event, so a
  sign-in updates the count and the signed-in list and nothing else. This
  was about half of production's database reads (see
  `docs/convex-reads-2026-10-21.md`).
- **A campus's roll call works out people's Roles from that campus's
  weeklies.** Someone who comes to weeklies at two campuses shows the Role
  from the campus whose roll call you're on (from both, at a joint event).
  The Members list and org-wide events still weigh every campus. Reading one
  campus's categories instead of all of them makes each refresh of the
  signed-in list about half the size.
- **The audit log's filters read less.** "Performed by" lists whoever made
  the latest 200 entries (it was 1,000), and "Event" lists the last 40 events
  that have started plus any event those entries mention.
- **Checking a new member's name against existing ones reads only the
  matching names.** When no one has exactly that name, the different-case
  check searches names instead of reading every member.
- **Insights' campus weeklies chart counts each weekly from its stored head
  count** instead of reading every sign-in of every weekly each night.
- **The nightly Insights, attendance metrics and church map runs can be
  paused on a deployment** by setting `NIGHTLY_JOBS_PAUSED=true` (meant for
  the shared dev deployment). Running them by hand still works.

## [2.9.28] - 2026-10-21

### Fixed
- **Android opens The SHED for theshed.sow.org.au links from Google Play
  installs.** Google Play re-signs every app it installs with its own key,
  and `assetlinks.json` only listed the keys EAS builds with, so Android never
  trusted the site for store installs. Both files now list Play's app-signing
  key too (The SHED on the production web, The SHED Staging on the dev web).
  Phones pick it up the next time the app installs or updates.

## [2.9.27] - 2026-10-21

### Fixed
- **Buttons are announced as buttons.** The app's standard button never told
  screen readers what it was: on the web it was a plain box with no button
  role, and VoiceOver and TalkBack read only its text. It now has the button
  role, its title as its name (without the icon), and says when it is
  disabled or busy.

## [2.9.26] - 2026-10-21

### Fixed
- **Android app links name the key the app is really signed with.**
  `assetlinks.json` listed a keystore EAS made in June but never built with,
  so Android never trusted the site and every link opened Chrome. It now lists
  the keystore EAS signs with (the staging file lists the staging app's own).
  Phones that install from Google Play also need Play's app-signing key added
  (see LAUNCH.md).
- **Signing in on the website from a phone with the app installed stays in
  the browser.** Since 2.9.25 every `theshed.sow.org.au` link opens the app,
  including the address Google sends you back to after signing in on the web,
  so the app opened and the web page never got the sign-in. The web sign-in
  now comes back with `#noapp`, and both association files leave any link
  carrying a sign-in `code` in the browser.
- **Android 15 and later keep `#noapp` links in the browser too**, through
  the same rules in `assetlinks.json`. Older Android can't skip a link by its
  `#` or `?` part.

## [2.9.25] - 2026-10-21

### Added
- **Leaders are signed in as soon as they open a check-in link in the app.**
  Scanning an event's code with The SHED installed now opens the app instead
  of the browser, and a signed-in leader is signed in to the event straight
  away, with Undo and a button to the roll call. People without the app still
  get the web page.
- **Phones remember who checked in.** The check-in page fills in your name,
  university and year from last time, in the browser and in the app, and
  works your year out again next year. "Start fresh" clears it, and checking
  in someone else doesn't overwrite it.
- **Returning people skip the wait.** Once a leader has matched someone's
  first check-in to a member, the same phone signs them straight in at later
  events, with an Undo in case someone else was using it, which also stops
  that phone doing it again. The open page also changes to "You're signed
  in" as soon as a leader confirms.
- **Year at uni on the check-in page.** Optional, like university, and a new
  member made from a check-in gets both.

### Changed
- **The waiting list on self check-in is split in two.** Matched people come
  first with a one-tap tick and "Sign in all", and "Someone else" in case the
  match is the wrong person with the same name. Below them, people who need a
  member show members with the same or a similar name to tap, plus Find
  member and New member.
- **Check-ins keep the time people checked in.** A sign-in confirmed later
  now records when they scanned, not when a leader got to it. Whether a
  sign-in can still be removed after an event goes by when it was added, so
  one confirmed late can still be undone straight away.
- **Turning off self check-in asks first**, because the code and link stop
  working and turning it on again makes a new code.
- **University is optional on every event**, and an event for the whole
  organisation offers every university instead of none.

### Fixed
- **Links open the app on iPhone and Android.** The production website never
  published the files that tell phones the app may open its links, so every
  link (emails included) opened in the browser first. They're published now.
- **Deleting an event deletes its self check-ins too**, instead of leaving
  them behind with nothing to point at.
- **A shared check-in link opens the check-in page on iPhone.** Share link
  on an event's self check-in handed iOS the link twice, so Copy, Messages
  and the rest gave "link link", and opening it showed "Page not found". It
  now shares the link once. The QR code was never affected, and Android
  already shared it once.

## [2.9.24] - 2026-10-21

### Fixed
- **Android production builds work again.** Since 2.9.19 the Android store
  build stopped in the "Configure expo-updates" step with a runtime version
  mismatch: the build server counted the Firebase settings file and its own
  generated native folder in the app's fingerprint, and GitHub's runner,
  which can't see either, did not. A fingerprint config now leaves them out,
  so both sides agree and over-the-air updates reach Android too. iOS is
  unaffected.
- **Notifications asks you to sign in when you're signed out.** Opening it
  signed out showed a spinner that never stopped (since 2.9.18). It now shows
  the usual sign-in prompt, and comes straight back after you sign in.

## [2.9.23] - 2026-10-20

### Fixed
- **Development builds from before 2.9.19 open again.** The update banner
  loaded the over-the-air update library at startup, and on a build without
  its native part the whole app stopped with "Cannot find native module
  'ExpoUpdates'". The banner now checks for it first and simply doesn't show
  when it's missing. Store builds of 2.9.19 and later already have it, so
  nothing changes for them.

## [2.9.22] - 2026-10-20

### Fixed
- **Event names no longer break mid-word on phones.** On an event's
  attendance page the date and the Edit, check-in, export and count buttons
  sat beside the title, leaving it a narrow column, so a name like "Missions
  Commissioning Night" split into six pieces. On screens narrower than about
  600 points they now sit on their own row under the title, which gets the
  full width. iPad and desktop keep the layout they had.

## [2.9.21] - 2026-10-20

### Fixed
- **A reimbursement is only visible to the people on it.** Anyone with a
  staff profile who had a request's link could open it, with its history,
  decline reason, amount paid and comment thread. Now only the requester,
  Finance staff, the approvers on its chain (and whoever covers for them),
  and anyone who has already acted on it can see it. Everyone else gets
  "Request not found". Receipt files keep their existing, narrower rule.

## [2.9.20] - 2026-10-20

### Changed
- **The staging app has a dark icon.** The SHED Staging now shows a cream
  logo on dark green, the reverse of the store app, so the two are easy to tell
  apart when both are installed. The store app's icon is unchanged.

## [2.9.19] - 2026-10-20

### Added
- **Self check-in at events.** The QR button on an event shows a code people
  scan to check themselves in: they type their full name and pick their
  campus, and never see the member list. Each check-in waits on the event for
  a leader to confirm it, matched to the member with exactly that name or
  added as a new member, then counts like any other sign-in. The code works
  from two hours before the event until ten minutes after it ends.
- **Members who may be the same person.** Admin, Merges now also lists pairs
  of members with a similar name on the same campus who have never been at
  the same event, with Merge and Not the same. The list is rebuilt every night.
- **Updates without the App Store.** From this version, fixes that don't
  touch native code reach phones a few minutes after they ship. A banner says
  when one is ready and offers a restart.
- **App errors on Admin.** When a screen crashes or something fails without
  being caught, the app reports it. Admins see each error once, with how often
  it happened, where and on which version, under Admin, Other.
- **Receipts and photos are backed up.** The nightly backup now also copies
  every uploaded file to Google Cloud Storage, once each, and keeps them after
  the app deletes old receipts on 30 September.

### Changed
- **Checks that run without anyone watching.** Every pull request opens every
  screen in a browser as four kinds of user and fails on a crash. The nightly
  warehouse load checks itself against the night before, and a weekly job
  warns in Google Chat before a Convex usage limit is reached.

## [2.9.18] - 2026-10-20

### Added
- **A request's timeline.** The clock button on a reimbursement now opens a
  timeline instead of a bare audit list: each step from submitted to paid with
  the person's name and the Sydney time, the gap between steps ("3 days
  later"), what the request is waiting on now and for how long, how many
  reminders have gone out for that wait, and how long submitted-to-paid took
  once it is paid.
- **Who has seen an announcement.** An announcement's page shows admins
  "Seen by 42 of 84" with a bar, and lists who hasn't seen it yet. Someone
  counts as having seen it once they open it, or open their notifications
  after it arrived.

### Changed
- **Notifications load as you scroll.** The bell showed your newest 50 and
  stopped; anything older was gone for good. It now loads 30 at a time as you
  reach the bottom, with a Show earlier button when the list is too short to
  scroll, so every notification you were ever sent is reachable.

## [2.9.17] - 2026-10-20

### Changed
- **A smaller app on both platforms.** The app shipped 21 icon fonts (4 MB)
  and used one of them. It now ships only that one, and the nudge button's
  pointing hand is drawn from the same set. Downloads and updates are a few
  megabytes smaller; nothing else changes.

## [2.9.16] - 2026-10-20

### Changed
- **Android release builds are shrunk and obfuscated again.** R8 code
  optimisation was turned off in 2.9.7 because a release build crashed on
  launch (it had stripped a class the WorkManager database loads by name).
  It is back on with keep rules for those classes, so the app is smaller and
  the next store build should clear Google Play's code optimisation warning.
  No change to how the app looks or works.

## [2.9.15] - 2026-10-19

Past years' requests no longer sit behind a year picker: every request list
that looks back now carries on into earlier years as you scroll.

### Changed
- **Earlier years load as you scroll.** Reimbursements (Mine, Review and All),
  Design Requests (Mine and All) and Event Requests (Mine and All) show this
  year as before, then last year's requests, then the year before, newest
  first, each year under its own heading. More load as you reach the bottom,
  the way Attendance's Members list does, and a Show earlier button appears
  when the list is too short to scroll.
- **Review keeps everything you've reviewed.** Below the requests waiting on
  you and the ones you reviewed recently, Review lists every other request you
  approved or declined, under the staff year it was made in, most recently
  reviewed first.
- **All (Reimbursements) puts earlier years' completed requests under
  Completed**, after this year's. Earlier years' receipt-file warnings sit
  under each year's heading on Mine, Review and All.
- **The year pickers are gone** from Reimbursements, Design Requests and Event
  Requests.
## [2.9.14] - 2026-10-19

Fixes for regressions found reviewing 2.9.9 to 2.9.12: tabs that moved under
you, reminders that missed someone, a badge that blinked, and photos that
showed initials first.

### Fixed
- **Reimbursements and Design Requests open on the right tab and stay
  there.** The tab you land on (Review, or the Marketing queue, when something
  waits on you and nothing of yours needs action; Mine otherwise) is decided
  once when the screen opens. Before, approving the last item in Review threw
  you back to Mine, and a request arriving while you sat on Mine pulled you
  over to Review.
- **A linked request always shows.** Opening a request from a notification
  while All was switched to Completed left the filter on Completed and hid an
  ongoing request; the filter now follows the link.
- **Personal accounts are asked to use their SOW account on Reimbursements
  too.** A personal Google account arriving from a link was told "No role or
  department is assigned ... yet"; it now gets the same message as Event and
  Design Requests.
- **A form sent back for changes chases whoever submitted it.** The reminder
  went to the requester and the department Head only, so a department member
  who filled in and submitted the form was told once and never reminded.
- **One morning digest per person**, even when they are reached under both
  staff address spellings (sow.org.au and sowaustralia.com).
- **The app icon badge no longer blinks to zero on launch** before your
  notifications have loaded (iOS).
- **New events store their attendance count from the start**, so the event
  list never has to count sign-ins for them.
- **Photos show straight away on first launch.** A face downloading into the
  app's cache showed initials until it landed; it now shows the web copy
  meanwhile.
## [2.9.13] - 2026-10-19

### Changed
- **Profile photos are made small on your device before they upload.** A
  new photo is resized to 512 pixels on its longest side and saved as a
  JPEG (or a PNG, when the picked file is one, so see-through areas stay
  see-through) before it leaves the phone or browser, so it uploads in a
  moment and any photo works, however big. The "Image is too large" message
  is gone, and an animated GIF becomes its first frame. The web app has this
  now; phones get it with the next store update.

### Fixed
- **A very large photo no longer stops the server from shrinking it.** Photos
  from 24-megapixel phone cameras used up the server's memory and stayed full
  size. The server now checks a photo's size before opening it and leaves
  anything it can't fit (above about 10 megapixels) as it is, with a warning
  in the logs.

## [2.9.12] - 2026-10-19

The app reads far less from the database and downloads photos once instead
of on every launch, to stay inside Convex's free plan (database reads were
about five times the monthly allowance halfway through the month).

### Changed
- **Profile photos download once.** On phones each photo is saved in the
  app's cache the first time it shows and loaded from there afterwards, so
  opening the app or the org chart no longer fetches every face again.
- **Uploaded profile photos are shrunk to 256 pixels.** A photo over 64 KB
  is turned the right way up and saved as a small JPEG a moment after it is
  uploaded. It looks the same in the app's small circles at a small fraction
  of the size. Photos uploaded before this release are shrunk once after it
  ships.
- **Insights, General updates overnight.** Staff numbers, turnover and tenure
  are worked out each night with the rest of Insights, so a profile change
  shows there the next morning.
- **Roll-call keeps last night's ordering.** Who comes first on an event's
  roster (people who came to similar events, then the campus, then how often
  they come) is worked out each night instead of every time the roster opens.
  Sign-ins from earlier today count from tomorrow.
- **Audit filters load when you open them**, with the people and events from
  the latest activity at that moment, instead of following every sign-in
  live.

### Fixed
- **The Events list no longer re-reads every sign-in on each tap.** Each
  event keeps its signed-in count, updated when someone signs in or out, so
  taking roll call stops making everyone's Events list recount the 20 events
  on screen.

## [2.9.11] - 2026-10-19

Reminders for every kind of request, in one morning message, and what is
waiting on you on Home.

### Added
- **Design requests and event forms get reminders too.** A design request
  waiting on the Marketing Head, or approved and still to finish, and an event
  form not submitted, waiting for approval or sent back for changes, are
  chased the way reimbursement requests always were: after a day with no
  movement, then three days later, then weekly. Design reminders say when the
  design is needed by; event form reminders say how far off the event is. The
  Marketing team hears about approved designs in the app, with one email to
  the Marketing inbox.
- **One message a morning, not one per request.** Everything waiting on you
  (reimbursement requests, design requests, event forms) arrives as a single
  notification, push and email that lists each item and opens the page in
  question, or Home when more than one kind is waiting. Nobody with nothing
  waiting hears anything. Weekends are not skipped.
- **Home shows what is waiting on you**: requests to approve, receipts to
  attach, payments to make, design requests to approve or finish, event forms
  to review or fill in, each a tap away.
- **Step timing on Admin, Other** (admins and the Finance Head): for the
  chosen year, how long each step waited before someone actioned it, the
  typical and longest wait, and who actioned it most, across reimbursements,
  design requests and event forms. It reads the audit trail, so past years
  count too.
- **The app icon shows your unread notifications** and clears once you have
  read them (on iOS; Android keeps it in step while the app is open, on
  launchers that show badges).
- **Reminder emails can be turned off on your Profile.** The notification and
  push still arrive.

### Changed
- **Review, the Marketing queue and To review show how long each item has
  waited** ("Waiting 6 days", in orange from a week) and list the longest
  waiting first.

## [2.9.10] - 2026-10-18

Every screen walked again on latest main, as every kind of user (signed out,
personal account, campus leader, staff, Marketing, heads of department, the
Budget Manager, Finance Head, Director and an admin), on web and the iOS
simulator. Fixes for what that turned up, and a few places that now show
instead of tell.

### Fixed
- **Pages opened from a link while signed out no longer spin forever.**
  Profile, New Design Request and New Event Request ask you to sign in, like
  every other page; Announcements and Admin ask too instead of saying only
  admins can use them; an event link says "Sign in to see this event", not
  "Event not found".
- **New Event Request no longer spins for campus leaders**, and neither page
  spins for a personal account: they say who the requests are for, as the
  list pages do. A personal (non-SOW) account is asked to use its SOW Google
  account instead of being told it has no role "yet".
- **Notifications and someone's profile could open with no back arrow** on a
  fresh launch (Expo Router 58 reads the stack before it has pushed the
  screen). Both now always have one.
- **A request link opens where the request is.** Finance staff land on All,
  on Ongoing or Completed as the request needs, with it expanded, instead of
  an empty Mine; a request you can't see says so instead of saying it was
  deleted.
- **Admin is a proper locked page** for people who can't use it, not a line
  of small text.
- "Reviewed (50)" on Review was the 50-row limit shown as a count; it now
  says "Latest 50 reviewed" when the list is cut off.
- Two old attendance pages nothing linked to any more (a campus's event list
  and a bare New event screen that made events with no date, weekly mark or
  tags) are gone.

### Changed
- **New Request shows who it goes to as you type**: HOD, Budget Manager,
  Director (from the threshold) and Finance Head, by name, with steps your
  own role skips marked. It replaces the sentence about Director approval.
- **Receipts you attach show a thumbnail** when they're images.
- **A design request shows its progress** as a step track (Submitted,
  Approved or Declined, Complete) with who and when, instead of lines of
  text.
- **Approvers open on the work waiting for them**: Review when a request
  waits on you and nothing of your own needs doing, and the Marketing queue
  for the Marketing Head.

## [2.9.9] - 2026-10-18

Past years' requests for everyone, and a Role that works itself out.

### Added
- **Staff can look back at past years' reimbursement requests.** The year
  picker Finance had on All is now on Mine and Review too. On Mine it shows
  your own requests from that year; on Review, the other people's requests
  from that year you approved or declined. Each only offers the years you
  made or reviewed a request in. A request counts in the year it was made,
  even when it was reviewed in the next. Review stays in the menu
  for anyone who has reviewed a request before, even if they approve nothing
  this year, so last year's Heads can still see what they signed off.

### Changed
- **A member's Role is worked out, not typed.** Staff and leaders show their
  staff profile's role. Everyone else is Regular, Irregular, Newcomer or
  Visitor from last night's Insights build of their campus's weeklies, or
  Member if they haven't come to one in the latest term or the one before.
  The edit sheet shows Role locked, with an info button that lists the rules
  and the campus's numbers. Leaders can still set **Visitor** (a friend, someone from
  a church) or **Alumni** by hand, the two Insights can't tell. Alumni marks
  are kept; anything else typed in before (Member, Newcomer, Guest, Student
  Leader on someone without a staff profile) no longer counts. The Members
  list, its Role filter and sort, and event rosters all use the worked-out
  Role, and leaving staff no longer writes Member onto someone's record.
- **Insights counts a hand-set Visitor as a visitor** wherever they come, and
  no longer treats a member typed in as Guest or Student Leader as staff or a
  leader. Every campus rebuilds its views once after this release.
- **The member field Notes is now Other Information**, for anything about the
  person. Notes about one event are kept on that sign-in, like its time: the
  edit sheet calls them "Notes for this event", the sign-in list shows
  "Note: …", and exports call the column Event notes. A member field named
  Notes is saved as Other Information, and Role takes no new options in
  member fields.
- Expo 58.0.14, Expo Router 58.0.23, Expo UI 58.0.20 and the other SDK 58
  patch releases, which CI's SDK version check now expects.

### Fixed
- The member Notes field never reached exports, because the export kept that
  name for each sign-in's notes. As Other Information it exports like any
  other field.

## [2.9.8] - 2026-10-17

Insights and screens that show more and explain less.

### Changed
- **Average years served counts every year someone has served**, in any role,
  up to and including the year picked, divided by everyone serving that year.
  Before, a staff member's student leader years didn't count towards staff, so
  the overall average came out higher than both groups. Served 2+ years and
  retention follow the same rule: a student leader who joins staff is retained
  and keeps their leader years.
- **General draws staff and student leaders as side-by-side bars with overall
  as a line over them** on Staff & student leaders, Retention, Average years
  served and Served 2+ years. Retention and Served 2+ years have % on the
  axis. General no longer offers a bars or lines switch. App builds older
  than 2.9.8 get Overall as a third bar instead, so their legend still
  matches what they draw.
- **Insights reads in sections.** Each set of cards sits with the chart that
  shows it, under a heading: People serving, Retention, Years served and
  Weeklies on General; Turnout and Who came on a campus and on PPN; Weeklies
  and SOW events on SOW. A picked year on General shows its groups of three in
  a row instead of two and one.
- **"Avg" is spelled out**: Weeklies average (by campus, by term), Average
  years served, Average per event.
- **PPN is charts, not rows of text.** Cards for the average per PPN, people,
  first-timers and the campus leaders' share; bars for each PPN against last
  year; bars of who came (campus leaders, other staff, no staff profile);
  first PPN against came before; and sign-ins by campus in campus colours.
- **TWIG's Everyone list includes campus leaders who haven't come this staff
  year**, as 0/n with a "Not yet" filter, so the gaps are visible without
  counting.
- **Tags collapse to their pill and delete button.** Tap a tag to see and edit
  its name, colour, where it's used and which campuses it applies to. A new
  tag opens straight away.
- **Empty lists offer the next step.** No requests yet shows a "Make a
  request" button and no events yet shows "Create an event", instead of a
  sentence pointing at the button below.
- **A new event request shows its four steps** (Event, Marketing, Risk,
  Finance) instead of a paragraph describing them.
- **Insights is no longer marked BETA** in the tab bar and side menu.
- TWIG's campus bars use campus colours, like the rest of Insights.
- Expo 58.0.12, Expo Router 58.0.21 and Expo UI 58.0.19 (SDK 58 patch
  releases, which CI's SDK version check now expects).

### Fixed
- **Every bar chart drew its bars 4px above the zero line**, so a 100% bar
  rose past the 100% gridline. Bars now start on the line.
- The tooltip on a chart's first or last bar stays on screen.
- **General's weeklies average by campus** gave a weekly shared by several
  campuses its whole turnout at each of them. It now follows the joint
  weeklies setting, like the campus page, is rebuilt as soon as that setting
  changes rather than the next night, and says it's by calendar year.
- **A campus year's Regulars** counted people their latest term called
  Regular. On a year page, students are now Regular for half or more of the
  year's weeklies, as the card's (i) says, and the card, the Regular pill and
  the Regular filter in Everyone always agree. Term pages are unchanged.
- **SOW events' average per event** counted events nobody signed in to as
  zero.
- **PPN's average** was compared with last year's PPN in the same month, and a
  month with two PPNs counted that one twice. It now compares with last staff
  year up to the same date, like TWIG.
- The student leaders by campus chart leaves out campuses with nobody in the
  years shown.
- Side-by-side bars keep each series in its own place, so a PPN with no PPN
  in the same month last year shows a gap rather than a zero.

## [2.9.7] - 2026-10-16

Expo SDK 58 and the latest dependencies. Native code changed (React Native
0.88, the iOS scene life cycle), so phones need new store builds; older 2.9.x
apps keep working against the same server.

### Changed
- **Expo SDK 58, React Native 0.88 and React 19.3**, with every Expo package
  on its SDK 58 version, gesture-handler 3.3, Reanimated 4.7, worklets 0.13,
  screens 4.30, safe-area-context 5.10, pager-view 9.0 and maps 1.29.
- **Convex 1.47** with @convex-dev/auth 0.0.96, convex-helpers 0.1.128 and
  convex-test 0.0.62; Vitest 5.0.5; eslint-config-expo 58; the GitHub
  Actions setup-node step on v7.1.0. This covers every open Dependabot update.
- **Held back on purpose**: TypeScript stays on 6.0 (typescript-eslint does
  not support 7 yet, so linting fails), ESLint stays on 9 (eslint-plugin-react
  does not support 10), and React 19.3.1 and pager-view 9.0.8 wait for the
  SDK to adopt them.

### Fixed
- **Web pages would never have loaded the app on SDK 58.** The site's custom
  HTML page now includes the scripts Expo Router 58 hands it, without which
  every page stayed on the loading spinner.
- **Reimbursements, Profile, Design and Event Requests, Admin and (for staff)
  Churches would have redirected to Home.** Expo Router 58 makes a tab hidden
  with `href: null` unreachable; these screens now hide only their tab button
  and stay reachable from the side menu and links.
- **Android release builds would have crashed on launch.** SDK 58 turns on R8
  code shrinking for release builds, and it stripped the class WorkManager's
  database is created from by name. Release builds keep shrinking off, as on
  SDK 57; the app is about 11 MB larger than with R8.
- **Signed-in people without a staff profile would have opened on a setup
  card instead of the Org Chart.** Expo Router 58 dropped the per-person
  starting tab, so `/` now sends them to the Org Chart itself; links to a
  request still open as before.
- **CSV and PDF downloads on phones could have shared an empty file.**
  Writing the file is asynchronous in SDK 58 and is now awaited before the
  share sheet opens, and a failed write still cleans up the temporary file.

## [2.9.6] - 2026-10-16

A check of 2.9.1 to 2.9.5 on the simulator and web, with four small fixes.

### Fixed
- **PDF section rules stay with their heading.** A section's rule could be
  drawn at the bottom of a page with its heading on the next; the two now move
  together. Both PDF exports share the same heading.
- **PDF footers keep accented letters.** "Zoë" in a request name printed as
  "Zo?" in the page footer.
- **Attendance dates read day first on every device.** Event rows, sign-in
  times and the audit's short dates followed the device language ("Oct 16"
  on a US-English phone); they now use the same day-first style as the rest
  of the app. Event times on web lose their leading zero ("5:00 pm", like the
  phone).
- **Churches: chip counts follow the search box.** Searching for a church
  left the Campus leaders, Staff and campus counts at their totals while the
  line under them counted only the matches.

## [2.9.5] - 2026-10-16

A pass through every screen as each kind of user (signed out, personal
account, no staff profile, campus leader, staff, approvers, admin), fixing what
was broken and showing things instead of explaining them.

### Changed
- **Forms wait until they're complete.** New reimbursement, Submit Receipt,
  Add Account and Mark as Paid are muted until every needed field is filled,
  instead of failing with a message. Mark as Paid starts at the amount owed.
- **New design and event requests point at the question that needs an
  answer.** It's outlined in red with the problem under it, and the banner
  names the question number shown on screen.
- **Approving says who's next.** "Next: Brandon Teng, Finance Head." or "This
  is the last approval. Tony Le is then asked for the receipt." An approver
  looking at their own queue reads "Waiting for your approval."
- **Actions that matter are words, not bare icons.** "Add receipt" and "Mark
  paid" on request cards; event request cards mark each form with a status
  icon (circle, clock, alert, tick, dash) instead of a coloured dot.
- **Insights is easier to read.** Campus bars use each campus's colour; chart
  tooltips name the period ("Sem 2 2026 · 104"); SOW TWIG only calls someone
  Regular once 3 TWIGs have a roll; a new staff year with nothing yet offers a
  button to the year before (TWIG, PPN, and the All tabs of design and event
  requests).
- **Member rows say what each value is**: "Year 2", "Arc Member" and
  "@handle" instead of "2", "Yes" and "handle".
- **Edit Home shows icons and campuses.** The icon pickers show each icon, and
  a card's campus logo is picked from the campuses that have one instead of
  typed.
- **Dates read the same everywhere**, day first ("16 Oct 2026, 12:09 pm"),
  whatever language the device is set to.
- **Profile says what kind of account it is.** A personal (Apple) account says
  "Personal account" and has no empty service history; a SOW account with no
  staff profile says "No staff profile for 2027".
- **Smaller tidy-ups across Attendance, Requests and Admin**: owner and taken
  weeks shown in the event editor, lock icons on rows an ended event keeps,
  read-only Tags and Metadata for people who can't change them, a "Not signed
  in" filter chip and side-by-side actions in Admin, an update pill in the top
  bar instead of a banner over the tabs.
- **Exporting one event skips the layout question.** A grid of one event says
  nothing a list doesn't, so single-event exports go straight to the list.
- **Four-step requests show each approver's full name**, wrapping onto a second
  line instead of cutting it off.
- **The merge review card uses the member row wording** ("Year 6 · Arc
  Member") instead of "6 · Yes".
- **Less code to maintain.** Props and helpers nothing used are gone, and the
  two PDF exports, the Members and Audit filter bars, and the screens' busy
  handling each share one implementation. About 450 fewer lines.

### Fixed
- **A merge showed twice in the Audit tab, with database ids.** It shows once,
  in words.
- **Collapsed request cards hid their unread comments** even though the Review
  tab counted them. They now show a comment count.
- **A signed-out reimbursement link said the request was deleted.** It asks
  you to sign in, like design and event request links.
- **Western Sydney's campus mark read "USYD"** and a deleted dropdown option
  showed as a bare number on member rows.
- **Requests**: the requester hears about every comment on their request; an
  auto-approved step says so; double-tapping Submit makes one request; a
  read-only comment thread says why instead of offering a box; Risk and
  Finance errors use the row numbers on screen.
- **Admin and shell**: renaming a locked name is blocked and renames carry
  through to requests and announcements; sign-out stops pushes to that device;
  notifications keep an Unread section for the visit; the sign-out confirm
  spells The SHED.
- **Attendance**: lists stay live past the first page without a crash; search
  with no matches says so; typing a name to confirm ignores case.
- **The dev-only test sign-in no longer renames a real account** to its email
  prefix.
- **Downloads**: exported CSVs open in Excel with curly quotes and emoji
  intact, and request times are Sydney time instead of UTC; an approved event
  Finance form over $5,000 names the Director as well as the Finance Head, on
  screen and in the PDF; PDF headings and question labels no longer sit alone
  at the bottom of a page.

## [2.9.4] - 2026-10-16

### Added
- **Setting your church says who will see it.** In Profile, staff are warned
  that anyone using The SHED can see their church, with their name, on the
  Churches page; members are told only staff and campus leaders can see
  theirs. Editing a member's record says the same for their church. The note
  shows under the picker and at the top of the list while choosing.

### Changed
- **Members' churches are only for staff and campus leaders.** People with no
  staff assignment this year no longer appear on the Churches page, and their
  church no longer shows on their profile, for anyone else. Staff and campus leaders still see
  everyone, and the page says members are only visible to them.
- **The Churches filter picks any mix of people and campuses.** One row has
  Campus leaders, Staff, and Members (for staff and campus leaders); the other
  has each campus, plus No campus. Nothing picked shows everyone; pick one or
  more in a row to show only them, and tap again to unpick. Everyone and
  Volunteers are gone, since nothing picked is everyone and leaders plus staff
  is the old Volunteers. Each option shows how many people it covers, the
  line under the filter counts the churches and people showing, and Show
  everyone clears it.
- **A fresh look across the app.** Titles, headings and big numbers use a new
  typeface, Familjen Grotesk; buttons and links are back in SOW's evergreen;
  cards are flat with a fine edge instead of a shadow; and section labels are
  in plain sentence case instead of capitals. The current bottom tab sits on
  a soft pill, Home's values are one list, and Profile's service history is
  one card with a row per year.
- **Map pins grow with the number of people.** The church more people go to
  has a bigger label, one fewer go to a smaller one, instead of a number on
  each pin.

### Fixed
- **The church map on iPhone has rounded corners** like the cards around it.

## [2.9.3] - 2026-10-16

### Changed
- **The typed church and old import ids are gone from the database.** 2.9.2's
  clean-up ran on production (three churches added and linked, import ids
  cleared from 220 events and 1,200 members), so the empty fields and their
  indexes are removed along with the one-off clean-up code.

## [2.9.2] - 2026-10-16

### Changed
- **The last typed churches are on the list.** The three staff whose church
  was still only typed text (Redeemer Presbyterian Church, Sydney Elim
  Presbyterian Church, New Life Christian Church) are linked to new list
  entries with those names, so they show on the Churches page. Where each
  meets and when can be filled in from the page. Profiles no longer show or
  hint at typed text.
- **Leftover data from old imports is cleared.** The one-off import from the
  old Roll Call app is retired, and the import ids it left on 220 events and
  1,200 members are removed. Unused search indexes and the old free-text
  service times column are gone, and every sign-in now has to belong to a
  member (all of them already do).

## [2.9.1] - 2026-10-15

### Added
- **Filter the Churches page by who goes.** Everyone, Volunteers (campus
  leaders and staff together), Campus leaders or Staff, and one or more campuses.
  The list, each church's People count ("3 of 8") and the map all follow the
  filter, and churches nobody matching goes to drop out. Campus leaders are
  staff with a campus role that staff year, the same rule as TWIG Insights.
- **Map pins show who goes.** Each pin has the number of people (after the
  filter) in the colour of their main campus, bigger churches sit on top, and
  the chosen church's pin spells out its full name. The Apple map behind them
  is the muted style so the pins stand out.

### Changed
- **Tags has a Weeklies | Other events switch at the top**, like Admin's
  Structure, instead of both lists on one long page. Moving a tag to the other
  list takes you there with it.
- **Save and Cancel look switched off until something changes**, on Tags and
  every other screen with a Save button at the bottom. They were already
  disabled; now they look it.
- **The owning campus in Shared with is shown, not labelled.** It's always
  selected and can't be removed, so it's drawn selected but faded, instead of
  "· owner" after its name.
- **2.9.0 is now the oldest supported app.** The server no longer keeps code
  for older builds: Insights screens from before 2.0.1, the typed church field
  from before 2.5.5, weeklies that arrive without a term and week (2.7.0 and
  older), the old Weekly Meeting tag name, and web links held back from apps
  older than 2.5.5. Finished one-off jobs went too (the 2.8.0 weekly rename,
  the 2.5.6 church list set-up, the 2.3.0 event form import and others).
  The SOW Insights card now says "Average turnout at weeklies".

## [2.9.0] - 2026-10-15

### Added
- **TWIG and PPN Insights for SOW.** Insights → Attendance with SOW selected
  has a Campuses / TWIG / PPN switcher. TWIG shows one staff year (1 Oct to
  30 Sep) against the one before: average attendance, people and regulars,
  counting campus leaders only; TWIG by TWIG against last year; campus leader
  sign-ins by campus; regulars who missed the last two; and everyone, with
  organisers listed but not counted and anyone without a staff profile
  flagged. PPN shows each month's sign-ins (everyone), the change on the same
  month last year, first-timers, and splits by campus and by campus leaders /
  staff / others. TWIGs and PPNs nobody signed in to are listed as "No roll
  taken". The tabs, numbers and wording all come from the server, so they
  change without an app release. Older apps keep the Campuses view.
- **Update prompt.** The app asks for the latest store version when the
  server says so: a banner that can be dismissed, or a full screen when a
  version is no longer supported. Nothing is asked until a version is set.

### Fixed
- **Changing a weekly's week renames it.** Editing T3W6 to week 7 left the
  name T3W6 while Insights used week 7. A weekly named by its code now
  follows a new term or week; a name typed by hand stays.
- **Semester campuses' Insights say "semester"**, not "term" ("or the
  semester before", "Weeklies by semester"). Wrong since 2.5.0.
- **A failed tag save says why above Save tags**, instead of at the bottom of
  a long list. Weekly tags no longer offer SOW, which has no weeklies.
- **Typed confirmations ignore case and extra spaces** in the app as well as
  on the server, so "JOSEPH.YANG " confirms Delete account for joseph.yang.
- **Removing a university, division or department** says anyone still
  assigned has to be reassigned first, which is what happens.
- **Shared with** uses compact round campus marks.

## [2.8.0] - 2026-10-15

### Added
- **New event is one screen, and starts on Weekly.** Pick the term (or
  semester) and week from dropdowns, both pre-filled with the campus's next
  week; the name fills in as the week code ("T3W5" at UNSW, "S2W5" at other
  campuses) and can still be changed. The date starts a week after the
  campus's last weekly, at the same times. Picking a week the campus already
  has asks you to confirm. SOW events are always Other events.
- **Weekly labels are tags.** BAM, Games Night, Mega, Grad and PPN are
  Weeklies tags, and every tag now belongs to one list, Weeklies or Other
  events, chosen on the Tags screen. A weekly only offers Weeklies tags and an
  Other event only Other events tags; switching between them clears the tags
  that don't fit.

### Changed
- **The Weekly Meeting tag is now called Weeklies**, and what makes an event a
  weekly is its term and week, not the tag.
- **Every past weekly was renamed to its week code**, with the extra words in
  its name turned into tags ("S2 WM #13 PPN" is now S2W13 tagged PPN). Shared
  weeklies like Mega Weeklies got a term and week from their owning campus
  (Insights still leaves them out of campus terms).
- **Tags tidied:** Event and Other Events merged into Social (a PPN, like
  Intercampus PPN, takes PPN instead); Retreat,
  Mid-Sem Break and PPN can be used by every campus and SOW; the SOW monthly
  PPNs (and the September Farewells) also carry TWIG.
- **Weeks go up to 14**, and a weekly's term is always in its date's year.

### Fixed
- **Creating a weekly no longer fails when the suggested term is left as it
  is.** Since 2.5.1 the server rejected it, so leaders made Other events with
  the tag instead, which then had no term or week. The server now accepts what
  older apps send, and works out a term and week for a tagged weekly that
  arrives without one.
- **Closing New event without creating it starts the next one fresh.**

## [2.7.0] - 2026-10-14

### Added
- **Delete your account from your Profile.** At the bottom of your own
  Profile, "Delete account" asks you to type your name, then deletes the
  account and signs you out. For a SOW account that means the sign-in itself
  (the linked Google account, every session, push tokens) plus the photo and
  church you set here; your staff profile, service history and Google
  directory details stay with SOW, and signing in again later links them back
  up. An Apple account is removed entirely, notifications included, and
  Apple is asked to revoke The SHED's access to that Apple ID. Apple requires
  this for every app that lets people create an account (App Store guideline
  5.1.1(v)).

### Fixed
- **An Apple account that Apple gave no email can open its Profile** instead
  of waiting forever, and the menu shows its name instead of "?". If Apple
  sends the email or name at a later sign-in, the account picks them up.
- **Apple accounts' Profile no longer says "Synced from Google".**
- **The type-to-confirm box doesn't autocorrect what you type**, which could
  stop a name from matching (Admin's delete confirmations use it too).

### Removed
- **Code nothing uses any more:** the finished 2026-06 history import and its
  data file, one-off fixes that have already run on production (tag merge,
  director thresholds, weekly backfill, Visitor to Guest, stale snapshot
  ranges), roll-call import functions no app ever called, the unused manual
  Insights refresh, unused exports and images, and a stray debug screenshot.
  Small helpers that were copied between files now live in one place.

## [2.6.4] - 2026-10-14

### Fixed
- **Merging two people no longer leaves an "Unknown" in campus Insights.** The
  record that's merged away is now noted for Insights, so the nightly build
  moves its weeklies onto the person kept. Earlier merges are caught up with
  `memberRepair:flagMergedAway`.
- **Campus Insights on older phone apps (2.4.7 and before) stay current.** The
  nightly job builds every campus's snapshot again, not just SOW.
- **The SOW "include collaborative" switch changes the campus comparison
  again.** Shared weeklies such as Mega Weeklies count towards each campus's
  average when it's on, as before 2.5.0. Terms still leave them out unless
  the setting says otherwise.
- **Insights picks up staff role changes and member field changes** made in
  Admin and Attendance settings, instead of waiting for the next sign-in.
- **Design request links don't send older apps to a missing page.** Apps
  before 2.2.0 get the web page, as with event requests; the Churches page is
  handled the same way for apps before 2.5.5.
- **Tapping the "Set your local church" push opens Profile**, and a push about
  the Churches page opens it (in the next app build).
- **Line breaks in a design request's answers and comments print as line
  breaks in its PDF**, not as "?".

## [2.6.3] - 2026-10-14

### Added
- **Two repair tools for data fixes run from the command line.**
  `memberRepair:linkProfiles` links a past year's staff profile to the member
  it belongs to, and `memberRepair:replaceRole` changes a member's Role only
  when it is still the one expected. Both dry-run first, can be run twice, and
  write each change to the attendance audit log. Nothing changes in the app.

## [2.6.2] - 2026-10-14

### Changed
- **Other people's emails, typed churches and "last online" are for staff
  only.** The Churches page and profiles still open for everyone, signed in or
  not. An account with no staff profile now sees what a signed-out visitor
  sees: each church with the names, roles and campuses of who goes there, but
  not members' emails or ids, and not someone's typed church, last online or
  whether they've signed in. Your own profile still shows you all of yours.
- **A university, department or division still assigned to someone can't be
  removed.** Admin says who holds it; reassign them first, as with roles.
  Removing one used to quietly take the assignment away, which turned those
  leaders into plain members.
- **Someone on staff this year keeps their Campus and Role on the member
  record, and can't be deleted from it,** even when it's opened from an event
  in a year they weren't staff.
- **BigQuery `attendance_signins` finds staff again.** `email` is the staff
  email of the profile linked to that member for the event's staff year (empty
  for members), with new `isStaff` and `staffYear` columns. Staff profiles and
  `staff_assignments` carry `memberId`.

### Fixed
- **Merging two records keeps the kept person's church** (and import id) when
  the other record survives because it has more sign-ins.
- **Staff names are never their email.** A staff person whose profile has no
  name keeps their own name on their record, the edit sheet asks for one when
  there's none, and Save stays off until there is. New staff profiles take the
  Google account name when the directory has none. The Members list and merge
  review show that name too.
- **A photo that can't load shows initials** instead of an empty circle, for
  example in past Insights terms after someone's Workspace photo changes.

## [2.6.1] — 2026-10-13

### Changed
- **Every sign-in is now kept only on the person's member record.** The old
  copies of staff sign-ins stored by email, and the second "personal email"
  slot on member records, are gone, along with the one-off tools that tidied
  them up for 2.6.0. Nothing changes in the app. Restoring a deleted sign-in
  by a staff email finds that person's member record, and reports "member
  missing" if they don't have one.

### Fixed
- **Leaving staff keeps the name on someone's member record.** The October 1
  job (and removing someone from this year's staff) no longer replaces it with
  the name on their staff profile, so a corrected spelling such as
  "Anna-Leah" stays.

## [2.6.0] — 2026-10-13

### Changed
- **Everyone has one attendance record, and staff sit on top of it.** Each
  year's staff profile now points at the person's member record, and every
  sign-in points at a member, staff included. Someone shows as staff on the
  events of the years they were staff and as a member on every other event,
  under the same record. Their own email stays on the record; the staff email
  lives on the profile.
- **New staff get their record when they're assigned.** Assigning someone for
  this staff year in Admin links them to the record an earlier profile of
  theirs points at, or makes one. Next year's staff are linked on October 1,
  unless they're linked earlier.
- **Admin → Merges shows next year's staff too**, so a new leader who came
  as a member can be linked to their member record before October 1. Merging a
  staff person who has no record yet just links them; nothing moves.
- **Leaving staff moves nothing.** On October 1 a leaver's record and sign-ins
  stay where they are; an empty Campus is filled from their last role and an
  empty Role becomes Member. Removing someone from this year's staff in Admin
  does the same straight away.
- **Merging two records keeps the one with more events attended** (the older
  one on a tie), and points every staff profile at it.

### Fixed
- **Staff who left before 2.6.0 show as staff again on the events of the years
  they served**, instead of as members.
- **Insights counts a staff person once**, not twice when some of their
  sign-ins were under their member record.
- **Signing out a staff sign-in always works**, including ones made through
  their member record.
- **Editing a staff person from an event in a year they weren't staff** now
  saves them as a member instead of failing with "Staff profile not found."
- **A re-hired leader is the same person again**, not a second record.
- **The Churches page counts someone with an unassigned profile as a member**,
  and attendance exports give staff their Campus and Role from their profile.
- **Former and next-year staff whose record still had their SOW email can be
  saved without it.** Clearing the email no longer fails with "Staff profile
  not found." when they aren't staff in the year being viewed.
- **Changing your profile photo works when the old photo's file is missing**,
  instead of failing with an id-not-found error.

## [2.5.8] — 2026-10-13

### Fixed
- **iOS builds carry a location purpose string.** App Store Connect flagged
  build 36 (ITMS-90683) because the Churches map library references iOS
  location APIs, so iOS needs `NSLocationWhenInUseUsageDescription` even
  though The SHED never asks for your location. The string says exactly
  that.

## [2.5.7] — 2026-10-13

### Changed
- **Insights no longer counts outsourced people as staff.** Someone whose only
  role is Outsource is left out of the General tab's headcount, retention and
  years-served numbers. Someone who is also Staff or a Student Leader counts
  as that.
- **Your profile shows when Google last synced it**, as a chip under your
  name: "Synced from Google 3d ago". It is the later of your last Google
  sign-in and the weekly directory sync.
- **Less explanatory text.** Lines that repeated a heading or a button, or
  explained what the screen already shows, are gone: on your profile, the
  admin directory sync and delegation cards, new attendance events, the Home
  editor, event request forms, request and attendance exports, attendance
  tags, the risk guide and the "Recommended" note.

### Fixed
- **Staff show their real Google photo instead of a letter.** Anyone who
  signed in before they had set a Google photo kept Google's coloured letter
  placeholder, and it hid the real photo the Workspace directory sync had
  already copied (11 staff, including Brandon Teng). A photo uploaded in The
  SHED still comes first, then the Workspace directory photo, then the
  picture from Google sign-in, then initials.
- **Attendance and Insights lists show uploaded photos.** Roll call, the
  member list, attendance metrics and weekly Insights only used the Google
  sign-in picture, so a photo uploaded in The SHED or set in Workspace never
  appeared there. They now use the same order as profiles and the org chart.

## [2.5.6] — 2026-10-13

### Added
- **Everyone's typed church is now on the list.** `churches:setUp` adds the
  churches people had typed before the list existed, with where they meet,
  their Sunday services and their website and Instagram: St John's Anglican
  Cathedral Parramatta, Sydney Dongsan Church, The Movement Church, West
  Sydney Community Church, Sydney Onnuri Church, St Barnabas Anglican Church
  Roseville, Cornerstone Church Rhodes, Cabramatta Anglican Church, Macquarie
  Anglican Church, Jesus Follower Church and Saving Grace Christian Church.
  Everyone who typed one of them (or "New Life", for Sae Soon) is linked to
  it. A church staff already added under another spelling is reused, and
  only its blank details are filled in.

### Changed
- **Signed-out visitors see who goes to each church**, with their role and
  campus, and can open the profiles of the staff and campus leaders in the
  list. A staff profile shows their church to visitors too. Other people's
  member records stay private.
- **Each church lists its first 5 people**, with "N more" under them. Pick a
  church on the map, or tap anywhere on its card, and it opens under the map
  with everyone in a box that scrolls, like the Insights lists.
- **Alumni show as Alumni**, after the members at the bottom of a church's
  list.
- **Search matches church and people names only**, not roles.

## [2.5.5] — 2026-10-12

### Added
- **Pick your local church from a list.** Profile's free-text church box is
  now a dropdown of churches staff go to. Each church shows where it meets
  (tap to open it in Maps) and its service times, and that shows on your
  profile for other staff too. Not in the list? Add it with its location and
  service times; anyone on staff can fill in a missing detail later. The list
  starts with Harbour City Church (Gladesville, Sunday 10:30am), Sydney Young
  Nak Church (Telopea, Sunday 1:15pm), Sydney Sae Soon Presbyterian Church
  (New Life; North Rocks, Sunday 10am) and Living Hope Presbyterian Church
  (Sunday 10am and 12pm). Anyone who typed one of those (or a common
  spelling of Sae Soon) is linked to it; anyone who typed something else
  sees it as a hint until they pick or add their church.
- **A Churches page** in the side menu: every church with where it meets and
  when, and the people who go there with their role, leaders first (staff
  and campus leaders show their role; everyone else shows as Member). Search
  by church, person or role, add a church, or fill in a church's details.
- **A map of the churches** on the Churches page: each church with an address
  is a pin labelled with its initials (Harbour City Church is HCC). Tap one to
  see its details and who goes there. Google Maps on the web and Android, and
  on iPhone once its key is set (Apple Maps until then). Addresses are found
  with Google's Geocoding API and looked up again within its 30-day limit.
- **From a person to their church.** On someone's profile, and on an Insights
  member page, tap their church to open it on the Churches page with everyone
  who goes there.
- **Service times are picked, not typed:** a day of the week and a start time
  for each service, as many as a church has, shown as "Sunday 10am and 12pm".
  A church can also have its website and Instagram, both optional.
- **Anyone can see the churches**, signed in or not, from the Churches tab or
  menu. Signed-out visitors see how many people go to each church but not
  who, and no one's profile.
- **Only staff and campus leaders add or edit churches** (anyone with a staff
  profile this year). Everyone signed in can pick theirs from the list.
- **Members have a local church too.** Edit member has a Local church row
  picked from the same list (with Add a church). A staff person's church
  comes from their own Profile and shows there read-only. A person's church
  also shows on their Insights member page.
- **A reminder to set your local church**, as a notification and a push, for
  staff who haven't picked one.

### Fixed
- **Picking a date or time on Android** closes the picker. Before, the clock
  opened again after OK until you pressed Cancel (in Create event too).

## [2.5.4] — 2026-10-12

### Fixed
- **Former leaders, execs and staff can be edited from Insights.** Someone
  who stopped serving before 1 Oct 2026 (when the leavers conversion started)
  still had their sign-ins under their staff email, so their member page had
  nothing to edit. The 1 Oct conversion now catches up everyone who isn't
  serving this year, whichever year they stopped, and turns them into plain
  members with their sign-ins on their member record.
- **Insights picks up the change straight away.** When someone becomes a
  member this way, the next Insights build re-reads their weeklies, so they
  show up as a member (with Edit member) instead of under their old staff
  email.
- **They're still a leader in the terms they served.** Insights used to
  re-label a converted leader's past terms as Regular or Irregular. It now
  finds the staff email they had and keeps them as a Leader (or staff) for
  those terms, and a member from the year they stopped.
- **A personal email can't be a staff email.** A staff person's personal
  email, and a plain member's email, can no longer be an SOW address
  (@sow.org.au or @sowaustralia.com) or anyone's staff email from any year.
  The form says so as you type and won't save; merging and the leavers
  conversion skip such an address too. For staff, the second email box is
  now labelled "Personal email".

## [2.5.3] — 2026-10-12

### Changed
- **Comparisons say exactly what they're compared with, in weeks.** While
  a term is running it's compared with the term before up to the same week,
  and the cards now say so: "vs 97.3 in T2 2026 up to W4". Before, they said
  "vs 97.3 in T2 2026", which didn't match T2's own page (87.3 for the whole
  term). The year so far is compared with last year up to the same term and
  week ("up to T3 week 4") instead of the same date. I checked every number
  against prod's raw sign-ins: all were right, only the labels were unclear.
  Mega and combined weeklies were never counted on either side.
- **Clearer cards.** Labels are in sentence case, and the change sits in a
  small coloured pill beside the number. The comparison wraps onto a second
  line instead of being cut off on narrow phones.
- **Last term's bars are grey** in the week-by-week and by-term charts, so
  this term stands out.
- **The term picker shows one row per year**, its terms side by side
  (T1, T2, T3, Year) rather than one long list.
- **Plainer wording** in captions, (i) notes, chart subtitles, follow-up
  reasons and list headings. Weekly avg's and People's (i) say that Mega and
  combined weeklies aren't counted.

### Fixed
- **The year's weekly avg by term chart compares like with like.** It set
  this term so far against last year's whole term; last year's terms are
  now cut to the same term and week, as the cards are.
- **Two weeklies in the same week are both shown.** USYD's Sem 1 2026 has
  "USYD PPN" (7 Apr) and "WK #7" (14 Apr), both week 7. The week-by-week
  chart showed only one, and a member's week grid could mark both as
  attended when they came to one. The second is now its own "W7·2" bar and
  box. Averages and counts always included both.
- Semester years' captions say "Sem 1 and Sem 2" instead of "Sem, Sem".

## [2.5.2] — 2026-10-11

### Added
- **Newcomers and visitors are tagged when you sign people in.** While an
  event is on, its sign-in screen shows a Newcomer or Visitor tag beside
  those people (from last night's Insights), so leaders know who to welcome.
  An event shared by several campuses only tags newcomers, and a finished
  event shows no tags. Screen readers read the tag with the name.

### Changed
- **A term is compared with the term before, not last year's.** T3 is
  compared with T2 (Sem 2 with Sem 1, T1 with last year's T3), up to the same
  week while the term is running. The whole-year view still compares with
  last year.
- **"Last came" says which weekly.** People lists, follow-ups and a member's
  page show the term and week as well as the date: "Last came T3W2 (23 Sep)",
  "Visited T3W1 (16 Sep)", "New on T3W3 (30 Sep)".
- **Week-by-week charts sit near the top** of a term, above Needs follow-up.
  The whole-year view has a "Who came each week" chart for each term instead
  of one crowded chart.
- **The term picker lists each year's terms, then that whole year:** 2026 T3,
  2026 T2, 2026 T1, 2026 · whole year, 2025 T3, and so on.
- **Long lists scroll inside their box**, like the sign-in lists, with a Show
  all button under them (as in Admin) to see the whole list: Needs follow-up,
  Visitors, Everyone and a member's events.
- A member's week grid is now titled "Weeklies attended this term".

### Fixed
- **Chart legends wrap** instead of running off the edge of the card on
  phones (the "Who came each week" legend lost Leader and Staff).

## [2.5.1] — 2026-10-11

### Added
- **Create a weekly as a Weekly.** New event now starts by asking whether
  it's a Weekly or another event. A Weekly gets a term or semester (a
  dropdown) and a week number (numbers only), both filled in for the date
  from the campus's other weeklies, and a name like "Weeklies T3W5". Change
  any of them if the suggestion's wrong. A Weekly is tagged Weekly Meeting
  automatically.

### Fixed
- **Comparisons with last year no longer count Mega or combined weeklies.**
  A weekly shared with other campuses was counted as each campus's own: last
  year's Mega Weeklies made UNSW's T2 2025 look like 83 a week and 280
  people (it was 70 and 194), and it started USYD, UTS and Macquarie's
  Semester 2 a week early. Weeklies with more than one campus are now left
  out of Insights.
- **Week numbers match what leaders call them.** Semesters don't number the
  mid-semester break, so weeks after it showed one or two too high (Week 8
  as W10). Each weekly now keeps its term and week; existing weeklies were
  filled in from their names (S1W8, T2W8, WK #9), and the few with no week
  in their name count on from the last one that did.
- **Weeklies that were never tagged now count**: UNSW T1W7 (1 Apr), USYD
  WK #9–#12 and two Macquarie weeklies.

## [2.5.0] — 2026-10-11

### Added
- **Campus Insights are now about weekly meetings, by term.** Pick a campus in
  Insights → Attendance and you see its weeklies for the current term (T1–T3
  at UNSW, Sem 1–2 elsewhere), any past term, or a whole year, each compared
  with last year: weekly average, people, regulars, newcomers, how many
  newcomers came back, and how much of the room is from this campus. Charts
  show each week against the same week last year, and who came each week.
  Terms are worked out from when weeklies happen, so there's nothing to set
  up; a weekly only counts if it's tagged Weekly Meeting.
- **Everyone's attendance, with a category.** A list of everyone who came this
  term or last shows their share of the weeklies ("6/8 · 75%"), when they last
  came and a category: Irregular, Newcomer, Regular, Visitor (from another
  campus), Leader or Staff, alumni & guests. Irregulars and newcomers come
  first, leaders and staff last. Filter by category or "No campus set", sort
  by percentage, name or last came, and search by name.
- **A follow-up list that finds people who are slipping.** "Needs follow-up"
  lists people who were coming regularly but have missed the last 2 weeklies,
  then newcomers who didn't come back last week. Visitors get their own list.
  Tested on past attendance, people it flags were half as likely to come back
  as everyone else, and it caught 59 of 64 people who later stopped coming.
- **A page for each person.** Tap anyone to see their category and share for
  every term, which weeks they came this term, every event they've signed in
  to, and their details, with Edit member to fix their campus or role.

### Changed
- **The Role option "Visitor" is now "Guest"**, for non-students such as
  parents or church guests. Everyone tagged keeps the tag; "Visitor" now means
  someone visiting from another campus.
- **Insights rebuild only what changed overnight**, instead of recalculating
  every campus from scratch, so most nights do little or nothing.

## [2.4.7] — 2026-10-10

### Changed
- **Sign-in only accepts your SOW account (or Apple on iPhone).** Personal
  Google accounts can no longer sign in. The Sign in menu no longer has
  "Sign in with Google"; it shows "Sign in with your SOW account", plus
  "Sign in with Apple" on iPhone. Older app versions still show the old
  "Sign in with Google" button, but it now fails with "Sign-in failed".
  The page you see when you open an emailed link while signed out now says
  "Sign in with your SOW account" too, which is what that button always
  did. If a non-SOW Google account is picked, the message no longer
  suggests signing in with Google as a guest (on iPhone it points to Sign
  in with Apple instead).

## [2.4.6] — 2026-10-09

### Fixed
- **Phones get notifications as soon as you sign in.** The app only signed a
  phone up for notifications when it first opened, and only if you were
  already signed in by then. So anyone who opened the app and then signed in
  (everyone, the first time) got no notifications until they fully closed
  and reopened it. Now the phone signs up the moment you sign in, including
  when a saved sign-in loads on launch or you sign in as someone else (the
  phone then notifies them instead). If notifications were off, turning them
  on in Settings works the next time you come back to the app, without
  asking again in between.

## [2.4.5] — 2026-10-09

### Added
- **Profiles show when someone was last online.** Under their email it says
  "Last online 5m ago" (or 3h, 2d, 3w ago…), so you can tell whether a
  message or approval is likely to be seen soon. People who have never
  signed in to The SHED say so instead. Only signed-in staff see it, and it
  isn't shown on your own profile. The app and website note that you have
  them open, at most every 5 minutes; for the time before this, your last
  sign-in activity is used.
- **Admin → Users marks staff who haven't signed in.** Their cards carry a
  NOT SIGNED IN badge, and the top of the list says how many of this year's
  staff haven't signed in yet, with **Show only them** to list just those
  people (and Show everyone to go back).

## [2.4.4] — 2026-10-09

### Fixed
- **Signing people in and out of an event moves smoothly.** Swiping a member
  now slides their card away and closes the gap in one motion, while their
  card opens its space in the other list and fades in on the same curve, so
  it reads as the person moving across rather than a jump. The card under the
  one you swiped no longer flickers, the arriving card shows its full details
  straight away instead of filling in a moment later, and a swiped card
  stays put until its space has closed even when the server answers quickly.
  The screen also does far less work per swipe, so there's no stutter on big
  events, and scrolling down the Not signed in list no longer jumps back
  after each sign-in. If a sign-in or sign-out fails, the card comes back
  instead of staying hidden.

## [2.4.3] — 2026-10-09

### Added
- **Admin → Merges lists staff who are still in attendance as a member.**
  New leaders have usually been signed in as members for a year or more
  before they join staff, so they end up as two people: their staff record
  and their old member record, and Insights counts them twice. The new tab
  pairs each staff person in the current staff year with members who look
  like them — the same name (however it was spaced or ordered), an added
  middle name, or a shortened first name like "Sam" for "Samuel" — and
  leaves out anyone on a different campus. Each pair shows the member's
  campus, role and how many times they've signed in.
- **Merge or "Not the same" for each pair.** Merge opens the usual merge
  review with the staff person already picked, so their sign-ins move onto
  them and the member record goes. "Not the same" stops that pair being
  suggested again and is noted in the attendance audit log.
- **The tab only appears while there's something to sort out.** It shows a
  count beside its name, and disappears once every pair has been merged or
  marked as not the same. Only admins see it, and only on the current staff
  year: next year's staff are left until their year starts.

## [2.4.2] — 2026-10-09

### Fixed
- **Date and time fields on the website now look like the app's.** They show
  the day and date ("Wed, 7 Oct 2026") and the time ("5:00 pm") with a
  calendar or clock icon in the app's font, instead of the browser's plain
  "07/10/2026" in a different font, which Safari also pushed to the top of
  the box. Clicking anywhere on the field opens the browser's date or time
  picker. This covers the attendance Schedule step (including the Multi-day
  event End date), the attendance export, scheduled announcements and Event
  Request forms. Optional dates can be cleared with the × like in the app.
  Typing a date or time from the keyboard shows what you're typing.
- **The attendance export's From date can no longer be cleared**, since an
  export needs a start date. An empty To date now reads "Today", which is
  what the export uses.

## [2.4.1] — 2026-10-09

### Added
- **Attendance events can run over several days.** On the Schedule step when
  creating or editing an event, tick **Multi-day event** and an End date
  appears under the date, so a camp, conference or retreat can be one event
  from its first day to its last, and an evening event can run past midnight.
  The End date starts on the day after and can't be set any earlier.
  Moving the Start date carries the End date along with it, so a three-day
  camp stays three days long. Untick it and the event is back to one day.
  Everyone still signs in once for the whole event.
- **A multi-day event shows both dates.** The events list and the event page
  show the full range (for example "10.10.26, 5:00 pm - 12.10.26, 12:00 pm"),
  and the event stays LIVE until it finishes on its last day. Each sign-in
  shows the day as well as the time, so Saturday's sign-ins read apart from
  Friday's.

### Changed
- **An end time before the start time now says so** ("The event has to end
  after it starts.") instead of quietly moving the end to two hours after the
  start. For an event that finishes after midnight, tick Multi-day event and
  set the End date to the next day.

## [2.4.0] — 2026-10-09

### Added
- **Admins and Human Resources can send announcements to leaders.** A new
  Announcements page in the side menu lets them write a title and message and
  send it to all leaders, or pick campuses, divisions and departments and
  narrow it by role (for example only Student Leaders at UNSW). It shows how
  many people it will reach and how many have the app, with a preview of the
  notification as it lands on a phone, and asks "Send this announcement?"
  with that number before anything goes out. Everyone it reaches gets it in
  their notifications (the bell), people with the app get a push, and
  tapping either opens the full announcement in the app. Tick **Also send as
  an email** to email it as well, with a link to open it in The SHED; replies
  go to the sender.
- **Announcements can be scheduled.** Choose a date and time (at least 5
  minutes from now) instead of Send now, and it goes out then. Scheduled announcements are listed on the page
  until they go, and any admin can cancel one. Recently sent ones are listed
  too, with how many people each reached.
- **Announcements can't be sent by mistake or flooded.** The same
  announcement twice in ten minutes is refused as a double send, and each
  person can send three an hour, ten a day and have ten scheduled at once.
  The page checks these, and the scheduled time, before sending: the button
  stays off and says why, rather than the send failing.

## [2.3.2] — 2026-10-08

### Changed
- **An event's Marketing form now needs a promotion start date and the
  information to include in posts.** Marketing can't plan promotion without
  them, so "When would you like promotion to start?" and "Please give all the
  important information you want us to include in posts" are now required
  before the form can be submitted. Drafts can still be saved without them.
  The promotion start date can't be in the past, though a form that's edited
  later can keep the date it already had. The questions come from the server,
  so this works on every app version without an update.

## [2.3.1] — 2026-10-07

### Fixed
- **Event request links no longer show "Unmatched Route" on phones with an
  older app.** On a phone, the website hands pages to the installed app, and
  apps older than 2.3.0 don't have Event Requests. Links to event requests now
  open in the app only for people whose app can show them. Everyone else stays
  on the website, which always has the latest pages. An older app's
  notification bell no longer links to pages it can't open.
- **Signing in from a link on the website brings you back to that page**, and
  event request pages ask you to sign in instead of saying they can't be found.

### Added
- **A friendly page for links this version of the app doesn't have yet**, with
  "Open on the Web" and "Update THE SHED", instead of "Unmatched Route".
- **The app tells THE SHED which version it is**, so emailed links can open in
  the app once you've updated.

## [2.3.0] — 2026-10-07

### Added
- **Event Requests: plan an event and get it signed off, from the side
  menu.** Staff (not campus leaders) start with the event itself, the old
  SHED web app's event form (name, purpose, goals, theme, location,
  registration goal, audience, dates and notes), and are warned if it's less
  than 4 weeks away. Then the event's three forms are filled in by the
  requester or anyone in their department: **Marketing**, **Risk** and
  **Finance**. The event is approved, and can go ahead, once all three are
  approved or not required. Drafts can be saved and finished later.
- **The Marketing form covers the event's design and promotion.** It's the
  old web app's form with this year's design options (Reels, long form
  video, Instagram posts), the key Bible passage and multiple drafts. Choices
  that usually suit an event of its size are marked "Recommended". The
  Marketing Head approves, and the Marketing team hears about it.
- **The Risk form uses SOW's Risk Management Standard.** For each risk, pick
  what kind it is and how bad and how likely it is, in the Standard's own
  words, and the app works out its score and rating from the Standard's
  matrix. Anything above Low needs a plan to reduce it. A "How to rate a
  risk" guide and links to view or download the Standard sit on the form.
  The Compliance Head approves. Ticking "This event has no notable risks"
  means it doesn't need approving, but Compliance is still told.
- **The Finance form is a simple rundown of income and expenses.** Add lines,
  see the totals and net, and optionally link a fuller spreadsheet. The
  Finance Head approves. When total expenses are over the event Director
  threshold ($5,000 to start), the Director approves first. An event with no
  money in or out doesn't need Finance's approval, but Finance is told.
- **Reviewers can approve or ask for changes.** Asking for changes sends the
  reason to the requester, who fixes the form and submits it again (a Finance
  form starts again from the Director). Each form has its own comment thread.
  An approved form can be reopened to change it; the event goes back to in
  progress until it's approved again. Events can be cancelled and stay in
  the list as cancelled.
- **To review and All.** The Marketing, Compliance and Finance teams and the
  Director see the forms waiting on them, with a badge on the menu. They, the
  Events department and admins can see every event by staff year.
- **Team emails go to marketing@, compliance@ and finance@sow.org.au** for
  their own form, as well as to whoever approves it.
- **Download any event as a PDF.** Its Risk and Finance pages are laid out
  like the Governance Review Form.
- **Admin → Other sets the event Director threshold**, separately from the
  reimbursement one.
- **The old web app's event forms are copied in**, with their Marketing and
  Finance forms (the old budget tables become lines). Finished events come
  in approved; SAF26 and SOW Camp 2027 come in still in progress, with Risk
  forms to fill in.

### Changed
- **Design requests aren't for events any more.** The "Event-related" type is
  gone from new requests (older ones keep it), the details question asks
  about the project, and the form points events to Event Requests instead.
- **Expo packages are on the latest SDK 57 patch releases** (expo, expo-router,
  expo-notifications, expo-linking, expo-auth-session, expo-constants and
  @expo/ui), so they stay in step with the SDK.

## [2.2.0] — 2026-10-06

### Added
- **Design Requests: ask the Marketing team to design something, from the
  side menu.** Staff (not campus leaders) fill in the design request form
  from the old SHED web app, with this year's changes: "What would you like
  us to design?" adds Short Form Video (Reel), Long Form Video and Instagram
  Posts; the theme and examples questions are now one required question
  ("Please provide examples of the theme/colour palette/visual style you'd
  like us to work with"); event requests are asked for the key Bible passage;
  and every request gives a budget for promotional materials, with a reminder
  to be in contact with Finance. The questions come from the server, so they
  can be reworded or added to without an app update.
- **The Marketing Head approves or declines, and Marketing marks requests
  complete.** Declining needs a reason the requester sees. Marketing staff
  can add a note or a link to the final files when they mark a request
  complete. The Marketing Head's own requests are approved straight away,
  and anyone covering for them can approve too. Requests can't be submitted
  until the year has a Marketing Head.
- **Requesters can edit or cancel until a request closes.** An edited
  request shows when it was edited, its history lists what changed, and the
  Marketing team is told. Cancelled requests stay in the list as cancelled.
- **Everyone on a request hears about every step.** The requester and
  the Marketing team can comment on a request. Submissions, approvals,
  declines, edits, completions, cancellations and comments notify the people
  involved in the app and by push; the Marketing team's emails go to
  marketing@sow.org.au instead of each person. The side menu (and your avatar
  on phones) counts requests waiting on you.
- **Find requests under Mine, Marketing and All.** Everyone sees their own requests; the
  Marketing team and admins also get the Marketing tab (requests to approve
  or finish, from any year) and All, every request from a staff year, with a
  year picker, like Reimbursements' All tab. Open requests from earlier years
  stay in this year's lists until they close.
- **Download a design request as a PDF.** The request page has a Download
  PDF button: the status, every answer, its history and its comments on A4,
  to print or keep. On phones it opens the share sheet (Save to Files, Print,
  Mail…); on the web it downloads.
- **Old design requests come across from the web app**, with their numbers,
  dates, statuses and comments. Ones from earlier years that were never
  finished come in closed, marked "Closed when imported from the old SHED".

### Changed
- **Profile is its own page from the side menu**, with the top bar and the
  bottom tabs, like Reimbursements and Attendance, instead of opening on top
  with a back button. Other people's profiles still open on top.

### Fixed
- **Typing in a form no longer hides the field behind the bottom button**
  on the design request form: the button stays below the keyboard while you
  type.

## [2.1.0] — 2026-10-06

### Added
- **A side menu, like X's.** On phones, tap your avatar (now top-left, where
  THE SHED logo was) or swipe in from the very left edge of a tab screen. It
  shows your photo, name and role, then Profile, Reimbursements and, for
  admins and the Finance Head, Admin, with a smaller Sign out at the bottom.
  Tap beside it, swipe it back to the left or press Android back to close it.
  The orange count that was on the Requests tab is now on your avatar and on
  Reimbursements in the menu.
- **iPad and desktop web get a permanent sidebar instead.** On screens 700
  points wide or more, the sidebar replaces the top bar and the bottom tabs:
  your avatar with the bell beside it, your name and role, then Home,
  Reimbursements, Attendance, Insights, Org Chart, Profile and Admin, and Sign
  out. It stays beside every screen, including requests and profiles opened on
  top. Signed out, it shows a blank avatar to sign in from, then Home, Insights
  and Org Chart. On the test app, the Test Environment chip sits in the
  sidebar.

### Changed
- **Requests is now Reimbursements, and it lives in the side menu instead of
  the bottom bar.** The bottom bar is Home, Attendance, Insights and Org
  Chart. Staff still open the app on Reimbursements, and links in
  notifications and reminder emails still land in the right place.
- **Signed out, Sign in moves to the top-left.** The bell stays top-right for
  staff. THE SHED logo is no longer in the top bar.
- **Admin and Sign out moved into the side menu.** The Admin button on
  Reimbursements' All tab and on Org Chart is gone, and Profile no longer has
  its own Sign out button.

## [2.0.3] — 2026-10-05

### Added
- **Admins, Marketing staff and the head of Engagement can edit the Home tab
  in the app.** An Edit button on Home, Resources, Connect and Partner opens
  that tab's sections as a form: change any text, link or phone number,
  reorder or remove sections,
  add new ones (headings, cards with buttons, link lists, social buttons,
  campuses, the contact form) and preview before saving. Saved changes show
  for everyone straight away, with no app update. "Restore built-in content"
  puts a tab back to how it shipped, and if two people edit the same tab at
  once, the second save is stopped instead of overwriting the first.

### Changed
- **The Home tab now comes from the server, like Insights.** It looks the
  same as before until someone edits it.

### Fixed
- **A personal Google account can no longer take over an old staff
  profile.** On first sign-in, profiles left on the old sowaustralia.com
  addresses were matched by the part before the @, so a personal account
  with the same name could claim them. Only sow.org.au accounts can claim
  them now.

## [2.0.2] — 2026-10-04

### Changed
- **On phones, Admin Users lists are back in a scroll box, with Show all
  underneath.** The "Previously staff", "Signed in, no assignment", "In
  directory, no assignment" and "Leaving" lists each show 4 people in a box
  you scroll inside, like "Not signed in" on an event. A soft shadow on the
  top or bottom edge shows there's more that way. "Show all" below the box
  opens the whole list on the page, and "Show fewer" puts the box back without
  moving the button from under your finger.
- **On the web and on wide screens such as iPads, Admin Users lists show
  everyone.** There's room for the full list, so there's no box or button.

## [2.0.1] — 2026-10-04

### Changed
- **Insights → Attendance is shorter and clearer.** A campus now shows three
  numbers (weekly-meeting average, people, new people), one weekly-meeting
  chart and the Needs follow-up list, which shows the top 5 with a "Show all".
  SOW shows each campus's weekly-meeting average, with full campus names, and
  SOW events' numbers. Long explanations, repeated subtitles and the charts
  that said the same thing twice are gone.
- **Insights → General is shorter too.** It shows staff and student-leader
  numbers, retention and average years served (overall, staff and student
  leaders), then six charts: staff & student leaders, student leaders by
  campus, retention, average years served, the share who've served 2+ years,
  and weekly average by campus. The comparison ("2027 vs 2026") is shown once
  instead of on every card. Picking a year shows that year's headcount,
  retention, average years and weekly averages. The long explanations and
  chart subtitles are gone.
- **Retention covers the newest year straight away.** It used to stay blank
  for the first week after the 1 October rollover; now it matches the headcount
  year. Until leavers are marked, the new year's rates reflect the roster
  copied over at rollover.
- **Weekly averages on General follow the calendar year** (January to
  December), the way weekly meetings run.
- **Weekly averages only count weeks a meeting happened.** A Weekly Meeting
  nobody signed in to (a cancelled or holiday week) no longer drags the
  average or the weekly chart down.
- **Both Insights tabs are now laid out by the server.** What General and
  Attendance show, their wording, charts and order can change without a new
  app release.
- **Bar charts use the full width.** Bars are spaced evenly across the chart
  instead of bunching in the middle.
- **Time ranges are past week, month or year.** Custom date ranges are gone:
  each one re-read every attendance record behind the scenes.

### Fixed
- **Insights → General no longer re-reads all attendance each time it opens.**
  The campus weekly-attendance chart is rebuilt overnight with the rest of
  Insights, so opening the tab reads one small record instead of about 2 MB.
  The SOW campus comparison on the Attendance tab is cheaper too.

## [2.0.0] — 2026-10-02

### Changed
- **The SHED now runs in Sydney.** The backend moved from the US to Sydney, so
  the app and website respond faster in Australia. All requests, attendance,
  people and uploaded receipts were copied across. The test environment (The
  SHED Staging, the dev website and local development) moved first, to
  `successful-lynx-56`; the live app and website move to `giant-bloodhound-191`
  in a short overnight switch.
- **Update the app to keep using it.** Versions before 2.0.0 point at the old
  US backend, which is switched off after the move, so they stop loading until
  you install 2.0.0. Everyone signs in once more after updating.

## [1.13.10] — 2026-10-01

### Fixed
- **Attendance Tags and Metadata leave room for the "unsaved changes" note.**
  Since the note became a card in 1.13.8, it could hide the last tag or field
  behind it. The tabs now measure their bottom buttons and note and pad to
  match, like the event screen.
- **Tapping the warning note no longer taps whatever is behind it.** The note
  card now catches the tap instead of passing it to a hidden row.
- **The bottom room stays right on web when the button's position changes**
  (for example after a window resize changes the safe area).
- **A bottom button with a tall note hides fully when you switch tabs.** It
  used to slide down a fixed distance, so a tall note could still peek over the
  next tab's content.
- **The events list's Edit button is valid on the web.** It sat inside the
  event's own button, which browsers don't allow; it now sits beside it in the
  same spot, and screen readers reach it directly.

## [1.13.9] — 2026-10-01

### Fixed
- **Screen readers hear an event's universities too.** In the Attendance
  events list, VoiceOver and TalkBack now read the university badges shown on
  an event along with its name, date, status, tags and attendance count.

## [1.13.8] — 2026-10-01

### Fixed
- **The "This event has ended" note is readable and no longer covers people.**
  On an ended event the warning above Enable editing was bare text drawn over
  the Signed in list, so the two overlapped. It now sits on its own card, and
  the page leaves room for the note and button so the last person in the list
  scrolls clear of them (and, on wide screens, the two columns stop above
  them).

## [1.13.7] — 2026-10-01

### Fixed
- **Tapping anywhere on an event in Attendance opens it.** Only the title
  block and the "ATTENDANCE" text opened the event, so taps in the space
  between them, beside or below the attendance count, or along the card's
  edges did nothing. The whole event card now opens the event; the Edit button
  still opens the edit sheet. With VoiceOver or TalkBack, Edit is available as
  an action on the event.
- **Short tag names stay on one line next to many universities.** On an event
  with lots of university pills, a tag like "PPN" was squeezed into "PP" over
  "N". Tags now keep their width (up to half the row) and the university pills
  wrap instead, on the event screen and in the events list.
- **Not signed in fills in first when you open an event.** Its rows used to
  wait for the Signed in list below them to fade in, so the box sat empty under
  its count for a moment. Not signed in now fades in first, then Signed in.

## [1.13.6] — 2026-10-01

### Changed
- **Admin Users lists show 5 people, with a Show all button instead of a
  scroll box.** Previously staff and both no-assignment lists now show 5
  people (Leaving still shows 3), followed by "Show all" to open the full
  list in place and "Show fewer" to fold it back. The small scroll boxes from
  1.12.1 are gone: on a phone a list filled most of the screen and swipes got
  stuck inside it, so the page could only be scrolled by dragging a section
  title. The assign form also no longer gets cut off at the bottom of a list.
  On wide screens the cap rounds up to full rows of cards, "Show fewer" keeps
  the button where your finger is, and newly shown people fade in.

## [1.13.5] — 2026-10-01

### Added
- **Admin shows a notice when you're editing next staff year.** Picking next
  year in Admin (for example 2028 during 2027) shows a neutral note on every
  tab that it takes over from the current year when the staff year rolls over
  on 1 October.

### Fixed
- **Signing in to The SHED Staging with a SOW account comes back to the app.**
  Sometimes (most often the first sign-in on a phone) Google's sign-in ended on
  the website inside the sign-in window, which then offered to open the main
  app instead of returning to Staging. The website now hands the sign-in back
  to the app it belongs to (the test website to Staging, the live website to
  The SHED), and waits for the app before using the sign-in itself, so it only
  signs the website in when no app picked it up.

### Changed
- **Dependency updates** from Dependabot: convex-test 0.0.56, @convex-dev/auth
  0.0.95, jose 6.2.12, and vitest with its coverage tool on 5.0.3.
  react-native-pager-view stays on 8.0.2, the version Expo SDK 57 requires.

## [1.13.4] — 2026-10-01

### Changed
- **The head of the Governance division is an admin.** Alongside Data and IT,
  Human Resources and the Director, whoever heads Governance for the year now
  has admin permissions: the Admin tab, assigning roles, managing structure and
  deleting members. Other staff in Governance departments (Finance, Compliance)
  are not admins because of it.

## [1.13.3] — 2026-09-30

### Changed
- **Staff who leave become members, not alumni.** On 1 October, someone who
  was staff last year but isn't this year still has all their sign-ins moved
  onto their member record and their personal email shown instead of the staff
  one, but their Role becomes Member rather than Alumni. Leaving staff isn't
  graduating, so leaders set Alumni by hand when someone actually graduates. A
  non-staff role already set on the member (Alumni, Newcomer, …) is kept.

## [1.13.2] — 2026-09-30

### Changed
- **Expo packages are on the latest SDK 57 patch releases** (expo 57.0.26,
  expo-router 57.0.24, @expo/ui 57.0.21, expo-constants 57.0.20,
  expo-document-picker 57.0.3). Expo shipped these after 1.13.1 was reviewed,
  so the CI check that keeps packages in line with the SDK started failing on
  main. No change to how the app behaves.

## [1.13.1] — 2026-09-29

### Added
- **Staff who leave become alumni on October 1.** At 01:30 on 1 October, after
  the staff year turns over, everyone who was staff last year but isn't this
  year becomes an ordinary member with the Role Alumni. All their sign-ins,
  including past years', move onto that one member record, so they're one
  person from then on (their past events now show them as a member rather than
  staff). Their staff email comes off and their personal email shows instead,
  or nothing if none was recorded. Each person gets an audit entry. Someone
  taken off staff later in the year can be converted with the same admin
  command (dry run first).
- **Staff have a personal email beside their staff email.** Opening a staff
  member shows their staff email (read-only) and an Email field for their own
  address; everyone else just has Email. A staff email can't go in the personal
  field. Merging a member into staff now keeps the member's email as the staff
  person's personal one instead of dropping it, and searching Members finds
  staff by their personal email too.

### Changed
- **Member names are capitalised when created or edited.** The first letter of
  each word becomes a capital as you type ("jane doe" → "Jane Doe"); letters
  already capitalised stay as they are, so "McDonald" and "JANE DOE" are kept.
  An admin command capitalises names saved before this (dry run first).
- **Merging looks and loads like the Members list.** People in the merge
  search show the same avatar, campus colour and pill as Members. Results stay
  on screen while a new search loads, with a spinner in the search box, instead
  of the list flashing to a big spinner on every keystroke. "Swap which one is
  kept" updates the review in place, and "Choose someone else" goes straight
  back to the results.
- **Search boxes in Attendance all work the same way.** Members, Audit, an
  event's roll-call and Merge share one search box with a clear button, no
  auto-capitals or autocorrect, and a spinner while results load. Members and
  Audit keep their list up while a new search loads.

### Fixed
- **Sheets make room for the keyboard.** With the keyboard up, a sheet like
  Edit member uses all the space above it instead of shrinking and floating
  with a gap, and the field you tap scrolls fully into view, including the last
  one (Notes) and when moving between fields.
- **Searching Members or Audit from far down the list shows the results.**
  Previously the list could stay scrolled past the shorter results and look
  empty until you pulled down.
- **A failed member delete shows its error** in the delete sheet rather than
  hidden behind it.

## [1.13.0] — 2026-09-25

### Added
- **Merge duplicate members instead of deleting them.** Open a member, tap
  merge (or "Merge instead" when deleting) and search for the duplicate. The
  review shows who is kept, who is removed, each side's event count and last
  visit, and lets you pick which name, email or detail to keep where they
  differ. All attendance moves across; an event both attended becomes one
  record. Details from every group (a USYD Instagram, a UNSW zID) are kept.
  Between two members, whoever has attended more is kept by default (Swap to
  change it). A member can merge into staff; staff are always kept, can't be
  swapped out, and two staff can't merge. A bold red line warns it can't be
  undone.
- **A sign-in can be undone for 10 minutes after it's made**, even once the
  event has ended, so a wrong tap can be fixed straight away. The audit log
  notes when this happens.

### Changed
- **Only admins (Data and IT, Human Resources and the Director) can delete a
  member.** Everyone else merges duplicates instead. Deleting lists what is
  lost: the count and every event, a bold red "This can't be undone.", and a
  pointer to Merge.
- **Deleting an event warns the same way.** It names everyone whose attendance
  goes with it, shows a bold red "This can't be undone.", suggests signing them
  in to the right event first if it's a duplicate, and the audit entry lists
  who was removed.
- **A member can't have a staff email.** Saving one used to split the person's
  attendance in two. Now an existing member is offered "Merge into …", and a new
  member can't be added under a staff email (former staff included).
- **If someone else deletes or merges a member you have open**, the sheet says
  so instead of letting you edit a record that no longer exists.
- **Confirming a name ignores capitals and extra spaces.**
- **The audit log names the deleted member and, for merges, which details came
  from the removed person.**

### Fixed
- **Split staff attendance can be repaired, and lost attendance restored.** Two
  admin commands (dry run first): one moves sign-ins made the old way onto the
  staff person and folds hidden duplicates together; the other puts back
  attendance deleted by mistake, skipping anything already there. Dry runs
  change and record nothing; applied changes are recorded in the audit log,
  which now names these as "System" rather than a raw id.
- **The nightly BigQuery load retries a brief sign-in or network hiccup**
  instead of failing the whole night, as it did on 25 September.

## [1.12.1] — 2026-09-25

### Changed
- **Admin → Users keeps long unassigned lists short.** Previously staff, Signed
  in with no assignment, In directory with no assignment, and Leaving each show
  up to 3 people and scroll inside their own box, like Not signed in on an
  event, so the assigned staff below are no longer pushed far down the page.
  A soft shadow along the top or bottom edge shows when there are more people
  to scroll to in that direction. Signed in with no assignment now shows its
  count like the other lists.
- **"Move to unassigned" on the Leaving list is now "Retain".** It still keeps
  the person on for the year and moves them back to the unassigned lists.
- **Nine Expo packages are back in step with the Expo release.** Expo shipped
  new SDK 57 patch releases, so the dependency check started failing on every
  pull request. `expo`, `expo-router`, `expo-notifications`, `expo-image-picker`,
  `expo-sharing`, `expo-auth-session`, `expo-linking`, `expo-constants` and
  `@expo/ui` are now on the expected patch versions.

### Fixed
- **Two reminder tests no longer fail in the last week of September.** They
  moved the clock eight days past today, which near 1 October lands in the next
  staff year, where nobody is assigned yet. They now run at a fixed point inside
  the current staff year, so they pass on any date.

## [1.12.0] — 2026-09-15

### Changed
- **Receipt files can now be up to 5MB each.** The old 2MB limit turned away
  ordinary phone photos and multi-page scanned PDFs, so people had to shrink
  them before uploading. The app and the server now both accept receipt files
  up to 5MB. The other receipt limits are unchanged (10 files per recipient, 50
  per receipt), and profile photos stay at 2MB.

## [1.11.15] — 2026-09-14

### Fixed
- **A thread opened from a link stays closed once you close it, even after you
  approve the request.** 1.11.14 stopped a deep-linked comment thread from
  re-opening when a request's status changed, but only while the card stayed in
  the same place. In Review, approving or declining moves the card into
  Reviewed, which built a fresh card that read the link again and popped the
  thread back open. The link now opens its thread once per tap; tapping the
  notification again still opens it.
- **The end-to-end test suite signs in as the right person.** The test sign-in
  helper closed the app before the new session was saved, so flows sometimes
  ran as the previous account or signed out and failed at random. It now waits
  for the sign-in to finish. The payment flow also checks the Pay sheet's
  current "Enter the amount that was paid." message.

## [1.11.14] — 2026-09-14

### Fixed
- **Cancelling a request now removes its receipt files and its notifications.**
  A fully approved request whose receipt had been submitted could still be
  cancelled, but its uploaded files stayed in storage forever and the approvers'
  in-app notifications kept pointing at a request that no longer existed. Both
  are now cleaned up, in small batches behind the scenes, along with the
  comments, reactions and audit trail. Deleting a declined request uses the
  same cleanup.
- **Insights can be refreshed manually again.** The manual refresh was
  throttled against the time of the last *automatic* rebuild, and since the
  nightly rebuild always ran more recently than a week ago, the manual path was
  permanently blocked. The cooldown now counts manual refreshes only.
- **The annual receipt-file purge no longer tries to do everything in one go.**
  It walks requests a page at a time and continues in the background, so it
  finishes no matter how many requests have accumulated since 2021.
- **Reminders and "who acted on this step" now look at the latest activity.**
  Both read a request's audit trail oldest-first and stopped after 200 entries,
  so a very busy request could show a stale approver and be reminded on the
  wrong schedule. They now read newest-first.
- **Admins keep their Finance settings during the October rollover.** Setting
  the Budget Manager, the Director threshold and delegations checked the
  current year's profile only, unlike the rest of the Admin tab, which honours
  the grace period until January. They all use the same rule now.
- **Someone configured as Director skips the Director step on their own
  request**, exactly as the HOD, Budget Manager and Finance Head already do,
  even if the role on their profile is momentarily out of step.
- **Insights chart labels and month buckets use Sydney dates.** An event at
  9am on the 1st of a month was labelled the last day of the previous month.
- **Insights count one person once when the same staff member signed in under
  their old and new email domain.** The legacy address is folded into the
  current one when building the identity key.
- **Charts in "Lines" mode no longer drop a series that is missing from the
  first year.** Series are collected across every point.
- **Money is compared and exported in cents.** A receipt total of 10.10 +
  20.20 no longer reads as 30.299999999999997 in the CSV export, no longer
  triggers a spurious "receipt exceeds request" warning, and a payment that
  matches the request to the cent no longer emails the Budget Manager about a
  change. A whitespace-only payment comment is treated as no comment.
- **Imported roll-call members are stored with a lower-case email**, so they
  are found by the same lookups as members created in the app, instead of being
  duplicated on the next import. Imported student year levels are worked out
  from the Sydney calendar date of the event, including during daylight saving.
- **Renaming or removing a department, division, university or role now
  updates every profile in the year**, not just the first thousand, and the
  "still has open requests" guard on department removal checks every request
  in the year rather than the oldest two hundred.
- **A repeated `focus` link parameter no longer breaks deep-linking into a
  request**, and the "Edit event" button tells screen readers when it is
  disabled. Reaction buttons in comment threads are labelled for screen
  readers.
- **A deep-linked comment thread stays closed once you close it**, even if the
  request completes in the meantime.
- **Paying a reimbursement checks the amount before sending it.** An empty
  paid amount shows a message instead of a round trip to the server.

### Changed
- **The app reads less to show the same thing.** "My requests", the unread
  comment badge and the year picker now use index ranges instead of filtering
  every request the person has ever made; unread counts read only the comments
  newer than your last visit; the stale-request reminder resolves each year's
  approvers once rather than once per request; the member-name lookup uses its
  index; deleting several metadata fields reads the member list once; and
  campus weekly attendance scans newest events first so a busy history never
  drops the current year.
- **Bank fields cap their length** at six digits for a BSB and ten for an
  account number.
- **Internal tidy-up with no visible change**: one shared helper each for
  resolving a person's display name, the approver for a step, the campus pill
  in attendance lists, paged lists (Members, Events, Audit and campus event
  pages), the default Insights/Attendance campus, the once-a-minute "time ago"
  ticker, the locked Campus/Role metadata rules and the metadata subtitle;
  the two-branch staff profile editor shares its validation; several dead
  exports (an unused seven-day auth grace constant, a stale weekly-meeting
  timetable that disagreed with the Home tab, unused links) are gone; and the
  Insights docs describe the nightly rebuild rather than the removed
  15-minute one.

## [1.11.13] — 2026-09-13

### Fixed
- **The bottom button no longer floats too high when the keyboard is up.** On
  tab screens such as Members, the "+ Create member" button used to rise by
  the full keyboard height even though the tab bar already sat between it and
  the bottom of the screen, leaving a tab-bar-sized gap above the keyboard.
  The button now measures where it actually sits on screen and rests a normal
  margin above the keyboard everywhere, including the event roll-call page.
- **Fields near the bottom of a page are no longer hidden behind the
  keyboard.** Admin, Members, Audit and the other page-level scroll views now
  make room for the keyboard on iOS: the focused field scrolls into view, and
  the page can scroll all the way to its last element while the keyboard stays
  open. Tapping a button while the keyboard is up now works on the first tap
  instead of only dismissing the keyboard.

### Changed
- **Attendance Insights now refresh once a night instead of being polled every
  15 minutes.** The poll ran 96 times a day on every backend, including the
  development one nobody was looking at, and was the largest single reader of
  the database. One nightly rebuild at 16:00 UTC (02:00 Sydney, 03:00 during
  daylight saving) covers every campus and the org-wide view for the current
  staff year, and for the incoming year during the October prefill window. The
  weekly Thursday rebuild is folded into it.
- **Sign-ins and event edits no longer write a "needs recompute" flag.** With
  nothing left to read it, the flag and its table are gone.
- **Expo packages are back in step with the release.** Expo shipped patch
  updates after 1.11.12, and the dependency check that runs on every change
  caught the drift; twenty-one packages are bumped to the expected versions.

## [1.11.12] — 2026-09-10

### Changed
- **The app's building blocks now all come from the same Expo release.** 1.11.11
  fixed one package that had drifted ahead of the others and broken the iOS
  build; seventeen more were sitting at older versions than the release expects.
  They are now in step, so the fixes and patches that shipped with those
  versions are actually in the app.
- **A mismatch like that now fails on the pull request, not in a release.** The
  checks that run on every change include a dependency check, so a package that
  falls out of step is caught in minutes instead of seventeen minutes into a
  manual release build.

## [1.11.11] — 2026-09-10

### Fixed
- **iOS releases build again.** The last production run shipped Android but
  failed on iOS, so no new TestFlight build went out. The SwiftUI toolkit the
  app uses had moved ahead of the Expo runtime pinned alongside it and called
  into APIs that were not there yet. Both now come from the same Expo release,
  and the iOS compile is clean.

## [1.11.10] — 2026-09-10

### Changed
- **Signing in at a campus no longer rebuilds every Insights chart.** The
  15-minute job only refreshes that campus's 1-week view. Org-wide Insights
  and the 4-week / 52-week charts catch up on the nightly job. History
  loaded for those rebuilds is 52 weeks (the longest chart), not 110.

## [1.11.9] — 2026-09-07

### Fixed
- **Opening Notifications marks them all read.** The bell badge clears when
  you view the list. You no longer have to tap each item (or Mark all read).
- **Nightly Looker/Sheets views no longer die on BigQuery reserved word `at`.**
  Trend charts quote that column so `insights_weekly_trend` and the other
  Insights series views can be created.

## [1.11.8] — 2026-09-03

### Added
- **Looker Studio and Sheets can use the warehouse like the Insights tab.**
  After the nightly copy, `convex_warehouse` now has flat views with no JSON:
  Insights summary, weekly trend, follow-ups, campus mix, staff assignments,
  attendance with event names, and request status. Payment lines
  (`request_recipients`) include bank details — treat them as finance data.

## [1.11.7] — 2026-09-03

### Added
- **The nightly Convex copy is now queryable as a warehouse.** The JSON
  snapshot in `convex_production` is unchanged. After it loads, typed views
  land in `convex_warehouse` so attendance, requests and org can be selected
  as columns (`email`, `amount`, `signInTime`) instead of picking fields out
  of `document`. Nested receipts and assignments stay JSON. Auth sessions
  and push tokens stay out.

## [1.11.6] — 2026-09-02

### Fixed
- **Org Chart people are named properly for VoiceOver.** Each person row now
  reads as "Name, role" instead of a silent button, so a visitor can find the
  Director card without seeing the screen.
- **The Maestro suite matches the live iOS labels again.** Seven flows that
  failed on latest main (logo, smoke, role tabs, test-env chip, finance pay,
  public org chart) now follow the real tab labels, the test-environment
  chip's period (not an em dash), and swipe past the mixed live Review queue
  to Ready to Pay.

## [1.11.5] — 2026-09-01

### Added
- **Admin → Users now lists people who were staff in an earlier year.** After a
  directory sync, they sit under "Previously staff" on the year you are editing,
  with the last year they served. Assigning them creates this year's profile and
  links it to the old one, so Insights treats them as the same person. The match
  is by email, including the sow.org.au / sowaustralia.com pair.

### Fixed
- **Previously staff only counts earlier years.** Someone already assigned next
  year no longer shows as returning staff on this year.
- **Assigning a returner keeps their signed-in account** even when the old
  profile already had an import id.
- **The two SOW email spellings no longer appear twice** on Previously staff.

## [1.11.4] — 2026-09-01

### Fixed
- **The nightly BigQuery load no longer dies on a `bq` warning.** GitHub's
  `bq ls --format=json` prints a WARNING line before the JSON. The loader
  treated that as the payload and crashed after converting the zip. It now
  ignores that prefix.

## [1.11.3] — 2026-08-31

### Added
- **Production Convex is copied into BigQuery each night.** The daily backup
  already wrote a zip to Cloud Storage. It now also replaces the contents of
  the business tables in dataset `convex_production` so attendance, requests
  and org can be queried with SQL. Auth sessions, refresh tokens and push
  tokens stay out. The zip still uploads if the warehouse load fails.

## [1.11.2] — 2026-08-30

### Added
- **Deleting a member now records what went with them.** The audit entry used to
  say only how many attendance records were removed, so once the rows were gone
  there was no way to tell which events they belonged to. It now lists each one
  by event name and sign-in time, newest first, and an event that was itself
  already deleted still leaves a line rather than disappearing. Long histories
  are capped at 100 lines, with the exact count kept above the list.

### Changed
- **The delete-member confirmation says outright that it cannot be undone.** It
  also mentions that the audit log keeps a record of what was removed, and the
  button now reads "Delete permanently".
- **Tidied the wording across the app and the README again.** The same pass as
  1.10.16: sentences joined with a dash become plain sentences, and dashes used
  purely to separate a label from a value become the interpunct the app already
  uses. The no-value placeholder glyph is untouched.
- **Dependencies moved to the versions Expo SDK 57 asks for.** `expo-file-system`
  to 57.0.6, `expo-router` to 57.0.17 and `eslint-config-expo` to 57.0.2. The
  open bumps for `react-native-gesture-handler` (a major, ahead of the native
  module the SDK bundles), `react-dom` (which would need React bumped with it)
  and `eslint` 10 (which breaks `expo lint` through `eslint-config-expo`) are
  deliberately not taken.

## [1.11.1] — 2026-08-26

### Changed
- **Comments that only restated the source are gone.** The app does the same things. Compiler and linter directives stay, as do the ADRs and glossaries that already record the decisions the comments used to repeat.

## [1.11.0] — 2026-08-26

### Changed
- **The 1 October staff-year copy now runs at 9pm the evening before, so Insights is ready at midnight.** The clock still flips the year at Sydney midnight. The job that used to run one minute later, and that people called the rollover, is a prefill: it copies the incoming year into the year after it (on 30 Sep 2026 that is 2027 into 2028) and writes next year's Insights snapshots before anyone opens the tab. A skip no longer re-emails, but it still rebuilds those snapshots. Staff who have not been assigned in the new year can keep using the app until 1 January, not just for a week. Receipt files are kept for the current and previous staff years only: the 1am job after the flip deletes older files (on 1 Oct 2026, everything through 30 Sep 2025). Names stay on the request.

### Documentation
- **The October 1 contract now names the prefill, auth grace, and receipt retention.** ADR 0003 and the Org / Attendance / Reimbursements glossaries record the two-year-ahead copy, snapshots keyed by staff year, grace until the calendar year catches up, and which receipt files survive the night.

## [1.10.16] — 2026-08-21

### Changed
- **The yearly rollover summary now goes to both Info and IT.** It was sent to
  Info alone, so IT lost sight of the one message that confirms the staff-year
  rollover ran. Both addresses now receive it as separate emails, so a problem
  delivering to one cannot stop the other arriving.
- **Tidied the wording across the app.** Sentences that were joined with a dash
  are now plain sentences, which reads better and gives screen readers a proper
  pause. Where a dash was only separating two pieces of information, such as an
  event name and its location, it now uses the same dot separator the rest of
  the app already uses. Wording SOW publishes on its own website, including the
  mission statement, the values and the campus descriptions, is untouched.

## [1.10.15] — 2026-08-21

### Fixed
- **A campus can no longer quietly unlock itself when the staff year turns
  over.** The Campus options on a member came from the current staff year's
  universities alone, so at midnight on October 1 a campus that hadn't been set
  up in the new year stopped counting as part of the org structure — it became
  an ordinary, deletable option even though every member from that campus was
  still sitting on it. Campus options now come from the previous and current
  staff years together, so the turnover leaves them alone. A campus that has
  been absent for a full year does become removable, which is the point.

### Changed
- **The staff-year rollover summary now reports everything it copied, and goes
  to info@sow.org.au.** The yearly email that confirms the rollover ran listed
  divisions, departments, staff profiles, the budget manager and the director
  threshold — but not the universities or roles, which it also copies. That
  made it impossible to tell from the email whether the campus list had carried
  over, and the campus list decides which Campus options members can be given.
  Both are now in the summary.

### Documentation
- **The repo now says what its words mean.** A `CONTEXT-MAP.md` splits the app
  into its three areas — the org structure, reimbursements, and attendance —
  each with a glossary, plus decision records under `docs/adr/` covering that
  split, the campus/university relationship, and the October 1 rollover.
- **README and LAUNCH.md now match the app.** README described release
  workflows and inputs that no longer exist and said sign-in was staff-only,
  which stopped being true when visitor sign-in shipped. LAUNCH.md still listed
  work as outstanding that has since been done and verified. Both have been
  rewritten against the live setup, and the PR checklist now asks for the docs
  to be kept true as part of shipping.

## [1.10.14] — 2026-08-20

### Changed
- **Retention and tenure wait a week after 1 October before using the new roster.**
  Head-count charts still pick up the new staff year the moment the clock flips,
  but retention, turnover, and years-served stay on last year’s complete numbers
  for the first week. A half-finished assignment list no longer reads as a mass
  resignation.

### Fixed
- **Custom attendance ranges that span three staff years keep the right identities.**
  A two-year custom window can cross two October flips (for example August to
  August). Those charts now load the extra year, so people aren’t rewritten as
  this year’s role just because the older year wasn’t in the map.

## [1.10.13] — 2026-08-18

### Changed
- **New attendance members now start each word with a capital.** Typing or
  pasting "jane doe" in the create-member form becomes "Jane Doe" as you go
  (and when the name is saved), so a new person isn't stored in all-lowercase
  just because the keyboard didn't shift. Existing names are left alone when
  you edit them.
- **CSV export lets you turn Year, Gender, Campus and Role off.** Those four
  used to sit locked on with a padlock, same as Name and Email, so every
  export included them even when you only wanted a short list. They now
  behave like the other metadata columns — on by default, but you can
  uncheck them. Sign in, name, email (and attendance % on the grid) stay
  locked, because the file still needs to identify each person.

## [1.10.12] — 2026-08-14

### Changed
- **General Insights now move with the staff year on 1 October.** The last-five-years
  staff charts used to keep showing last year’s roster for the first week after
  rollover. They now include the new current year as soon as the clock flips
  (next year’s pre-assignments stay hidden). Weekly-meeting averages still omit
  a year until that campus has actually met, so you don’t get a row of zeros.

### Fixed
- **September’s “student leaders vs everyone else” and campus-mix charts keep
  last year’s identities after the flip.** A 2026 student leader who hasn’t been
  assigned for the new year was being counted as “everyone else” (and dropped
  from home-campus) the moment October started. Those charts now use the staff
  year of the event, same as the Role breakdown.

## [1.10.11] — 2026-08-14

### Fixed
- **Insights no longer go blank on 1 October.** When the staff year flips at
  Sydney midnight, last year's snapshots used to read as "not ready" and stay
  that way until Thursday's weekly rebuild — the 15-minute refresh had nothing
  marked dirty. The rollover now kicks a full rebuild, the 15-minute cron
  heals any campus still on last year's snapshot (including a brand-new
  campus), and the Attendance tab computes on the fly while that catches up.
  Past year works the same way if its snapshot hasn't been precomputed yet.

- **September attendance keeps last year's roles after the flip.** A staffer
  who hasn't been assigned for the new year used to be rewritten as a Member
  in September's Role breakdown the moment the clock moved. People are now
  classified against the staff year of the event they attended.

- **General Insights don't drop off a cliff on 1 October.** An empty new year
  is no longer plotted as a row of zeros, and staff-trend charts keep last
  year's complete roster as the newest point for the first week while
  assignments are still being finished.

- **Insights charts are easier to read.** Every staff year is labelled (no
  more skipped '23 / '25), legends sit under the title instead of squeezing
  beside it, weekly-meeting bars are wider, the E2E test campus is off the
  public charts, and the last chart can scroll clear of the Bars / range
  pills.

## [1.10.10] — 2026-08-12

### Changed
- **Insights attendance time ranges are simpler, and you can pick custom dates.** The range picker is now Past week / Past month / Past year (instead of 1–12 week steps), with a custom From–To option for anything else. Charts default to the past month so leaders see a current operational window rather than a long trail of history.

- **General staff charts open on recent years, not the full archive.** Trend charts show the last five staff years by default, with All history still available when you want the long view. The redundant “All staff” and “Staff vs student leaders” pair is one stacked “All staff” chart broken into staff and student leaders.

### Fixed
- **Bar charts no longer stretch sparse bars across the card.** Bars sit next to each other in a tight cluster with clearer grid lines and denser axis ticks, so weekly meeting turnout is easier to read without opening the large chart.

## [1.10.9] — 2026-08-10

### Fixed
- **Grid export’s anonymous-identity fallback no longer collides.** Incomplete
  rows without an identity key used only sign-in time as a key, so two people
  who signed in in the same millisecond could still merge. The fallback now
  uses event id + row index so those rows stay separate.

## [1.10.8] — 2026-08-10

### Fixed
- **Grid export no longer merges different people who share a name.** The
  person × event CSV used to key rows by display name when someone had no email,
  so two “John Smith”s (or two “Unknown” guests) became one row. Each person is
  now tracked by a stable identity (email, member id, or attendance row id) so
  same names stay separate while the same person still lines up across events.

## [1.10.7] — 2026-08-09

### Added
- **Attendance export can now be a person × event grid.** From Export you can
  pick “Grid by person” instead of the usual list: people down the side, each
  event across the top (with a Y when they were there), an Attendance % column,
  and a Total Attendance row of headcounts per event — the layout you would
  build by hand in a spreadsheet. Attendance % only counts events that had
  someone signed in (a cancelled empty week does not drag every percentage
  down). The original list-by-event export is unchanged.

## [1.10.6] — 2026-08-08

### Added
- **General insights now show how long people stay.** On Insights → General you
  get year-over-year retention (with “% left” and prior roster size in the
  hint), the share who have served at least two years, and average years served
  so far — for overall, staff, and student leaders, both for a single staff year
  and over the whole history. All of these come from staff profiles only (org
  chart staff and student leaders), not attendance members. Staff and
  student-leader tenure count years in that role. Rate charts use a fixed 0–100
  axis; empty lenses are omitted rather than plotted as 0%.

## [1.10.5] — 2026-08-08

### Changed
- **Routine tooling update.** `eslint-config-expo` moves to the version Expo
  SDK 57 expects. Lint-time only — no app code or behaviour changes.

## [1.10.4] — 2026-08-07

### Changed
- **The colour stripe marking another group's event now runs down the very edge
  of the events list.** It previously sat a little way in from the edge, tucked
  tight against the date, and it nudged those events' text slightly right of
  every other row — so the list never quite lined up. The stripe now sits in the
  margin, the line between events runs the full width, and every event's date,
  name and pills line up with the "Events" heading whether or not the event
  belongs to another group.

- **Routine dependency updates.** Convex, `@auth/core`, `expo-auth-session` and
  the CI checkout action move to their latest compatible patch releases.

### Removed
- **Retired four documents that no longer describe the app.** The end-to-end
  test checklist has been replaced by the Maestro suite that was generated from
  it, and the two audit reports and the Sign in with Apple plan all describe
  work that has since shipped.

## [1.10.3] — 2026-07-27

### Added
- **The production database is now backed up automatically every day.** A
  database-only Convex snapshot is exported to private Google Cloud Storage so
  recovery does not depend solely on Convex's built-in retention window. Stored
  files are intentionally excluded from these backups.

## [1.10.2] — 2026-07-26

### Changed
- **The "add" box in Admin → Structure now sits at the top of each list.** Adding
  a role, division, department or university meant scrolling past everything
  that already existed to reach the form at the bottom — worst on Departments
  and Universities, where the list only grows. The form is now the first thing
  in each list, so adding is always one scroll away from the top.
- **Events fill the width of the screen.** The event list had its own indent on
  top of the page margin, so event dates and names sat further in than the
  "Events" heading and the campus row above them. That indent is gone: each
  event now lines up with everything else on the page and has more room for
  long names and tags.

## [1.10.1] — 2026-07-25

### Fixed
- **Dollar amounts in emails, notifications and the request history now read
  like they do in the app.** A $1,234.50 request used to turn up as "$1234.5" in
  its approval email, its push notification and its audit trail — cents dropped,
  no thousands separator. Every money figure the backend writes now uses the
  same formatting as the screens, so an amount reads the same wherever you see
  it.
- **The "Weekly consistency" figure is no longer rounded to the nearest 10%.**
  It was being stored to one decimal place before being shown as a percentage,
  so a group sitting at 67% steadiness displayed "70%" and the number could only
  ever land on 0%, 10%, 20% and so on. It now shows the real figure.
- **Older events are no longer mislabelled "Collaborative".** Some events
  imported from the previous system record the whole-org group twice (under both
  its old and current name). The events list counted that as two groups, badged
  the event as shared between campuses and drew a duplicate campus pill — while
  the CSV export and Insights, which tidy the value up first, correctly treated
  it as one group. All three now agree.

### Changed
- **Groundwork: shared date, time and money helpers.** The date and time fields,
  the CSV export, the notification feed and the comment thread each carried their
  own private copy of the same formatting code; they now share one tested set, so
  a fix in one place lands everywhere. The comment reaction picker is likewise
  now built from the same emoji list the server validates against, so the two
  can't drift apart. No visible change — a reminder about who to chase for an
  approval also now goes through the exact same "who's next" logic the approval
  flow itself uses, rather than a second copy of it.

## [1.10.0] — 2026-07-17

### Changed
- **Upgraded to Expo SDK 57 (React Native 0.86).** Bumped `expo` → ~57.0.6 and
  ran `npx expo install --fix` to move every Expo module, React Native
  (0.85 → 0.86), Reanimated (4.3 → 4.5), Worklets (0.8 → 0.10) and
  `eslint-config-expo` (56 → 57) onto the SDK 57 line. `npm ci`, lint,
  typecheck, the 668-test suite and the web export (`expo export --platform
  web`, the Vercel build) all pass — the export was previously red because
  Dependabot's standalone `expo-constants@57` bump collided with `expo-router`'s
  SDK 56 peer range. This is the SDK 57 jump that 1.8.11 deliberately deferred.
  Supersedes Dependabot #233 (`actions/setup-node` 6→7), #234
  (`expo-file-system`), #235 (`expo-system-ui`), #237 (`expo-auth-session`) and
  #238 (`expo-constants`). #236 (ESLint 9→10) is **not** included:
  `eslint-config-expo@57` still pins `eslint-plugin-react@7.37.5`, which calls
  the ESLint-10-removed `context.getFilename()` API, so ESLint stays on ^9 until
  upstream adds ESLint 10 support.

## [1.9.7] — 2026-07-16

### Changed
- **The top-left SHED logo always takes you to Home now.** Tapping it from any
  screen returns to the public Home tab, for everyone.
- **A little more breathing room in the top bar and attendance search.** The
  notification bell and your profile picture no longer sit flush together, and
  the Members and Audit search bars now have a small gap below the Filters
  button.

### Fixed
- **Swiping between the attendance tabs now lowers the keyboard.** If you were
  typing in a search box and flicked across to another tab, the keyboard used
  to linger over the new page — it now drops as soon as the swipe begins.

## [1.9.6] — 2026-07-14

### Fixed
- **Opening the app from a push notification no longer stacks loading screens forever.**
  A sticky last-notification response was replayed on every remount while the
  app was still loading your role, so tapping a push could loop the spinner
  until you force-quit. The tap is now followed once, cleared, and only after
  navigation is ready.
- **Approver delegates now get the same push (and in-app / email) as the person
  they’re covering.** “Approval needed”, stale reminders, receipt-ready-to-pay,
  and comment pings to the action owner fan out to year-scoped delegates too —
  so covering Missions (or any other office) for a staff year includes the
  notification, not just Review-tab access.

## [1.9.5] — 2026-07-14

### Fixed
- **Android push notifications for the Play internal-testing build.** Production
  builds now include Firebase `google-services.json` (via EAS env), and the
  existing `theshedsow` service account is used for FCM V1 delivery.

## [1.9.4] — 2026-07-14

### Fixed
- **Delegated approvers now show on request cards instead of the officeholder.**
  When someone is covering (e.g. HOD*), the status strip shows the stand-in’s
  name with a * on the role. Tapping the step explains they are covering for
  the usual person and can approve in their place.

## [1.9.3] — 2026-07-11

### Fixed
- **Native receipt (and avatar) uploads no longer fail with a Blob error.**
  iOS/Android now upload via expo-file-system instead of React Native's
  unsupported `fetch(uri).blob()` path ("Creating blobs from ArrayBuffer…").

## [1.9.2] — 2026-07-11

### Changed
- **Receipts on iOS/Android can come from Photos or Files.** Tapping Attach
  receipts now asks whether to pick from the photo library or the system file
  picker (PDFs and images), so phone photos don’t have to be saved into Files
  first. Web still uses the browser file chooser.

## [1.9.1] — 2026-07-10

### Changed
- **WSU Instagram is `@sowwsu`.** The Western Sydney University campus card
  now links to the campus handle instead of the org-wide account.
- **WSU / Seasons copy matches the campus announcement.** Connect describes
  SOW WSU as the newest campus and Seasons as Thursdays 6pm on Parramatta
  South Campus (no em dashes).

## [1.9.0] — 2026-07-10

### Added
- **Western Sydney University (WSU) campus.** Attendance, Insights, Org chart,
  Admin, and the public Home → Connect list now include Western Sydney
  University as a campus group, with crimson branding (`#A60F2D`) and a matching
  wordmark. Production seeds the **2027** university row (next staff year);
  ops helpers `admin:ensureUniversity` / `admin:removeUniversityRow` can add or
  remove a year-scoped campus without an admin session.
- **Seasons on Home.** Connect explains Seasons — the biblical training course
  held at WSU — alongside REAP and the campus cards.

### Changed
- **WSU brand colour** updated from `#990033` to crimson `#A60F2D` everywhere
  campus colour is used (org chart, attendance chips, member-card outlines,
  Insights charts).

## [1.8.12] — 2026-07-10

### Fixed
- **Rollover no longer aborts on a duplicate `yearSettings` row.**
  `getYearSettings` now uses `.first()` (same as profiles/departments), so a
  stray duplicate can't throw and stop the Oct 1 cron or Finance settings reads.
- **Director lookup no longer walks every staff profile on the hot path.**
  Assigning or clearing the Director caches their email on `yearSettings`;
  `getApprovers` reads the cache (and only scans when the cache is unset).
- **Staff-year / Sydney calendar boundaries survive a broken `Intl` zone.**
  If `Intl.formatToParts` throws or returns junk (historically shaky on some
  Android Hermes builds), we fall back to fixed AEDT/AEST offset math so the
  app doesn't crash or mis-bucket around Oct 1 / Jan 1.

### Changed
- **Lists load more as you scroll — no more "Load more" buttons.** The All →
  Ongoing tab now pages 20 at a time like Completed, and every attendance list
  that used a Load more button (Events, Members, Audit, subgroup events, and
  the event roll-call roster) now reveals the next page when you scroll near
  the bottom. A small spinner shows while the next page is loading.

### Added
- **Mac feature workflow skills.** `create-feature` and an expanded
  `create-pr` skill document the local Metro / baguette / Netlify verify loop
  used on this machine before opening a PR.

## [1.8.11] — 2026-07-10

### Changed
- **Expo SDK 56 dependency alignment (safe patch bumps).** Dependabot opened
  several chore PRs that jumped individual packages to Expo SDK 57 / React
  Native 0.86 / TypeScript 7, which break `npm ci` against this app's SDK 56
  peer ranges (`react-native-reanimated` needs RN ≤0.85; `convex-helpers`
  needs TypeScript ^5.5 || ^6). This release instead runs `npx expo install
  --fix` so every Expo module stays on the SDK 56 line (e.g. `expo` →
  ~56.0.15, `expo-dev-client` → ~56.0.22, `expo-sharing` → ~56.0.21).
  Supersedes #218, #219, #220, #221, and #222.

## [1.8.10] — 2026-07-09

### Fixed

- **Staff year uses Australia/Sydney, not a hard-coded UTC offset.** Oct 1 and
  Jan 1 boundaries now go through `Intl` with the IANA zone, so DST rule changes
  can't silently drift the rollover instant.
- **A week of breathing room after Oct 1.** If your new staff-year profile isn't
  ready yet, the app reuses last year's profile for the first 7 days after
  rollover (sign-in, approvals, Admin) instead of locking you out at midnight.

### Changed

- **Documented intentional deferrals** in the rollover audit: live request-list
  caps stay bounded on purpose; leavers/delegations are not auto-copied;
  multi-day events keep the staff year of their start date.

## [1.8.9] — 2026-07-09

### Fixed

- **Staff-year rollover is idempotent.** A second Oct 1 cron run (or accidental
  re-run) no longer overwrites next-year heads, assignments, or the Budget
  Manager — completion is recorded on `yearSettings`, and the cron no-ops
  without re-emailing IT. Manual `copyYear` still works; pass `force: true` to
  intentionally redo.
- **Large orgs no longer lose rows in the annual copy.** Divisions, departments,
  universities, roles, and staff profiles are streamed for the full year instead
  of hard `take()` caps.
- **Director is found even past the 1000th profile.** Approver resolution streams
  the year instead of stopping early.
- **Failed Resend sends surface in the Convex dashboard.** HTTP errors from
  Resend now throw (so scheduled emails show as failed) instead of only logging.
  The rollover IT email also includes a Deployment URL line.

### Changed

- **Receipt purge runs an hour after rollover** (Sep 30 15:00 UTC) so the two
  heavy jobs don't share the same minute.
- **Director approval threshold is copied** into the next staff year alongside
  the Budget Manager.

### Added

- Follow-up notes in `docs/rollover-crons-audit.md` for the 1.8.9 remediations.

## [1.8.8] — 2026-07-09

### Fixed

- **Staff-year rollover no longer aborts on stray duplicate rows.** The annual
  Oct 1 copy used to throw if a destination year already had a duplicate
  division, department, or profile (e.g. mid-import). It now matches with
  `.first()` like the rest of the admin read path, so the cron can finish and
  still email IT.
- **Budget Manager picker works for next year after rollover.** Admins whose
  next-year profile is a plain staff assignment (no Data-and-IT / division-head
  role yet) can still open the Finance member list for that year — the same
  current-year admin gate already used by the rest of the Admin screen.

### Added

- **Rollover & cron audit** (`docs/rollover-crons-audit.md`): failure modes for
  `copyYear` / `rollOverStaffYear`, every job in `crons.ts`, carry-over
  requests, and an Oct 1 runbook.

## [1.8.7] — 2026-07-08

### Fixed

- **The web sign-in message now actually shows.** Signing in with a SOW email on
  the personal "Sign in with Google" option was still silent on the web app —
  React Native Web's `Alert` is a no-op, so the message never rendered. It now
  uses the browser's own dialog. (Same for the "Sign-in didn't finish" error.)
- **Attendance rows: tapping the right side reveals the sign-in arrow.** The
  tap-to-preview used the window width, not the card's actual width, so in the
  wide/column layouts the right-side sign-in reveal shrank to a sliver at the far
  edge (while the left-side edit reveal stayed generous). Cards now measure their
  real width, so both sides reveal evenly (and swipe distances are right too).

### Changed

- **Admin console uses the full width with card grids.** On wide screens the
  Users, Structure and Other tabs now lay each section's cards out left-to-right
  (360pt each, as many per row as fit — two on an iPad portrait, three on a
  desktop) instead of one 720pt column — the whole
  year's staff, departments and settings scan at a glance. The Structure sub-tab
  bar (Roles / Divisions / Departments / Universities) keeps its reading-width
  cap, and phones are unchanged (the grids collapse to a single column).
- **Event attendance page is a little wider.** The roster's container now caps
  at 840pt (was 720), giving the side-by-side signed-in / not-signed-in columns
  more room on tablets and desktop.
- **Org chart reads as a centred tree.** Every card (Director, division heads,
  departments, campuses) is now a fixed narrow width, centred, and wraps — so a
  division with one department shows a single centred card instead of one
  stretched across the screen, and several departments sit side by side as a
  centred row.
- **Not-signed-in list stays visible on finished events.** You no longer have to
  tap "Enable editing" to see who didn't sign in — the list shows read-only
  (greyed) until editing is enabled.
- **General insights charts sit side by side.** The trend charts now flow in a
  grid (as many as fit, ~440pt each) like the summary cards, rather than one full
  width chart per row. The "Needs follow-up" list is centred at a comfortable
  reading width.
- **Wide layouts no longer flicker while resizing.** The responsive grids
  (org chart, requests) are now pure flexbox instead of measuring on every layout
  tick, so dragging the window smaller reflows smoothly instead of flickering
  between column counts.

## [1.8.6] — 2026-07-08

### Changed

- **Wide screens use the space.** Beyond the attendance roster (1.8.5), more
  screens now switch to a wide, multi-column layout above a phone-portrait width
  (~700pt — tablets, landscape, web/desktop):
  - **Org chart:** each division's departments lay out as columns (as many as
    fit, ~300pt each, wrapping when there are more), and the campuses do the
    same — instead of one long stacked list.
  - **Metrics / Insights:** charts span the full screen width rather than a
    720pt column.
  - **Requests:** the Mine and All lists show as side-by-side cards. (Review and
    Bank stay a single readable column.)
  Phones in portrait are unchanged.

### Fixed

- **Signing in with a SOW email on the personal "Sign in with Google" option now
  explains itself on the web app.** On phones it already showed a "Use your SOW
  account" prompt; on the web it failed silently after the redirect. It now shows
  the same message.
- **Opening a link in the app no longer also opens the App Store.** On mobile
  web, tapping "Open" on the app prompt could still bounce to the store a moment
  later if the tap was slow. The store fallback now only fires when the app
  clearly didn't open (the tab is still visible and focused), so it's the app or
  the store, never both.

### Changed

- **Roster splits into two columns on wide screens.** On tablets, landscape, and
  the web/desktop app (anything wider than a phone in portrait), an event's
  attendance roster now shows side by side — not signed in on the left, signed in
  on the right — instead of stacked. Each column scrolls on its own, so scrolling
  one side never moves the other or the rest of the page. Phones in portrait are
  unchanged (single column).

## [1.8.4] — 2026-07-07

### Added

- **Receipt total.** When a receipt has more than one recipient, the submit
  sheet now shows a locked, auto-calculated "Total ($)" that sums the recipient
  amounts (read-only, so it's clearly derived), and the request card shows a
  matching **Total** line at the bottom of the receipts. Single-recipient
  receipts are unchanged — the one amount already is the total.
- **App version on your profile.** Your profile now shows the app version (e.g.
  "Version 1.8.4") under the Sign out button.

## [1.8.3] — 2026-07-07

### Fixed

- **Money fields now accept cents.** The request amount, receipt amount, paid
  amount, and the Director-approval threshold used the plain numeric keyboard,
  which on iOS has no decimal-point key — so amounts like "12.50" couldn't be
  entered. They now use the decimal keypad, and the shared input filter caps the
  entry at two fractional digits (dollars and cents), silently dropping any
  extra typed digits rather than accepting fractions of a cent.
- **Amounts with cents now display to two decimals, with thousands
  separators.** A request, receipt, paid amount, or the Director-approval
  threshold that has a fractional part is shown to exactly two decimals (e.g. an
  amount entered as "12.5" reads as "$12.50"), and dollars are grouped
  ("$1,234.50"). Whole-dollar amounts stay bare ("$12"). All money figures share
  one formatter so they read consistently.

## [1.8.2] — 2026-07-07

### Changed

- **Signed-in attendees now show their details, not just the time.** A
  signed-in roll-call row previously showed only the sign-in time (and any
  note). It now appends the same roles / metadata line an unsigned row shows —
  e.g. "5:03 PM · President · 3rd year" — so a person reads the same in either
  list, just with the time up front.
- **Campus dropped from roll-call subtitles.** Both signed-in and not-signed-in
  rows no longer repeat the campus in the subtitle line — the row's right-hand
  chip already shows it. Campus remains searchable (typing e.g. "Macquarie"
  still matches).

### Fixed

- **Switching the admin People picker to the next staff year no longer crashes
  the screen.** Admins manage both the current and next staff year, but the
  People list judged admin rights from the caller's profile _for the year being
  viewed_ — and an admin's authority usually comes from a division headship or
  Data-and-IT membership that their next-year profile doesn't carry. So picking
  next year threw "Only admins or the Finance Head can view people" and blanked
  the whole admin screen with "Something went wrong". Admin rights are now judged
  from the current staff year (the same basis as the rest of the admin screen),
  so the next year opens normally; the Finance Head still gets access for that
  year's delegation picker.
- **The full-screen error fallback now follows the theme.** "Something went
  wrong" previously always rendered on a light cream background; in dark mode it
  flashed a bright panel. It now uses the app's dark palette (deep-green
  background, light text) when the system is in dark mode.

### Changed (internal)

- **Admin reads tolerate a stray duplicate profile/department.** `getProfile`
  and `getDepartment` now use `.first()` instead of `.unique()` (matching the
  existing attendance-member lookup), so a duplicate person-year or
  department-year row that briefly exists mid-import or mid-rollover degrades
  gracefully in reads rather than throwing a hard "Server Error". Write paths
  still enforce one row per key.

## [1.8.0] — 2026-07-07

### Added

- **Sign in with Apple.** The signed-out menu now offers "Sign in with Apple"
  on iOS, below the two Google options, satisfying App Store **Guideline 4.8
  (Login Services)** — an equivalent login that limits data to name + email,
  lets users hide their email behind a private relay, and doesn't harvest
  interactions for advertising. The native system sheet returns a signed
  identity token that the backend verifies against Apple's public keys before
  creating or reusing an account. Like a personal Google account, an Apple
  account is a visitor unless its email matches a staff profile; an
  `@sow.org.au` address is redirected to "Sign in with your SOW account".
  _(Requires the Sign In with Apple capability on the App IDs and a new native
  build; the row is hidden on Android and web.)_

### Changed

- **Snappier overlay and screen animations.** The sign-in dropdown, option
  sheets, and dialogs now fade in/out quickly (and dismiss faster than they
  appear), screen push/pop transitions are shorter, and list/content entrances
  cascade in faster — so you can tap in and out without waiting on motion.
  Durations are centralised in one place (`durations` in `theme.ts`).

## [1.7.5] — 2026-07-06

### Changed

- **Signed-out visitors now default to the Home tab** instead of the Org chart.
  The web entry point (`/`) and staff-tab deep links redirect signed-out users
  to Home; signed-in accounts without a staff profile still land on the Org
  chart.

## [1.7.4] — 2026-07-06

### Added

- **Home is now a tab for everyone.** The Home button sits on the left of the
  bottom bar for all users — visitors and signed-in staff alike — so anyone can
  return to the SOW landing surface at any time.
- **Sign in with a personal Google account.** The sign-in menu now offers a
  second option alongside "Sign in with your SOW account", letting anyone sign
  in with a personal (non-staff) Google account to use the public surfaces.
  _(Requires the Google OAuth consent screen to be "External"; Sign in with
  Apple is planned once Apple Developer credentials are configured.)_

### Changed

- **The top-left logo** takes signed-out visitors and signed-in accounts without
  a staff profile to the Home tab; staff still land on their workspace.
- **Insights is fully available to any signed-in account.** Signing in — even
  without a staff profile — now unlocks the full org-wide General dashboard (the
  year picker and per-year breakdown), not just the public preview. The
  per-campus Attendance view, which shows individual student data, stays
  staff-only.
- Personal (non-staff) accounts never appear in the Admin → Users assignment
  lists or the people picker; those remain @sow.org.au-only.
- **Web app moving to its own domain: `theshed.sow.org.au`** (from
  `the-shed-web.vercel.app`). Email/notification links, the canonical app URL,
  and the app's universal-link config now use the new domain; the old
  `.vercel.app` address keeps working during the cutover. Requires DNS + Vercel
  domain setup and the prod `SITE_URL` env var (see LAUNCH.md § 6).
- **Universal / app links are now configured.** The real
  `web/.well-known/apple-app-site-association` and `assetlinks.json` are in place
  (served as JSON via `web/vercel.json`), so tapping a `theshed.sow.org.au` link
  opens the native app — effective once these deploy and a native build ships
  the updated `associatedDomains`.

## [1.7.2] — 2026-07-05

### Fixed

- **Attendance roll-call sign-in/out no longer gets stuck showing the wrong
  state on failure.** If a sign-in or sign-out couldn't be saved (e.g. a
  connection hiccup), the row used to keep showing the optimistic result
  forever with no explanation; it now reverts and shows what went wrong.
- The **"Sign in with your SOW account"** menu (visitor avatar → Sign in) is
  now reachable by VoiceOver and other assistive tech — its button previously
  sat behind the menu's "tap outside to close" region, which made it
  invisible to screen readers even though it displayed normally.

## [1.7.1] — 2026-07-04

### Fixed

- Insights → General → **Weekly meeting attendance**: dropped "by campus"
  from the title, and it now follows the bars/lines toggle like the other
  trend charts (bar mode draws one bar per campus side by side, since the
  values are averages rather than a stack-able total).
- Insights → Attendance now defaults to a **2-week** range instead of 8.
- **New vs returning** and **Student leaders vs everyone else** are now
  shown only for individual campuses, not for the org-wide SOW view.
- Admin → Other: moved **Sync Directory Now** to the bottom of the section.
- Tapping the top-left "THE SHED" logo now goes to the **Home** tab (it was
  incorrectly routing to Requests).

## [1.7.0] — 2026-07-04

### Added

- **The app is now open to everyone.** You no longer need to sign in to use
  THE SHED — the app launches straight into the public Org chart, where
  anyone can browse who serves across SOW and open a person's profile and
  service history. Signing in (top-right avatar → "Sign in with Google")
  reveals the staff tools in place.
- **A new Home tab**, styled to the SOW brand guidelines, with four pages:
  - **Home** — SOW's mission and values (sow.org.au/our-mission), how to
    volunteer, and links to Instagram, Facebook, LinkedIn, Spotify and email.
  - **Resources** — the helpful websites, Christian psychologists and
    helplines from THE SHED web footer, with tap-to-call helpline numbers.
  - **Connect** — the four university societies in their campus colours,
    what happens at a Weekly Meeting, and how to find your campus meetup
    (sow.org.au/students).
  - **Partner** — ways to partner with SOW: Pray, Give and Volunteer, plus
    newsletter sign-up (sow.org.au/subscriptions) and a Donate link.
- **Weekly meeting attendance by campus** in Insights → General: average
  weekly-meeting turnout per campus (USYD, UNSW, MACQ, UTS) per staff year
  from 2025 (when attendance recording began), the current year showing its
  year-to-date average. Picking a specific staff year adds per-campus cards
  comparing that year's average against the previous staff year.

### Changed

- **Chart polish in Insights:** line graphs now use a uniform y-axis (0 to a
  rounded "nice" maximum with evenly spaced steps) instead of only labelling
  the values the lines happen to hit, and the stacked bar charts thin their
  x-axis labels to keep a run of years readable.
- **Staff tools are gated to signed-in staff.** Requests, Attendance and
  Insights tabs appear only for signed-in users with a staff profile (Admin
  remains admins/Finance-head only); visitors deep-linking into them are sent
  to the Org chart. The notifications bell is hidden for visitors.
- The signed-out person view keeps the personal "local church" field private;
  the pre-provisioned next staff year remains admin-only in the public chart.

## [1.6.14] — 2026-07-03

### Added

- **Who makes up the room: two new Insights charts.** Attendance → Insights
  now shows, for each weekly meeting (or each event, for groups without a
  weekly rhythm):
  - **Student leaders vs everyone else** — stacked per meeting, with the
    period-wide share and ratio (e.g. "40% student leaders (≈1:1.5)") in the
    card's subtitle.
  - **This campus vs visitors** — attendees whose home campus is the selected
    group vs those visiting from another campus, with the same share/ratio
    line. Only people with a known home campus are counted (org-side staff
    with no campus role are left out rather than guessed), and the chart is
    hidden on the org-wide (SOW) view where "this campus" has no meaning.
  A member's home campus and student-leader tag come from their profile when
  they're staff, or from their Campus/Role metadata otherwise. Charts appear
  after the next snapshot refresh (automatic within minutes of a roll-call
  change).

## [1.6.13] — 2026-07-03

### Fixed

- **Staff with a custom role now match the "Staff" filter.** The Members-tab
  Role filter's Staff bucket only recognised the built-in role names, but the
  role catalog is data-driven — a person whose only role this year was a
  custom one (added via Admin → Roles) matched no filter option at all and
  silently disappeared from every Role-filtered view. The Staff bucket now
  counts any non-campus role other than Member, which also corrects the
  General insights "Staff" trend that undercounted the same people.
- **A Year value that can't be resolved now counts as "Unselected".** A legacy
  or out-of-range stored Year (which already displays as blank) matched no
  Year filter option — not even "Unselected" — so those members vanished from
  every Year-filtered view.
- **Roll-call search now also matches roles and member details.** The event
  sign-in screen's search only looked at name and email, while the Members tab
  also searched the subtitle (roles, year, gender, …) — the two now match the
  same fields.
- **Audit search now matches the person acted on.** Searching the Attendance →
  Audit tab by email only matched the actor, not the subject of the action
  (e.g. who was signed in).
- **Sorting members by a select field now orders by its labels.** Sorting the
  Members tab by a select-type field (Campus, Role, custom fields) compared
  internal option ids, so the order looked arbitrary.

## [1.6.12] — 2026-07-03

### Fixed

- **Auto-approved requests now show up in your Reviewed history.** When you're
  both the requester and the approver for a step (e.g. an HOD submitting a
  request for their own department), that step auto-approves on submission.
  That auto-approval was logged under a separate audit action from a manual
  approve/decline, so the Requests → Review → Reviewed section silently
  skipped those requests even though the card correctly showed you as having
  cleared that step — they only ever appeared in the Finance-wide "All" list.
  Reviewed now includes auto-approved steps too.

## [1.6.11] — 2026-07-03

### Fixed

- **The footer button no longer shoots up when a modal's keyboard opens.** A
  pinned footer (e.g. "+ Make Request") sits on the screen *behind* a modal like
  the comments sheet. Keyboard events are app-wide, so when the modal's own text
  field opened the keyboard the occluded footer rode up with it — appearing to
  "shoot up" into view behind the dimmed backdrop. Footers now stay put whenever
  a modal is open and let the modal handle its own keyboard avoidance; they still
  follow the keyboard normally on their own screens (e.g. the event member
  search).
- **The comments sheet now hugs the keyboard instead of floating too high.** The
  sheet stays centred at rest, but once the keyboard opens it drops to sit just
  above it — a short thread no longer floats halfway up the screen with a large
  empty gap below it. This is handled independently of the footer button.
- **The comments thread stays pinned to the bottom.** The composer is now pinned
  below the scrolling thread (rather than scrolling away with it), so the text
  box stays in view no matter how long the conversation gets — even with the
  sheet at its maximum height and the keyboard up. Opening the thread, posting a
  comment, and the keyboard opening all keep the newest comment and the composer
  in view.
- **Adding an attendance member field no longer spams the audit trail.** Adding
  or deleting a field re-numbers every field's position, and the Campus/Role
  fields fold in the live universities/roles when read — both made an untouched
  field look edited or reordered, logging bogus "Updated Campus", "Updated Role"
  and "Reordered…" entries. The save now diffs against the same normalised values
  it writes and only logs a reorder when the fields' relative order actually
  changed, matching the Tags save path. (UAT report #1)
- **New Request surfaces the description error first.** With the amount left at
  its default, submitting a blank form flagged the amount error before the empty
  description — even though Description is the first field on screen. Validation
  now reports in on-screen order (Description → Amount → Department). (UAT report #2)
- **Notifications are grouped into Unread and Read sections.** The feed now shows
  "Unread" and "Read" section headers instead of one flat, inline-highlighted
  list, so what still needs attention is clear at a glance. (UAT report #3)
- **Nudge cooldown copy always shows minutes.** "You can nudge again in …" now
  reads consistently as `Xh Ym` (e.g. "24h 0m", "5h 23m") instead of dropping the
  minutes on a whole-hour boundary. (UAT report #4)

## [1.6.10] — 2026-07-03

### Changed

- **Create-event drafts reset when you switch attendance groups**, so a part-
  filled new event doesn't carry over to a different group.
- **New events default to today, 5–7pm.**
- **Tag colour selection moved into a sheet-style modal/dropdown.**
- **Disabled footer action buttons stay solid** instead of turning translucent.

## [1.6.9] — 2026-07-03

### Fixed

- **Receipt-waiting reviewed requests stay visible to the approver who cleared
  them**, instead of dropping out of the Review tab.
- **The Review tab's unread-comment badge now counts reviewed requests too.**

## [1.6.8] — 2026-07-03

### Changed

- **Improved reimbursement comment/thread deep-link reopen behaviour** and the
  sheet's keyboard/backdrop handling.
- **Attendance CSV export gained a selectable Notes column.**
- Aligned dependencies for Expo SDK 56 compatibility.

## [1.6.7] — 2026-07-02

### Fixed

- **Creating an event then cancelling froze the app.** Cancelling a part-filled
  new event popped a "Discard changes?" confirmation *inside* the create sheet —
  two stacked modals, which locks up the UI on iOS. New events no longer confirm
  on cancel: like the Make Request sheet, cancelling just closes and keeps the
  draft, so reopening resumes where you left off (the draft clears once the event
  is created). Editing an existing event still confirms before dropping unsaved
  changes, but now dismisses that dialog before the sheet so it can't lock up.

### Changed

- **Chaplaincy role labels drop the redundant department.** A chaplaincy role is
  scoped to a campus, so it now reads e.g. "Intern Chaplain → USYD" instead of
  "Intern Chaplain → Chaplaincy · USYD".
- **Admin → Users: Director at the top, no double stripe.** The Director now sits
  at the top of the list (like the Org Chart), and the redundant coloured bar
  around each group is removed — the cards inside already carry the group's
  accent stripe.

## [1.6.6] — 2026-07-02

### Added

- **Insights charts: y-axis labels, fullscreen expand, and bar tooltips.** All
  bar charts gained a left y-axis with five tick labels (max/75%/50%/25%/0), and
  x-axis year labels are shortened (e.g. `'24`) with smart label-skipping so they
  never overlap. Tap any chart card to open it fullscreen — on a portrait phone
  it rotates to landscape with taller bars; when the device is already landscape,
  or on web, it fills the screen in its natural orientation. In fullscreen, tap a
  bar for a tooltip pill showing its value(s) and year — single-value for trend
  charts, multi-value (with colour dots) for stacked leader/staff and per-campus
  charts.

### Changed

- **Campus legend labels use acronyms** (ACU, MACQ, UNSW, USYD, UTS, E2E) so they
  fit without truncation, in both the legend and the fullscreen tooltip.
- **Bar chart container height is now fixed** whether or not value labels are
  showing, so charts no longer jump as selection changes.
- **Insights defaults to the General tab** on first load.

## [1.6.5] — 2026-07-02

### Changed

- **Dropped the `attendanceMembers.staffEmail` column.** Members now link to a
  staff profile solely by `email` (the widen + `dropStaffEmail` backfill from
  1.6.3, now run everywhere). Removes the `staffEmail` field and its
  `by_staff_email` index, the migration-window dual-index fallback in
  `findMemberByEmail`, and the one-off `migrations.dropStaffEmail`. No behaviour
  change for linked people. One consequence: a pool member whose email is a SOW
  address with no staff profile for the viewed year now shows as a plain member
  in the Members list and roster, rather than being hidden — without the
  `staffEmail` flag there's nothing left to mark it as a "stale overlay" to hide.

## [1.6.4] — 2026-07-02

### Added

- **Insights → General: org-wide staff trends.** A new "General" segment (to the
  left of "Attendance") charts cross-cutting numbers, one point per staff year:
  total staff head-count, staff vs student leaders (the same split as the
  attendance member filter), and student leaders by campus. A bottom-right
  selector switches between "All years" (the trend charts) and a specific staff
  year, which shows that year's numbers as summary cards with the change vs the
  previous year.
- **SOW: average weekly attendance by campus.** When the org-wide (SOW) group is
  selected in the Attendance dashboard, a new chart shows each campus's average
  weekly-meeting turnout, drawn from each campus's own snapshot.

### Changed

- **No follow-up list on the org-wide (SOW) view.** The "Needs follow-up" list is
  a per-campus pastoral tool, so it's now hidden when SOW is selected.
- **Insights filters moved to a bottom-right selector.** The Attendance
  dashboard's time range and "Collaborative events" toggle now live in a
  bottom-right button that opens a selector sheet, rather than a top filter bar.

## [1.6.3] — 2026-07-02

### Fixed

- **Spinner date/time picker couldn't be tapped or dragged.** After 1.6.2
  switched to the `spinner` (wheel) display, the picker rendered inside its
  sheet but ignored all touches. The SwiftUI host that backs the wheel only
  sizes itself to its content vertically, so in the horizontally-centered
  container it collapsed to a 0-width frame — the wheel still *drew* (SwiftUI
  overflows its bounds) but every tap and drag landed outside the hittable
  frame. The picker now stretches to fill the sheet width, restoring
  interaction.
- **Attendance → Members over-counted and could show a person twice.** The
  Staff + Student Leader filters could total more than the staff-profile count.
  Two causes: a staff profile and its attendance-member row weren't always
  linked (the member side was normalised but the profile side wasn't), so the
  same person could appear as two rows; and the Student Leader bucket is
  deliberately dual-representable (a leader can be a staff profile OR an
  attendance-only member tagged with a campus role), which inflated the count
  when duplicates weren't collapsed. Members now link to staff profiles by a
  single canonical email (both SOW-domain spellings, case- and
  whitespace-insensitive), so a profile + member pair always counts as one.
- **Attendance export had two "Notes" columns.** The export always appends a
  reserved trailing "Notes" column for the per-sign-in note; a metadata field
  also named "Notes" produced a second, identically-named column. The builder
  now drops any metadata field whose name collides with the reserved "Notes"
  column (and the export picker no longer offers it), so the sign-in note is the
  single "Notes" column.
- **Tapping a "new comment" notification now opens the conversation.** Since
  1.6.2, comment notifications deep-linked only to the recipient's Requests tab
  (not the specific request or its thread), so following one left you hunting
  for the comment — and the focus-driven mark-read cleared the unread badge that
  would have pointed to it. Comment notifications again focus the request and
  open its comment thread (`&focus=…&thread=1`); approval/state notifications
  keep landing on the tab.
- **First Google sign-in bounced back to the login screen.** On a cold iOS
  `ASWebAuthenticationSession` the session can resolve as `dismiss`/`cancel`
  even though the OAuth redirect fired, with the OS delivering the
  `theshedmobile://…?code=` deep link a beat later. The recovery `Linking`
  listener existed but lost the race: the session's `dismiss` settled the
  redirect promise with `null` first, removing the listener before the deep
  link arrived, so the first attempt dropped the code and the user had to tap
  Sign in twice. The non-`code` session outcome now waits a short grace window
  for the deep link before giving up.

### Changed

- **Attendance members link to staff profiles by `email` only.** Groundwork for
  removing the redundant `staffEmail` column: a member is a staff overlay when
  its `email` matches a `staffProfiles.email`. New writes no longer set
  `staffEmail`, and a `migrations.dropStaffEmail` backfill moves any existing
  `staffEmail` into `email`. The column itself is retained (deprecated) this
  release and removed in a follow-up once the backfill has run.

## [1.6.2] — 2026-07-02

### Fixed

- **Export date picker overlapped other fields on native.** The iOS date picker
  used the inline calendar, whose month/year expander is a native overlay that
  spilled out of the picker sheet and over the surrounding fields. Both the date
  and time pickers now use the `spinner` (wheel) display on iOS and Android,
  which has no such overlay.

### Changed

- **Request notifications open the relevant top-bar tab directly.** Tapping a
  request notification (or its push/email link) now lands on the relevant
  Requests segment — "Mine" for the requester, "Review" for approvers/Finance —
  in general, instead of routing through a per-request focus or the legacy
  `/request/<id>` lookup screen. Opening the request still clears its
  notification (the link is now carried by `requestId` rather than the URL).

### Added

- **Stale-request reminders now appear in the in-app feed.** The daily reminder
  cron already emailed and pushed whoever a request was waiting on; those
  reminders now also create an in-app notification (with an unread bell badge),
  so they show up in the notifications feed like every other update.

## [1.6.1] — 2026-07-02

### Fixed

- **Startup crash on iOS release builds.** 1.6.0 could abort on launch
  (`SIGABRT` via `RCTFatal`) on TestFlight/App Store builds — an unhandled
  JavaScript error during startup, which Hermes turns into a hard crash in a
  release build (no red box, unlike dev). The Reanimated 4 worklets init path
  was compiling worklet source at runtime under Hermes. This adds an explicit
  `babel.config.js` (`babel-preset-expo`) so the `react-native-worklets` Babel
  plugin always runs and worklets are precompiled rather than evaluated at
  runtime — build 1.6.1 with a clean cache (`eas build --clear-cache`) so the
  transform is regenerated. The root `ErrorBoundary` is also hoisted to the
  outermost position so a render error in the gesture-handler/theme/auth
  providers shows the fallback screen instead of a blank screen or crash.
- **Blank screen when Convex config is missing.** If `EXPO_PUBLIC_CONVEX_URL`
  was unset in a build, the root layout rendered nothing — a blank screen
  indistinguishable from the startup crash above. It now shows a
  `Configuration error` diagnostic screen so a misconfigured build is obvious.

## [1.6.0] — 2026-07-01

### Added

- **Attendance → Insights: an attendance metrics dashboard for leaders.** A new
  tab (after Events) surfaces trends for the selected sub-group and time range so
  leaders can see how their events are tracking and who might need a caring
  check-in. It shows summary cards (average attendance and change vs the previous
  comparable period, events held, unique attendees, newcomers, follow-up count,
  and a weekly-meeting consistency score), lightweight native trend charts
  (attendance over time, rolling average, weekly-meeting trend, unique attendees
  by month, new vs returning, plus Campus/Role breakdowns), and a gentle "Needs
  follow-up" list with explainable, non-judgemental reasons ("Missed the last 3
  weekly meetings", "Newcomer: first attended 2 weeks ago, hasn't returned",
  "Returned after 8 weeks away"). Filters cover sub-group, trailing time range
  (1 / 2 / 4 / 8 / 12 weeks), and include/exclude collaborative events. The
  layout is responsive — a multi-column grid on a big screen, a comfortable
  single/two-column stack on mobile.
- **Auto-refreshed pre-computed insights.** Dashboard-ready snapshots are built
  per sub-group by two crons — a weekly full refresh (`attendance metrics
  recompute`, Thursdays) and a 15-minute dirty recompute (`attendance metrics
  dirty recompute`) that rebuilds only the sub-groups changed by a roll-call or
  event edit — so Insights reflects new attendance within minutes and the tab
  reads one small document instead of scanning history on the device. Each
  recompute runs as an action that pages its attendance reads in bounded chunks,
  keeping every transaction within Convex's limits even for the org-wide view.
  Snapshots refresh automatically, so the tab has no manual refresh control (a
  throttled `recomputeNow` recovery path exists server-side but isn't surfaced).
  The classification thresholds (regular / at-risk / lapsed / newcomer /
  re-engaged / declining) live in `shared/attendanceMetrics.ts` and are
  documented in `docs/attendance-metrics.md`.

## [1.5.3] — 2026-07-01

### Fixed

- **Tapping a request push notification now opens the request.** Request
  notifications deep-link to `/?tab=review&focus=<id>` (the live Requests
  screen), but the push-tap handler's allow-list still only accepted the old
  `/request/` and `/review` paths, so tapping a request push on a device routed
  nowhere (attendance pushes were unaffected). The allow-list now accepts the
  `/?tab=…&focus=…` home deep-link, and it lives in `shared/deepLinks.ts` with a
  test asserting every URL the backend emits is followable, so this can't
  silently regress again.
- **Admin → Roles no longer offers edit/delete on app-managed roles.** The
  system roles (Head of Department/Division, Director, Staff, Member) showed
  edit and trash buttons whose delete dialog claimed they could be removed; the
  backend rejected the mutation but only after a thrown `ConvexError` surfaced a
  dev-overlay. Those roles now show a lock icon instead of the buttons, and the
  shared `SYSTEM_ROLES`/`isSystemRole` helper in `shared/flow.ts` is the single
  source of truth for both the UI and the backend guards.
- **Admin → Approver Delegation removal now asks for confirmation.** Tapping the
  × removed a delegation immediately; it now shows a "Remove delegation?" confirm
  first, so an approver's stand-in can't be revoked by a stray tap.

- **Attendance → Audit no longer crashes when filtered or searched.** Applying
  an action-type/actor/event filter, or typing in the audit search, could crash
  the tab with a Convex "ran multiple paginated queries" error whenever the
  first page of rows didn't already contain enough matches. The feed now walks
  the log with convex-helpers' `paginator` (which allows the multi-page scan a
  sparse filter needs), the same approach the events list already uses.
- **Editing event tags no longer floods the audit trail.** Saving the Tags tab
  re-sends every tag, and each one was logged as an "Updated tag" regardless of
  whether it changed — so adding or editing a single tag wrote a spurious update
  row for every other tag. Tag saves now log only the tags that actually
  changed (matching how member-field saves already behave).
- **Staff no longer show a doubled role in roll-call and roster subtitles.** The
  subtitle for staff rows combined both the org-assignment role (e.g. "President")
  and the synced metadata "Role" field, producing "President · President · …".
  The metadata subtitle for staff rows now excludes the Role field, since the
  org-assignment already provides it.
- **Audit actor names now resolve correctly for legacy-domain emails.** The
  display-name lookup in the Audit feed tried only the literal email; a staff
  member who signed in with their `@sowaustralia.com` address but whose profile
  is registered under `@sow.org.au` would appear as a raw email instead of their
  name. The lookup now tries all known SOW domains before falling back to the
  directory.

## [1.5.2] — 2026-06-30

### Fixed

- **Admin → Departments no longer keeps a deleted division selected.** The
  "New department" form holds onto its chosen division across adds; if that
  division was later deleted it lingered as an invalid selection that the
  server would reject on submit. The picker now reconciles against the live
  division list (falling back to the placeholder), and "Add Department" is
  disabled until a name and a valid division are set.

## [1.5.1] — 2026-06-30

### Fixed

- **Test-environment emails now link to the test app, not production.** "Open in
  THE SHED" links in emails are now derived from each deployment's own
  `SITE_URL` (the same per-deployment web URL sign-in already uses), so emails
  from the dev/staging backend link to the dev web build instead of production.
  Previously a stale `APP_URL` override could send test emails to the live app.
- **Declining a request without a reason gives a clean prompt.** The decline
  sheet now checks for an empty reason before submitting, so you get the inline
  "Please give a reason…" message instead of also triggering a raw server-error
  notice.

## [1.5.0] — 2026-06-30

### Added

- **A "Test Environment" badge on test builds.** The staging app and dev web
  build now show a warning-coloured "Test Environment" chip in the top bar.
  Tapping it explains that this is the development environment — a separate test
  database where nothing affects the live app or real staff data.

### Changed

- **Email links from the test environment open the test app.** "Open in THE
  SHED" links in emails sent from the dev/staging backend now point at the dev
  web build (the-shed-web-dev.vercel.app) instead of production, so test
  notifications stay within the test environment.

## [1.4.0] — 2026-06-30

### Changed

- **The next staff year is admin-only on the org chart.** The org chart's year
  picker now offers the pre-provisioned next staff year only to admins (Data and
  IT / Human Resources), labelled "· Next year", so other staff don't see a
  half-built future chart. Everyone keeps the current and past years.

## [1.3.0] — 2026-06-30

### Added

- **Staff faces show on the org chart before they sign in.** The weekly Google
  Workspace sync now also caches each staff member's Google profile photo, so
  the org chart and profile pages show their picture even if they've never
  opened the app. A person's own uploaded photo still takes precedence.

### Changed

- **Directory sync now runs once a week instead of daily.** The automatic
  Google Workspace sync (people picker + profile photos) moved to a weekly
  schedule; admins can still sync on demand from the admin screen.

## [1.2.2] — 2026-06-29

### Fixed

- **You now get told when a member's details can't be opened.** On an event's
  roll-call, if opening someone's edit sheet failed (e.g. a dropped connection),
  nothing happened and no message appeared. It now shows an error toast instead
  of silently doing nothing.
- **Notification links only go to real screens.** Tapping a push notification
  now follows its link only when it points to a known in-app screen, ignoring
  anything unexpected or malformed.

### Changed

- **Roll-call rosters open a little faster.** An event's roster now loads its
  attendance history in parallel rather than one past event at a time, so the
  list appears sooner on events with a long history.
- **Internal maintainability cleanup.** Split the large shared UI component file
  into a `components/ui/` directory, extracted admin-screen hooks, unified the
  roll-call identity key into one shared case-insensitive helper, and added
  `@convex`/`@shared` import aliases. No change to behaviour.

## [1.2.1] — 2026-06-29

### Fixed

- **Tap to sign someone in or out.** On the roll-call roster, tapping a person's
  card to reveal the sign-in/out arrow and then tapping that arrow now signs them
  in or out — previously only a swipe committed the action and tapping the arrow
  did nothing.

### Changed

- **CSV "Year" is the year during the event.** The attendance CSV export's
  **Year** column now shows each person's year level *at the time of the event*
  (e.g. "3"), matching the member card and Edit Member sheet, instead of the
  staff year they commenced. Sixth-year-and-beyond is no longer capped at "6+" —
  it shows the actual number (6, 7, 8, …) of years since they started.
- **Year picker goes up to 15.** The member **Year** dropdown now offers years 1
  through 15 (was 1–5 and "6+"). Members past year 15 still display their real
  year everywhere; they just can't be re-picked from the dropdown.
- **Search bars stay put while you scroll.** On the Members tab, the Audit tab,
  and an event's attendance roster, the member/activity search bar now pins to
  the top as the list scrolls under it, so it's always reachable. On the Members
  and Audit tabs the filter controls pin alongside the search bar.
- **Top chrome gets out of the way while scrolling.** The home/profile top bar
  (and, on the attendance tabs, the logo/profile row above the tab bar) floats
  above the page and hides as you scroll down, reappearing as you scroll back
  toward the top, so the content beneath fills the freed space instead of
  leaving an empty strip. It now collapses in step with the scroll position, so
  its edge stays flush with the pinned search bar below it rather than sliding
  over it when you scroll back up mid-list. Switching attendance tabs keeps the
  bar's state — it reflects the tab you land on (collapsed if that tab is
  scrolled, shown if it's at the top) instead of popping back open every time.
- **Consistent footer height across the attendance tabs.** The Tags ("Save
  tags") and Metadata ("Save metadata") footers now sit at the same distance
  from the bottom as the "+ Make Request" button, matching the Events and
  Members footers.

## [1.2.0] — 2026-06-29

Attendance footer polish, plus a fix for the events list server error on
quieter groups.

### Changed

- **Staff show as staff in attendance chips.** Attendance group chips now label
  people with non-campus staff-profile roles as **STAFF** instead of falling back
  to **OTHER** when they do not have a campus, while campus leaders still show
  their campus chip.
- **Reversed sign-ins stay where they land.** Signing out (reversing) a roll-call
  attendee now pins them to the top of the "Not signed in" list and keeps them
  there after the change saves, instead of letting the row jump back down into
  its ranked position a moment later. (#141)
- **No grey flash on roll-call cards.** A member card is no longer greyed out
  while its sign-in/out is still saving — it stays full-strength but can't be
  swiped again until the change settles. (#141)
- **Event attendance footer rises with the keyboard.** On the event attendance
  page the action button now lifts at the same speed as the keyboard instead of
  trailing behind it, and sits a little higher so it clears the bottom edge on a
  screen with no tab bar. (#142)
- **Smoother footer on fast tab swipes.** Swiping quickly between the attendance
  tabs no longer leaves the footer button frozen mid-way and then snapping into
  place — it now slides with the page the whole way, including the release
  glide. (#143)
- **Steadier group picker.** Selecting a group under Events no longer nudges the
  logos — the selection ring is always reserved and just colours in. In dark
  mode the SOW ring now shows in its cream logo colour instead of an invisible
  black. (#146)
- **Reversed members are immediately actionable.** After signing a roll-call
  attendee back out, their card (pinned to the top of the not-signed-in list) can
  now be acted on right away, instead of staying locked until another sign-in
  refreshed the roster. The card also no longer replays a reappear animation once
  the change finishes saving — it settles in place. (#144)
- **Steadier attendance layout.** The not-signed-in list keeps its three-card
  height even when no one is signed in yet, the Members tab uses the same spacing
  between cards as the roll-call lists, and the footer action buttons sit a little
  higher off the bottom. (#145)
- **Only the active tab's footer follows the keyboard.** On the Attendance
  screen, just the action button for the tab you're on (e.g. "+ Create member"
  on Members) now lifts above the software keyboard; the other tabs' hidden
  footers stay put instead of riding up into view. The lift also keeps a
  consistent gap above the keyboard regardless of how high the footer normally
  rests, so every footer lines up at the same height once the keyboard is open —
  including the event roster's "Create …" button, which otherwise keeps its
  higher resting position. The footer also snaps between its keyboard-up and
  keyboard-down positions faster than the keyboard's own animation.
- **Consistent footer height for the create buttons.** The "+ Create event"
  (Events tab) and "+ Create member" (Members tab) footers now sit at the same
  distance from the bottom as the "+ Make Request" button, instead of resting a
  little higher.

### Fixed

- **Events list no longer errors for quieter groups.** Opening the Events tab for
  a group with no recent events (e.g. a campus whose latest events are far down
  the list) no longer triggers a `events:listBySubgroup` server error. The scan
  now pages through the events table via `convex-helpers`' `paginator`, which —
  unlike the built-in `.paginate()` — can be called more than once per query, so
  sparse groups are found without crashing.

## [1.1.1] — 2026-06-28

A wave of attendance/roll-call polish, request reminders, and sign-in and
date-picker fixes on top of the 1.1.0 attendance release.

### Added

- **Attendance audit trail.** Every attendance-area change is now recorded with
  who did it and when — events created/updated/deleted, members
  created/updated/deleted, tags and member fields changed, and every roll-call
  sign-in, record edit and sign-out. A new **Audit** tab in the Attendance area
  shows the activity newest-first, searchable and filterable by action type, the
  person who performed it, and the event it relates to. Log entries are immutable
  and snapshot names so they stay readable after the subject is deleted. (#117)
- **Reviewed history for approvers.** A new **Reviewed** section on the Review tab
  lists the requests you have already approved or declined, newest-first, and
  approving now asks you to confirm first. The "To Review" tab is now just
  "Review". (#136)
- **Request reminders & manual nudge.** Pending approvals now send tiered
  reminders that escalate over time, with a manual **nudge** (and a cooldown) to
  ping the current approver, plus notifications when an attendance event is
  created. (#119, #122)
- **Create a member straight from roll-call.** Searching roll-call for someone who
  isn't a member yet lets you create them and sign them in in one step. (#130)
- **Native date/time pickers.** Date and time selection on device now opens the
  native picker in its own sheet with a Done button, used by event create/edit and
  CSV export. (#137)
- **Weekly Meeting schedule pre-fill.** Creating a Weekly Meeting event now
  pre-fills its schedule. (#120)

### Changed

- **Staff-year rollover moved to October 1** (from September 1), to match SOW's
  calendar. (#108)
- **Make Request keeps your draft.** Closing the Make Request sheet no longer asks
  to discard — your in-progress request is preserved and only cleared after a
  successful submit. Type-to-confirm delete prompts now **bold** the exact text
  you need to type. (#139, #121)
- **Attendance roll-call interactions.** Row swipes are edge-anchored and work from
  anywhere on a card while vertical scrolling passes through; past-event sign-in is
  gated behind an explicit edit, sign-out is protected on past events, and locked
  attendees are greyed out. (#124, #125, #126, #127, #128, #129)
- **Attendance layout & motion.** Actions moved into the header row with a 3-card
  list and section count chips, tidier header meta, and a Reanimated SowSpinner
  with staggered group-picker animations. (#131, #133, #135)
- **Attendance metadata is global.** Member metadata and tag scopes now apply
  across staff years rather than per-year, with tag scope defaulting to all
  groups. (#111, #114, #115, #116)

### Fixed

- **iOS first sign-in.** Fixed a fresh-install case where the first Google sign-in
  could drop the OAuth redirect and leave you signed out until a second
  attempt. (#138)
- **Reminder schedule resets** when a request advances to the next step, so the
  next approver starts on a fresh schedule. (#123)
- **Web date/time pickers** no longer overflow on narrow screens. (#134)
- **Web vertical scroll** no longer gets stuck when it starts on a member
  card. (#132)
- **Sydney calendar year** correctness and hardened staff-profile provisioning for
  attendance. (#107, #112)

## [1.1.0] — 2026-06-25

Attendance (roll-call) arrives — a full attendance tab ported from
time-to-rollcall for tracking who turns up to events, per campus and staff year.

### Added

- **Attendance tab.** Run events under one or more sub-groups (each campus, plus
  org-wide "SOW"), sign people in from a live roster, and manage a shared member
  pool. Collaborative events span several campuses and appear under each; events
  load 20 at a time with a "Load more" button. (#103)
- **Member metadata & tags.** Per-staff-year fields (Year, Gender, Campus, Role)
  describe each member, with an admin editor; Year is captured as the university
  level. Events can be labelled with colour-coded category tags. (#103)
- **CSV export.** Export roll-call attendance for a date range to CSV, using
  native date pickers on device and a web date picker in the browser. (#105)
- **Duplicate-name guard.** Creating a member whose name already exists now shows
  an inline warning and a confirmation step that lists the existing member(s) and
  their metadata, so you can be sure before adding another person with that name.
  (#105)

### Changed

- **Members are one consolidated, year-less list.** A person is a single member
  reused across every staff year (same id), instead of a separate row per year.
  Staff members map to their staff profile for the event's year. (#103)
- **Role/Campus locked values stay synced.** The non-removable options for the
  Role and Campus fields are read live from that staff year's roles/universities
  tables, so removing one there unlocks it here instead of sticking around. (#106)

### Removed

- **Unused template assets.** Dropped Expo starter art and other unreferenced
  images to slim the bundle. (#104)

## [1.0.4] — 2026-06-22

Approvals flexibility (configurable Director cutoff, delegation), an in-app
notification center, admin "Not serving" management, and swipe/receipt fixes.

### Added

- **Configurable Director-approval threshold.** The amount at or above which a
  request also needs the Director's approval is now a per-year Finance setting,
  editable from Admin → Other, instead of a hardcoded $5,000. Only new requests
  are affected; existing requests keep the steps they were created with. (#92)
- **Approver delegation (out-of-office cover).** An admin can delegate one
  person's approver authority to a stand-in for a staff year — the delegate can
  approve, decline and pay everything the approver could. Self-review stays
  blocked. Managed from Admin → Other. (#93)
- **In-app notification center.** A bell in the top bar (with an unread badge)
  opens a Notifications feed of every flow event that pinged you — newest first;
  tap one to mark it read and jump to its target, or "Mark all read". (#94)
- **Admin "Not serving" list.** Admins can park people who are no longer assigned
  for a staff year in a "Not serving" pool in Admin → Users — deleting a profile
  moves them there automatically, and (re)assigning clears the mark. (#96)
- **Receipt scanning (OCR).** Attaching a receipt reads the amount, vendor and
  date off the image and pre-fills the recipient's amount when it's blank — you
  always review before submitting. A hint shows what was read and flags when it's
  over the approved amount. Off until a Gemini key is configured. (#99)

### Changed

- **Make Request button slides with the swipe.** The `+ Make Request` footer now
  slides down off-screen as the swipe leaves the "Mine" tab and back up on return,
  tracking the pager, instead of hard mounting/unmounting. (#89)
- **Notifications auto-mark read.** Opening a request (or its comment thread) now
  clears that request's notifications — you no longer have to tap them in the feed.
  Read notifications stay in the feed as history. (#95)

### Fixed

- **Sub tab bar:** the selected-tab underline no longer flickers to its end-state
  mid-swipe — it stays glued to the finger throughout the drag. (#89)
- **Bottom tab bar:** icons now sit centered on devices with a home indicator,
  instead of low with a gap above them. (#89)
- **Receipt form:** entering recipient/amount/file for one request, cancelling, and
  opening another request's receipt form no longer carries the first request's draft
  over. (#91)

## [1.0.3] — 2026-06-20

UI polish for request cards and the tab bars, plus web fixes. (#87)

### Added

- **Animated request cards.** Completed/finance cards now expand and collapse with
  a smooth height animation; tapping the card header (or the centered chevron)
  toggles it. (#87)
- **Loading placeholders.** While an expanded card loads approver names/times and
  receipt files, soft blurred placeholders show in their place instead of a gap. (#87)

### Changed

- **Bottom tab bar:** icons now give the same press feedback as the rest of the app,
  the bar is slimmer, and the admin (cog) tab matches the other tabs. (#87)
- **Sub tab bar (Mine / To Review):** the selected-tab underline slides — tracking the
  swipe on device, animating on tab change on web. (#87)
- **Full-width chrome:** the top bar and sub tab bar span the full screen width like the
  bottom bar. (#87)
- **Consistent control heights:** the bottom tab bar and the footer buttons (Make Request,
  info) now share a single 50px height, and the tab icons sit centered without a padding
  offset. (#90)

### Fixed

- Switching bottom tabs on the web app no longer triggers a full-page reload. (#87)
- Cancelling the "open in app" prompt on mobile web no longer leaves a blank,
  non-interactive screen. (#87)

## [1.0.2] — 2026-06-19

User-facing features and polish on top of the 1.0.1 release tooling.

### Added

- **Comments notify previous approvers.** A new comment now also pushes everyone
  who has already approved the request, not just whoever it currently waits on. (#83)
- **Unread badge on the "All" tab.** Finance sees a count of unread comments across
  the year's requests, and requests with unread discussion float to the top of the list. (#83)
- **Profile back button** in the top-left, plus a native interactive **swipe-back**
  gesture that reveals the previous screen as you drag. (#83, #84)
- **Tap-to-expand request cards.** Completed/finance cards expand when tapped anywhere,
  with a centered down-arrow hint, instead of a separate "View More" link. (#80)
- **Close (X) button** on list/option dialogs. (#83)
- **Open-in-app redirect:** visiting the web build on a phone bounces into the native
  app (path-preserving), falling back to the App Store / Play Store. (#79)

### Changed

- **Push notifications**
  - You no longer get a push for your own action (e.g. submitting your own request);
    the confirmation email is your acknowledgement. (#80)
  - Concise push titles (e.g. "Approval needed", "Request approved", "New comment");
    the full detail stays in the email. (#80)
  - People are referred to by **name** instead of raw email throughout notifications. (#80)
- **Consistent press feedback:** buttons (including all icon buttons and the top-bar
  home/profile buttons) shrink slightly while pressed and held. (#81)
- **Haptics** are now reserved for the bottom navigation bar only. (#81)
- **Detail screens** (profile, a person, a request) push as cards over the tabs via a
  native stack, giving them the swipe-back gesture. (#84)
- Tighter bottom tab-bar padding, and shorter list/option dialogs so there's always a
  clear area to tap out. (#81, #83)

### Fixed

- Sign-in (Google OAuth): the button stays in its loading state through the whole flow,
  and the redirect allowlist was corrected for the renamed web project. (#77, #78)

## [1.0.1] — 2026-06-19

Release & build tooling — the milestone that makes store submission repeatable.

### Added

- **EAS build + submit workflows** triggered from the Actions tab, with an
  **iOS / Android / both** platform choice on manual dispatch. (#75)
- Separate **manual staging and production** build → submit workflows. (#76)
- `autoIncrement` build numbers so each EAS build gets a fresh build number. (#75)

## [1.0.0] — 2026-06-11

Initial release of **The SHED** — a staff reimbursement app for SOW.

### Added

- Submit reimbursement requests and track them to completion.
- Multi-step approval chain: HOD → Budget Manager → Director → Finance Head, with
  steps auto-approved where the approver is the submitter.
- Receipt / invoice submission and Finance Head payment, including saved bank accounts.
- Per-staff-year **org chart and directory**, with admin management of departments,
  divisions, roles and the Budget Manager.
- **Clarification comment threads** on requests, with emoji reactions and unread tracking.
- **Push and email notifications** across the request lifecycle.
- Profiles with multi-year service history; CSV export of requests for Finance.
- Google sign-in, with light and dark themes.
