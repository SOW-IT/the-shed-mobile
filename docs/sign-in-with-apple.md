# Sign in with Apple — implementation plan

**Status: planned — not yet implemented.**

## Why

App Review rejected the app under **Guideline 4.8 (Design — Login Services)**:
the app offers third-party login (Google) but no equivalent option that

- limits data collection to the user's name and email address,
- lets users keep their email address private from all parties, and
- does not collect app interactions for advertising without consent.

Sign in with Apple satisfies all three by Apple's own statement, so we add it
as a third option in the signed-out dropdown, directly under
"Sign in with Google". This unblocks iOS releases; nothing about the existing
Google flows changes.

## Where the app is today

| Piece | Location | Relevance |
| --- | --- | --- |
| Auth backend | `convex/auth.ts` (Convex Auth `@convex-dev/auth` + `@auth/core`) | Two Google OAuth providers: `google` (staff, org-domain-restricted) and `googlePersonal` (any Google account → visitor). Plus a `ConvexCredentials` E2E provider (`E2eLogin`) that is the template for a token-based provider. |
| Sign-in UI | `src/components/ui/screen.tsx` (`TopBar` signed-out dropdown) | Two rows: "Sign in with your SOW account", "Sign in with Google". A comment already notes Apple sign-in is planned. |
| Sign-in hook | `src/hooks/useGoogleSignIn.ts` | Drives the browser OAuth dance; exposes `SignInOutcome` (`signed-in` / `cancelled` / `rejected` / `error`) which the Apple hook will reuse. |
| Profile linking | `convex/userLink.ts` (`linkUserProfiles`, called from `afterUserCreatedOrUpdated`) | Binds staff profiles by email on every sign-in. Runs unchanged for Apple users; a relay/personal email simply matches no staff profile → visitor, which is the intended role. |
| Native project | CNG — `ios/` is gitignored | All native config goes through `app.json` config plugins + EAS; no Xcode project edits are committed. |
| App identities | `au.org.sow.theshed` (prod), `au.org.sow.theshed.staging` (staging, via `app.config.js`) | Both bundle ids need the Sign In with Apple capability and both must be accepted as token audiences. |

## Approach: native Apple sheet + server-side identity-token verification

Two viable designs:

1. **Native flow (chosen).** `expo-apple-authentication` presents the system
   `ASAuthorizationController` sheet, returns a signed **identity token**
   (JWT), and a new `ConvexCredentials` provider on the Convex side verifies
   that token against Apple's public keys and creates/retrieves the account —
   exactly the shape of the existing `E2eLogin` provider, with cryptographic
   verification in place of the shared secret.
2. **Web OAuth flow (rejected).** Register `@auth/core`'s `Apple` provider and
   reuse the browser redirect dance from `useGoogleSignIn`. Rejected because:
   App Review expects the native sheet on iOS (it is also simply better UX —
   Face ID, one tap, no browser); the web flow needs a Services ID plus a
   client-secret JWT that must be re-minted at most every 6 months (an
   operational treadmill); and Apple's redirect uses `form_post`, which the
   expo-auth-session redirect capture in `useGoogleSignIn` is not built for.
   If the web app (`theshed.sow.org.au`) ever needs Apple sign-in, this
   becomes a follow-up with its own Services ID — nothing in this plan
   precludes it.

The native flow needs **no browser, no redirect URI, and no entry in the
`redirect` callback allowlist** in `convex/auth.ts` — the token is handed to
us in-process and we pass it straight to `signIn("apple", …)`.

## 1. Apple Developer / App Store Connect prerequisites

Blocking prerequisite: access to the SOW Apple Developer account (the
`screen.tsx` comment notes credentials were pending).

1. Developer portal → Identifiers: enable the **Sign In with Apple**
   capability on both App IDs, `au.org.sow.theshed` and
   `au.org.sow.theshed.staging` (EAS can also sync this automatically when it
   regenerates provisioning profiles after the entitlement is added — verify
   on the first build rather than assuming).
2. No Services ID and **no Apple key (.p8) is required** for the native
   sign-in flow itself. A key becomes necessary only for the follow-ups in
   §8 (web flow, or the token-revocation call Apple requires when an account
   is deleted in-app).
3. App Store Connect: after the fix ships, reply to the 4.8 rejection
   identifying Sign in with Apple as the added service (§7).

## 2. Client — native module and config

- `npx expo install expo-apple-authentication expo-crypto`
  (`expo-crypto` supplies the random nonce + SHA-256; both are config-plugin
  friendly and in the SDK 56 line).
- `app.json`:
  - add `"expo-apple-authentication"` to `plugins`;
  - add `"usesAppleSignIn": true` under `expo.ios` (adds the
    `com.apple.developer.applesignin` entitlement at prebuild).
- No `app.config.js` change: the staging variant spreads `config.ios`, so it
  inherits `usesAppleSignIn` automatically.
