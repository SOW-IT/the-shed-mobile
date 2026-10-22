# Check-in links open the app

2.9.19 kept `/checkin/<token>` on the web for every iPhone: the association
files excluded it, and `NEWER_PAGES` stopped the web handing it over. Leaders
scanning the code with the app installed still got the browser form, so they
had to wait for another leader to confirm them like a newcomer.

From 2.9.25:

- **Both association files hand `/checkin/*` to the app** like every other
  path. Only a link ending in `#noapp` stays in the browser (an AASA
  `components` entry that excludes that fragment).
- **In the app, a signed-in leader is signed in as soon as the page opens**
  (`checkIn.signInLeader`), with an Undo. Anyone else gets the form.
- **The web still never bounces `/checkin` to the app** (since 2.10.0 a fixed
  `/checkin` check in `src/app/+html.tsx`, as `NEWER_PAGES` is gone):
  a phone with the app installed is sent there by the camera or the tapped
  link, not by the page.

## Considered options

**Keep the page on the web.** What 2.9.19 did. Leaders are never recognised,
and nothing changes once everyone updates unless someone remembers to undo it.

**A scanner inside the app.** Recognises leaders without touching links, but
needs a camera module and a store build, and people open QR codes with the
phone camera anyway.

**Wait until most phones update.** On 2026-10-21 only 2 of the 56 phones seen
in the last 30 days ran 2.9.19 or later.

## Consequences

- A phone on 2.9.0 to 2.9.18 opens a check-in link in the app and gets the
  not-found screen ("This page may need a newer THE SHED"), whose "Open on the
  web" adds `#noapp` and so reaches Safari. That is one extra tap until they
  update; raising `appUpdatePolicy.recommended` after the store build nudges
  them.
- Android's intent filter covers the whole host, but production never served
  `assetlinks.json` either (see below), and until 2.9.26 the file named a
  keystore no build was signed with, so Android never verified the links.
  Play installs also need Play's app-signing key in the file. From Android 15
  `assetlinks.json` can skip `#noapp` links; on older Android an old app's
  "Open on the web" can land back in the app.
- Claiming every path also claims the address Google returns to after a web
  sign-in. From 2.9.26 the web sign-in returns with `#noapp`, and both files
  skip links carrying a sign-in `code`, so it finishes in the browser.
- iOS caches association files through Apple's CDN, so a change reaches
  phones within about a day of the web deploy, not straight away.
- Until 2.9.25 the production web never served the files at all: Vercel's
  git build ran only `expo export`, so `/.well-known/apple-app-site-association`
  returned the app's HTML and Apple's CDN had "Not Found" (checked
  2026-10-21). Production phones opened every link in the browser and leaned
  on the `+html.tsx` scheme bounce; only staging had universal links. The
  root `vercel.json` now copies both files into the build, so from this
  release every `theshed.sow.org.au` link opens the installed app, not just
  check-in.
