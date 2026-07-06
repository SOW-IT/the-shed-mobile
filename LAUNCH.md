# LAUNCH.md — everything left to configure

Step-by-step, in dependency order. Code-side work is done; every item here
needs an account, a credential, or a dashboard only you can access.
Deployment names used below: Convex dev `industrious-robin-425`, Convex prod
`outgoing-stoat-395`, web app `https://theshed.sow.org.au` (Vercel project
`the-shed-web`, custom domain on the `sow.org.au` zone).

---

## 0. Accounts (start these first — longest lead times)

- [ ] **Apple Developer Program** — enroll as an *organisation* (needs SOW's
      D-U-N-S number; US$99/yr; verification can take 1–2 weeks):
      <https://developer.apple.com/programs/enroll/>
- [ ] **Google Play Console** — register an *organisation* account (US$25
      one-off; org accounts skip the 12-tester/14-day closed-testing rule):
      <https://play.google.com/console/signup>
- [ ] **Expo account** (free): <https://expo.dev/signup>

---

## 1. Google OAuth (sign-in) — do this first, everything is dark without it

1. Open the [Google Cloud console](https://console.cloud.google.com/) with a
   sow.org.au admin account. Reuse the existing SOW project
   (`sowwebsite-50dec`) or create one.
2. **APIs & Services → OAuth consent screen**: set **Audience: Internal**
   (sow.org.au users only — this also skips Google's app verification).
   App name "THE SHED", your support email.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application** (yes, also for the mobile apps —
     Convex Auth handles the OAuth exchange server-side).
   - Authorized redirect URIs — one per provider **per deployment** (the
     `googlePersonal` provider added in 1.7.4 has its own callback path, so all
     four are required):
     - `https://outgoing-stoat-395.convex.site/api/auth/callback/google`
     - `https://outgoing-stoat-395.convex.site/api/auth/callback/googlePersonal`
     - `https://industrious-robin-425.convex.site/api/auth/callback/google`
     - `https://industrious-robin-425.convex.site/api/auth/callback/googlePersonal`
   - Because non-staff Google accounts can now sign in (1.7.4), the consent
     screen **Audience must be External** (Internal blocks non-org accounts).
     Add `sow.org.au` under **Authorized domains** and set the **App name** to
     "The SHED" so the consent screen reads "Sign in to The SHED".
4. Set the client id/secret on both Convex deployments:
   ```bash
   npx convex env set AUTH_GOOGLE_ID <client-id>
   npx convex env set AUTH_GOOGLE_SECRET <client-secret>
   npx convex env set --prod AUTH_GOOGLE_ID <client-id>
   npx convex env set --prod AUTH_GOOGLE_SECRET <client-secret>
   ```
5. **Test**: open <https://theshed.sow.org.au> → Sign in with Google
   with a sow.org.au account.
6. Make yourself the real admin (replaces the placeholder):
   ```bash
   npx convex run --prod admin:seed '{"adminEmail":"you@sow.org.au"}'
   npx convex run admin:seed '{"adminEmail":"you@sow.org.au"}'   # dev too
   ```
7. In the app's **Admin tab**: set department heads, the Budget Manager, the
   Director, and assign staff. (The flow rejects submissions until a Budget
   Manager and relevant heads exist — by design.)

---

## 2. GitHub repo secrets (unlock the automation that's already wired)

Repo → Settings → Secrets and variables → Actions:

- [ ] `EXPO_TOKEN` — <https://expo.dev/settings/access-tokens> → enables the
      EAS Build workflow (iOS+Android builds on every merge).
- [ ] `CONVEX_DEPLOY_KEY` — [Convex dashboard](https://dashboard.convex.dev/t/kimchankwon/the-shed-mobile)
      → **production** deployment → Settings → Generate deploy key → enables
      auto-deploy of the prod **backend** on every merge (`convex-deploy.yml`).
- [ ] `VERCEL_TOKEN` + `VERCEL_PROJECT_ID_DEV` — <https://vercel.com/account/tokens>
      → power the **dev** web auto-deploy on every merge (`deploy-web-dev.yml`,
      publishing to `the-shed-web-dev`). The **prod** web is published by
      Vercel's own git integration on merges to `main`, so it needs no workflow.

Until set, those workflows pass with a warning and skip.

---

## 3. EAS project + signing (after the Expo + Apple accounts exist)

```bash
npx eas init          # links the repo to your Expo account (commit the change)
npx eas credentials   # iOS: distribution cert + provisioning profile + APNs
                      #      push key (let EAS create & manage all of them)
                      # Android: generate the keystore (EAS-managed)
```

---

## 4. iOS — TestFlight first, store later

1. Accept the agreements in [App Store Connect](https://appstoreconnect.apple.com)
   (Business → Agreements) once enrollment clears.
2. Build: `npx eas build --platform ios --profile production`
   (or merge to main once `EXPO_TOKEN` is set — the workflow queues it).
3. Create an **App Store Connect API key** (Users and Access → Integrations →
   API keys, role *App Manager*) — `eas submit` asks for it once and stores it.
4. Submit: `npx eas submit --platform ios --latest` — creates the app record
   (bundle id `au.org.sow.theshed`) and uploads to **TestFlight**.
   (The encryption-compliance question is pre-answered in app.json.)
5. App Store Connect → TestFlight → **Internal Testing**: add testers (up to
   100 by Apple ID email, instant, no review). Testers install the TestFlight
   app and accept the invite. Builds expire after 90 days — fine, you'll ship
   newer ones.
6. **Going beyond TestFlight** — pick one:
   - **Unlisted App Distribution** (recommended for an internal staff app):
     apply once at <https://developer.apple.com/contact/request/unlisted-app/>;
     the app gets a private App Store link, no public listing.
   - Public App Store listing: needs screenshots, description, a **privacy
     policy URL**, App Privacy labels (collects: name, email, photos, bank
     details), and a sow.org.au demo account in the review notes.

---

## 5. Android — internal testing track

1. Push notifications first (one-time): in the [Firebase console](https://console.firebase.google.com)
   open the existing `sowwebsite-50dec` project → Add app → **Android**,
   package `au.org.sow.theshed` → download `google-services.json` into the
   repo root, then add to app.json: `"android": { "googleServicesFile": "./google-services.json", ... }`.
   Then Firebase → Project settings → Service accounts → generate a key, and
   upload it via `eas credentials` → Android → *Google Service Account Key
   for FCM V1*.
2. Build: `npx eas build --platform android --profile production` (produces
   an `.aab`).
3. [Play Console](https://play.google.com/console) → **Create app** ("THE
   SHED", App, Free).
4. **First upload is manual** (Google requires it): Testing → Internal
   testing → Create release → upload the `.aab` (download from the EAS
   dashboard) → roll out. Add a tester email list and share the opt-in link.
5. Automate later submissions: Play Console → Setup → API access → create a
   service account with *Release manager* permission → JSON key →
   `npx eas submit --platform android --latest`.
6. Production later: Store listing, content rating questionnaire, **Data
   safety form** (same data categories as iOS), then promote the internal
   release. For staff-only distribution, just keep using the internal track
   (100 testers) or a closed track with a Google Group.

---

## 6. After credentials exist — small finishers

- [ ] **Universal links**: fill `web/.well-known/apple-app-site-association.example`
      (Apple **Team ID**) and `assetlinks.json.example` (Android signing
      **SHA-256** from `eas credentials`), drop the `.example` suffixes, run
      `npm run deploy:web`. Email links then open the native app.
- [ ] **Workspace directory sync**: service account + domain-wide delegation
      (exact steps in README → "Workspace directory sync"); set the three
      `GOOGLE_SA_*` env vars with `--prod` (and on dev if wanted).
- [ ] **Privacy policy URL** — required by both stores; adapt SOW's existing
      policy to mention: Google sign-in (name/email), profile photos, receipt
      files incl. bank account details, push tokens.
- [ ] **Original logo vector** — current store icon is upscaled from a 512px
      PNG; a vector/1024px source would sharpen it (regeneration is scripted).
- [ ] **Custom domain `theshed.sow.org.au`** (migrating off `the-shed-web.vercel.app`
      in 1.7.4). The code side is done (canonical URL, `app.json` deep-link
      hosts, docs); the remaining steps are infra:
      1. **Vercel**: `the-shed-web` project → Settings → Domains → add
         `theshed.sow.org.au`. Vercel shows the DNS target + provisions SSL.
      2. **DNS** (`sow.org.au` zone): add the record Vercel asks for — a
         `CNAME theshed → cname.vercel-dns.com` (or the `A`/`ALIAS` it lists).
      3. **Convex prod env**: `npx convex env set --prod SITE_URL https://theshed.sow.org.au`
         (and `APP_URL` if it's set). Web OAuth redirects and email links then
         use the new host. The old `.vercel.app` URL keeps working, so this is
         non-breaking.
      4. **`.well-known` files** are served by the web app, so they cover the
         new domain automatically once DNS resolves — no change needed.
      5. **Native deep links**: the new host is already in `app.json`
         (`associatedDomains`/`intentFilters`, alongside the old one for links
         already shared); universal links on it take effect in the next native
         build. The Google OAuth **redirect URIs live on `*.convex.site`, not
         the web domain**, so they do NOT change — but add `sow.org.au` to the
         consent screen's Authorized domains (§1).

---

## Suggested order of attack

1. Today: **Apple enrollment** (slowest) + Play Console + Expo account.
2. Same sitting: **Google OAuth** (§1) → sign in on the web app → seed your
   admin → set up the org in the Admin tab. The app is now genuinely usable
   on the web while the stores grind.
3. Add the **three GitHub secrets** (§2) → CI/CD is fully live.
4. When Apple clears: §3 → §4 (TestFlight same day).
5. §5 Android in parallel, §6 finishers as credentials appear.