- **A new dev-client / EAS build is required** — this adds a native module, so
  the current dev client (which only reloads JS from Metro) cannot exercise
  it. Bump the `development`, `staging`, and `production` profiles' builds.

## 3. Client — `useAppleSignIn` hook

New file `src/hooks/useAppleSignIn.ts`, mirroring the shape of
`useGoogleSignIn` (`{ signInWithApple, busy, error, clearError }` returning
`SignInOutcome`) so `screen.tsx` composes it identically:

```ts
const rawNonce = Crypto.randomUUID();
const credential = await AppleAuthentication.signInAsync({
  requestedScopes: [
    AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
    AppleAuthentication.AppleAuthenticationScope.EMAIL,
  ],
  nonce: rawNonce,
});
await signIn("apple", {
  identityToken: credential.identityToken,
  rawNonce,
  // Apple returns the name ONLY on the very first authorization for this
  // Apple ID + app; it never appears in the identity token. Forward it or
  // it is lost forever (short of the user revoking the app in Settings).
  fullName: formatFullName(credential.fullName), // "Given Family" or null
});
```

Details:

- **Nonce.** Generate a cryptographically random nonce per attempt and send
  the raw value to the server alongside the token; the server accepts the
  token only if its `nonce` claim matches. ⚠️ Implementation check: confirm
  whether SDK 56's `expo-apple-authentication` passes `nonce` to
  `ASAuthorizationOpenIDRequest` verbatim or SHA-256-hashes it first (the
  module has done the latter historically — the Firebase integration docs
  rely on it). Decide by inspecting a real token on device, then have the
  server compare against the raw nonce or its SHA-256 accordingly, and pin
  the behaviour with a comment. Primary security is the signature +
  `aud`/`iss`/`exp` checks; the nonce closes token replay across requests.
- **Outcome mapping.** `signInAsync` throws `ERR_REQUEST_CANCELED` when the
  user dismisses the sheet → return `"cancelled"` (silent, matching Google).
  A server-side refusal (org email, §4) arrives as a thrown error from
  `signIn` → return `"rejected"` so the dropdown can explain, matching the
  existing `rejected` alerts. Anything else → `"error"`.
- **Availability.** Export `useAppleSignInAvailable()` backed by
  `AppleAuthentication.isAvailableAsync()` (false on Android/web without
  importing the native module there — guard with `Platform.OS === "ios"`
  before calling). The dropdown row renders only when available.

## 4. Server — `apple` provider in `convex/auth.ts`

A `ConvexCredentials` provider with `id: "apple"`, following the
`retrieveAccount`/`createAccount` pattern of `E2eLogin`:

```
authorize({ identityToken, rawNonce, fullName }, ctx):
  1. Verify the JWT with jose:
       jwtVerify(identityToken, createRemoteJWKSet("https://appleid.apple.com/auth/keys"), {
         issuer: "https://appleid.apple.com",
         audience: ["au.org.sow.theshed", "au.org.sow.theshed.staging"],
       })
  2. Check the nonce claim against rawNonce (raw or SHA-256 — see §3).
  3. Extract sub (stable per-Apple-ID user id — the account key),
     email, email_verified (Apple may send booleans as strings — normalise).
  4. If email ends with @<allowedDomain> → throw
     'Use "Sign in with your SOW account" for your @sow.org.au account.'
     Same rationale as googlePersonal: an org person signing in via Apple
     would mint a second user and split their state.
  5. retrieveAccount(provider "apple", id: sub) → { userId } if it exists.
  6. Else createAccount:
       account: { id: sub }
       profile: { email, name: fullName ?? email-local-part ?? "Apple user",
                  emailVerificationTime: email_verified ? Date.now() : undefined }
       shouldLinkViaEmail: email_verified
     (verified-email linking means someone who previously used
      "Sign in with Google" with the same address resolves to the SAME user
      instead of a duplicate — mirrors how Convex Auth links OAuth accounts.)
  7. return { userId }
```

Notes:

- **Runtime.** `ConvexCredentials.authorize` runs inside the Convex Auth
  `signIn` action in the default runtime: `fetch` (for the JWKS) and Web
  Crypto are available, and `jose` is edge-compatible — **no `"use node"`**,
  which `auth.ts` couldn't take anyway. Add `jose` as a direct dependency
  (it is already in the tree via `@auth/core` — pin our own version rather
  than reaching through a transitive dep).
