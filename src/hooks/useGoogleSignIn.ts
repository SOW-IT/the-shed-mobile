import { useAuthActions } from "@convex-dev/auth/react";
import Constants from "expo-constants";
import { makeRedirectUri } from "expo-auth-session";
import * as Linking from "expo-linking";
import { maybeCompleteAuthSession, openAuthSessionAsync } from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

// Dismiss any auth session left dangling by a previous redirect so the next one
// resolves cleanly (recommended for redirect-based auth; no-op on native at
// import time, relevant for the web popup flow).
maybeCompleteAuthSession();

// How long to wait for the OAuth `code` to arrive as a deep link after the auth
// session ends without one. Covers the cold-iOS-session case where the session
// reports dismiss/cancel a moment before the OS delivers the redirect deep link.
const REDIRECT_GRACE_MS = 2500;

/**
 * The two Google providers configured server-side (convex/auth.ts):
 *  - "google": staff sign-in, restricted to the org domain.
 *  - "googlePersonal": any Google account (non-staff), for the public surfaces.
 */
export type GoogleProvider = "google" | "googlePersonal";

/**
 * The result of an interactive sign-in attempt:
 *  - "signed-in": completed, the app is now authenticated.
 *  - "cancelled": the user dismissed the browser (no action needed).
 *  - "rejected": the provider authenticated the account, but our backend refused
 *    it (e.g. an @sow.org.au account used on the non-staff Google option). The
 *    OAuth callback redirects back with no code, so it's otherwise silent — the
 *    UI surfaces a message for this case.
 *  - "error": an unexpected failure; `error` state carries the message.
 */
export type SignInOutcome = "signed-in" | "cancelled" | "rejected" | "error";

// On web the sign-in is a full-page redirect, so the provider that initiated it
// must survive the round-trip to Google and back. sessionStorage lives for the
// tab's lifetime (including navigating away and returning), so the code-exchange
// on return can complete against the SAME provider — exchanging a personal
// account's code against the org-restricted "google" provider would be rejected.
const PENDING_PROVIDER_KEY = "pendingGoogleAuthProvider";

/** Pull the OAuth `code` from a redirect URL. `Linking.parse` understands the
 *  app's custom scheme (theshedmobile://…) more reliably than the URL polyfill,
 *  with `new URL` as a fallback for https redirects. */
const codeFromUrl = (url: string): string | null => {
  const fromExpo = Linking.parse(url).queryParams?.code;
  if (typeof fromExpo === "string") return fromExpo;
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
};

/**
 * Web only: complete a Google sign-in that returned to the app as a full-page
 * redirect with `?code=XXX`. ConvexAuthProvider doesn't auto-exchange the code
 * in Expo's web context, so this does. Mounted ONCE at the root (not in the
 * sign-in button) so the exchange runs no matter which screen the redirect
 * lands on — the app is public now, so that can be any tab.
 */
export const useWebAuthCodeExchange = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  // Set when a web sign-in returns rejected (see below): the OAuth callback
  // redirected home with no code because the backend refused the account. The
  // provider it was attempted with picks the right message. Mirrors the native
  // "rejected" outcome, which the phone surfaces from signInAndClose.
  const [rejectedProvider, setRejectedProvider] = useState<GoogleProvider | null>(
    null
  );
  const [busy, setBusy] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      // Truthy check (not just .has) to match the effect below — an empty
      // ?code= would otherwise start busy but be skipped by the effect,
      // leaving the state stuck busy.
      !!new URLSearchParams(window.location.search).get("code")
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const pending = window.sessionStorage.getItem(
      PENDING_PROVIDER_KEY
    ) as GoogleProvider | null;
    if (!code) {
      // We started a sign-in (pending provider set) but came back with no code:
      // the OAuth callback refused the account and redirected home (e.g. an
      // @sow.org.au email on the personal Google option), so it's otherwise
      // silent on web. Surface it — the same message the phone shows — instead
      // of leaving the user staring at an unchanged, still-signed-out page.
      if (pending) {
        window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        window.history.replaceState({}, "", window.location.pathname);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on load
        setRejectedProvider(pending);
      }
      return;
    }
    // Remove code from URL so a page refresh doesn't re-attempt a used code.
    window.history.replaceState({}, "", window.location.pathname);
    // Complete against the provider that started the flow (defaults to the staff
    // provider for any legacy/in-flight redirect that predates this key).
    const provider = pending || "google";
    window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
    setBusy(true);
    void signIn(provider, { code })
      .catch((e: unknown) => setError(errorText(e)))
      .finally(() => setBusy(false));
  }, [signIn]);

  // Stable references (useCallback) so the caller's alert effects only re-run
  // when the actual error/rejection state changes, not on every render.
  const clearError = useCallback(() => setError(null), []);
  const clearRejected = useCallback(() => setRejectedProvider(null), []);

  return { busy, error, rejectedProvider, clearError, clearRejected };
};

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/**
 * The interactive "Sign in with Google" flow, shared by every sign-in button
 * (the signed-out avatar dropdown). On web it's a full-page redirect to Google
 * (the code exchange on return is {@link useWebAuthCodeExchange}); on native
 * it drives the auth session + deep-link dance below.
 *
 * `provider` selects which server-side Google provider to use: the org-restricted
 * staff "google" (default) or "googlePersonal" for any account (see
 * {@link GoogleProvider}).
 */
