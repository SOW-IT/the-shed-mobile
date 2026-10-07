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
