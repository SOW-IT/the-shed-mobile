# Links to pages older apps don't have

On a phone, the web hands every page to the installed app (`src/app/+html.tsx`
bounces to `theshedmobile://<path>`). When a release adds a page, people who
haven't updated get "Unmatched Route": 2.3.0's Event Requests did this to
everyone whose store app was still 2.2.0.

From 2.3.1:

- **Pages newer than some apps are listed** with the first version that has
  them (`NEWER_PAGES` in `shared/appLinks.ts`).
- **On a phone, the web keeps those pages** unless the link ends in `#app`.
- **Apps report their version** on launch, per platform (`appInstalls`).
  Emailed links get `#app` only when every phone the recipient has reported is
  new enough (`emailLinkFor`); otherwise the page opens on the web, which
  always has it.
- **The bell feed sends no link** for a page the asking app can't open. Older
  apps don't send a version, so they count as too old.
- **Apps have a not-found screen** (`src/app/+not-found.tsx`) offering "Open
  on the Web" (with `#noapp`) and the store, for whatever a later release adds.

## Considered options

**Keep the page on the web for everyone until most people update.** Simple,
but it keeps updated apps out of the new page, and needs remembering to undo.

**A new URL scheme that only updated apps register.** The web can't tell
whether a scheme exists without trying it, and iOS shows "address is invalid"
when it doesn't.

**Universal links.** The association files aren't served by the web deploy,
and they can't say which app version handles which path anyway.

## Consequences

- An app older than 2.3.1 never reports, so its owner's emailed links to newer
  pages always open on the web. That's slower, but it always works.
- Someone with two phones on different versions gets the web until both
  update.
- Add a page to `NEWER_PAGES` whenever a release adds one that emails or
  notifications link to. Entries can stay; they cost nothing once everyone's
  updated.
- 2.9.1 emptied the list: every entry (design requests 2.2.0 to churches
  2.5.5) was older than 2.9.0, the oldest supported app. The mechanism stays
  for the next new page.

## Superseded in 2.10.0

2.10.0 makes 2.9.25 the minimum app version, and every page exists in every
app from 2.9.25, so the list was down to `/checkin` alone. `NEWER_PAGES`,
`versionNeededFor`, `appCanOpen`, the `#app` marker, `emailLinkFor` and the
bell's link filter are gone: emails and the bell link straight to the page.
Apps still report their version (`appInstalls`), which is how we see who
needs to update.

When a release adds a page that emails or notifications link to, raise the
update policy's `minimum` to that release once it is in both stores. Until
then an older app shows its not-found screen, with "Open on the web" and the
store, which is the fallback this record described.