export const useGoogleSignIn = (provider: GoogleProvider = "google") => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithGoogle = async (): Promise<SignInOutcome> => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        // Remember which provider started the flow so the code-exchange on
        // return (useWebAuthCodeExchange) completes against the same one.
        window.sessionStorage.setItem(PENDING_PROVIDER_KEY, provider);
        // Full-page redirect to Google (back to wherever this app is served
        // from). Stay busy — we're navigating away, and resetting would briefly
        // re-enable the button before the redirect actually happens.
        await signIn(provider, { redirectTo: window.location.origin });
        return "cancelled"; // page is navigating away; value is unused
      }
      // Pass the scheme explicitly so the staging build always produces
      // theshedmobilestaging:// rather than exp://localhost when run via
      // Expo Go or a dev client against the staging Convex deployment.
      const scheme = Constants.expoConfig?.scheme ?? "theshedmobile";
      const redirectTo = makeRedirectUri({
        scheme: Array.isArray(scheme) ? scheme[0] : scheme,
      });
      const { redirect } = await signIn(provider, { redirectTo });
      if (!redirect) {
        setBusy(false);
        return "cancelled";
      }
      // Capture the OAuth redirect from whichever source delivers it first: the
      // auth-session result, or a deep-link event. On a fresh install the first
      // iOS ASWebAuthenticationSession can resolve as "dismiss"/"cancel" even
      // though the redirect actually fired (cold session + the one-time consent
      // prompt) — that dropped the code and left the user un-signed-in until a
      // second attempt warmed the session. When the session fails to swallow the
      // redirect, the OS hands theshedmobile://…?code= to the app as a normal
      // deep link, so this Linking listener recovers it on that first try.
      const outcome = await new Promise<{
        url: string | null;
        error?: unknown;
        rejected?: boolean;
      }>(
        (resolve) => {
          let settled = false;
          let graceTimer: ReturnType<typeof setTimeout> | null = null;
          // Captured if the auth session *rejects* (an unexpected runtime/env
          // error, NOT a user cancel/dismiss — those resolve). Surfaced only if
          // the grace window also yields no code.
          let sessionError: unknown = null;
          // Set when the browser completed the OAuth round-trip (type
          // "success") but handed back a URL with no code. That's not a cancel —
          // it means our backend's callback refused the account (profile() threw,
          // e.g. an org email on the non-staff option) and redirected home
          // without a code. Distinguishes "rejected" from "cancelled".
          let completedNoCode = false;
          const finishUrl = (url: string) => {
            if (settled) return;
            settled = true;
            if (graceTimer) clearTimeout(graceTimer);
            sub.remove();
            resolve({ url });
          };
          const finishWithoutCode = () => {
            if (settled) return;
            settled = true;
            sub.remove();
            resolve({ url: null, error: sessionError, rejected: completedNoCode });
          };
          // Only settle on a deep link that actually carries the OAuth `code` —
          // an unrelated universal/notification link arriving mid-session must
          // not consume the promise and drop the real redirect.
          const sub = Linking.addEventListener("url", (e) => {
            if (codeFromUrl(e.url)) finishUrl(e.url);
          });
          // When the session hands back a URL with the code, use it immediately.
          // Otherwise DON'T settle right away: on a cold iOS session the
          // ASWebAuthenticationSession frequently resolves as "dismiss"/"cancel"
          // even though the redirect fired, and the OS then delivers
          // theshedmobile://…?code= to the Linking listener a beat later.
          // Settling immediately (the old behaviour) removed the listener and
          // dropped that first-try code — the bug where the user had to tap Sign
          // in twice. Give the listener a short grace window before giving up.
          const startGrace = () => {
            if (settled || graceTimer) return;
            graceTimer = setTimeout(finishWithoutCode, REDIRECT_GRACE_MS);
          };
          void openAuthSessionAsync(redirect.toString(), redirectTo).then(
            (result) => {
              if (result.type === "success" && codeFromUrl(result.url)) {
                finishUrl(result.url);
              } else {
                // A "success" with no code means the callback redirected home
                // without one — a backend rejection, not a user cancel. Flag it
                // so we can tell them why (vs. dismiss/cancel, which stays quiet).
                if (result.type === "success") completedNoCode = true;
                startGrace();
              }
            },
            (e) => {
              // The session itself failed — hold the code error in case the grace
              // window recovers a deep-link code anyway; otherwise surface it.
              sessionError = e;
              startGrace();
            }
          );
        }
      );
      const code = outcome.url ? codeFromUrl(outcome.url) : null;
      if (code) {
        // On success the app flips to Authenticated in place, so stay busy
        // rather than flicker back to clickable while the flip lands.
        await signIn(provider, { code });
        setBusy(false);
        return "signed-in";
      }
      // A real session failure with no recovered code — surface it rather than
      // silently re-enabling as if the user had just cancelled.
      if (outcome.error) throw outcome.error;
      // No redirect captured, or the user dismissed the browser — re-enable.
      setBusy(false);
      return outcome.rejected ? "rejected" : "cancelled";
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
      return "error";
    }
  };

  return { signInWithGoogle, busy, error, clearError: () => setError(null) };
};