- **Factor verification out** into `convex/appleIdentity.ts`
  (`verifyAppleIdentityToken(token, rawNonce, audiences, deps?)`) so the
  claim/nonce/domain logic is unit-testable with an injected verifier
  (`convex-test` cannot reach Apple's JWKS).
- **Missing email.** The identity token carries `email` on effectively every
  sign-in (real or relay) when the scope was granted, but treat it as
  optional: key everything off `sub`, skip email linking and the domain check
  when absent, and leave the user email-less (a visitor role needs none —
  staff surfaces key off org emails they can't have).
- **Hide My Email.** A `…@privaterelay.appleid.com` address needs no special
  handling: `linkUserProfiles` finds no staff profile for it → visitor, which
  is exactly right. This is also the feature that satisfies bullet 2 of 4.8 —
  do not gate or discourage it.
- `afterUserCreatedOrUpdated` → `linkUserProfiles` runs unchanged.
- No change to `auth.config.ts`, the `redirect` callback, or either Google
  provider.

## 5. UI — third row in the signed-out dropdown

In `src/components/ui/screen.tsx`, add a row **below "Sign in with Google"**
(divider between, same `dropdownItem` style):

- Icon `logo-apple` (Ionicons), label exactly **"Sign in with Apple"** —
  Apple's required wording. A custom-styled control is permitted by the HIG
  when it follows the branding rules (correct name, Apple logo); a list row
  visually identical to the Google rows also satisfies 4.8's
  equal-prominence expectation precisely *because* it is identical. (The
  `AppleAuthenticationButton` component doesn't fit a menu row; not used.)
- Render only when `Platform.OS === "ios"` and the availability hook says so
  — Android and web keep today's two-row menu. Guideline 4.8 applies to the
  iOS app; extending Apple sign-in to web/Android is §8 follow-up.
- Busy/error handling: fold `apple.busy` / `apple.error` into the existing
  `busy` / `error` composition; `rejected` (org email) gets an alert pointing
  at "Sign in with your SOW account", parallel to the `googlePersonal` one.
- Update the "Apple sign-in is planned" comment.

## 6. Testing

- **Unit (vitest):** `convex/appleIdentity.test.ts` with an injected verifier
  — accepted token → claims; wrong nonce, wrong audience, org-domain email,
  string `"true"` `email_verified`, missing email. Plus an auth-flow test
  that `apple` reuses an existing account by `sub` and email-links a
  pre-existing Google-personal user.
- **Manual matrix (dev client on device / TestFlight — the simulator sheet
  is unreliable for the *first-authorization* path; Settings → Apple ID →
  Sign-In & Security → Sign in with Apple lets you revoke and repeat it):**
  1. First sign-in, share email → name + real email land on the user.
  2. First sign-in, Hide My Email → relay email, still a working visitor.
  3. Second sign-in (no name from Apple) → same user, name preserved.
  4. Cancel the sheet → silent, menu re-enabled.
  5. Apple ID with an @sow.org.au email → rejected with the redirect alert.
  6. Same personal email previously used via "Sign in with Google" → same
     user (linking), not a duplicate.
  7. Staging build (`au.org.sow.theshed.staging`) → audience accepted.
  8. Android + web → no Apple row, Google flows untouched.
- **E2E (Maestro):** the native Apple sheet cannot be scripted — keep the
  `E2eLogin` provider as the signed-in harness and add only a smoke check
  that the iOS dropdown shows the Apple row.

## 7. Rollout

1. Land server + client in one PR; deploy Convex first (`apple` provider is
   additive and inert until a client calls it), then EAS builds.
2. Version → **1.8.0** (new feature), CHANGELOG under Added.
3. Submit the build and **reply to the 4.8 rejection** in App Store Connect:
   Sign in with Apple is now offered alongside Google with equal prominence.
4. Post-release: watch Convex logs for `apple` authorize failures (JWKS
   fetch, nonce mismatches) in the first days.

## 8. Explicitly out of scope (follow-ups)

- **Web / Android Apple sign-in** — needs a Services ID + client-secret JWT
  (`@auth/core` Apple provider); revisit if ever required. Not needed for 4.8.
- **In-app account deletion (Guideline 5.1.1(v))** — the app already creates
  accounts (`googlePersonal`), so this exposure predates Apple sign-in, but
  reviewers often pair it with 4.8. Note: once SIWA exists, account deletion
  must also call Apple's token-revocation endpoint, which *does* need a .p8
  key — budget that into any deletion work.
- **Apple credential-revocation checks** (`getCredentialStateAsync` /
  server-to-server notifications) — Convex sessions already expire
  independently; add only if Apple review or security posture demands it.

## File-by-file summary

| File | Change |
| --- | --- |
| `package.json` | + `expo-apple-authentication`, `expo-crypto`, `jose` |
| `app.json` | + plugin `expo-apple-authentication`; `ios.usesAppleSignIn: true` |
| `src/hooks/useAppleSignIn.ts` | new — native sheet flow, nonce, outcome mapping |
| `src/components/ui/screen.tsx` | third dropdown row (iOS only), busy/error/rejected wiring |
| `convex/appleIdentity.ts` | new — token verification + claim/domain validation (unit-testable) |
| `convex/appleIdentity.test.ts` | new — verification/edge-case tests |
| `convex/auth.ts` | + `Apple` `ConvexCredentials` provider |
| `CHANGELOG.md` / `app.json` version | 1.8.0 entry |
