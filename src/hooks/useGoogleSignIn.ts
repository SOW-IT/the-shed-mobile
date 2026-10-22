import { useAuthActions } from "@convex-dev/auth/react";
import { makeRedirectUri } from "expo-auth-session";
import Constants from "expo-constants";
import * as Linking from "expo-linking";
import {
  maybeCompleteAuthSession,
  openAuthSessionAsync,
} from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import { searchWithoutSignInParams, WEB_ONLY_MARKER } from "../../shared/appLinks";

maybeCompleteAuthSession();

const REDIRECT_GRACE_MS = 2500;

export type SignInOutcome = "signed-in" | "cancelled" | "rejected" | "error";

const PROVIDER = "google";

const PENDING_PROVIDER_KEY = "pendingGoogleAuthProvider";

const pageWithoutSignInParams = () =>
  `${window.location.pathname}${searchWithoutSignInParams(window.location.search)}`;

const codeFromUrl = (url: string): string | null => {
  const fromExpo = Linking.parse(url).queryParams?.code;
  if (typeof fromExpo === "string") return fromExpo;
  try {
    return new URL(url).searchParams.get("code");
  } catch {
    return null;
  }
};

export const useWebAuthCodeExchange = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [busy, setBusy] = useState(
    () =>
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.location.pathname !== "/spotify-callback" &&
      !!new URLSearchParams(window.location.search).get("code"),
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    // Spotify OAuth codes must never be processed by Google Auth.
    if (window.location.pathname === "/spotify-callback") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const pending = window.sessionStorage.getItem(PENDING_PROVIDER_KEY);
    if (!code) {
      if (pending) {
        window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        window.history.replaceState({}, "", pageWithoutSignInParams());
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on load
        setRejected(true);
      }
      return;
    }
    const exchange = () => {
      window.history.replaceState({}, "", pageWithoutSignInParams());
      window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
      setBusy(true);
      void signIn(PROVIDER, { code })
        .catch((e: unknown) => setError(errorText(e)))
        .finally(() => setBusy(false));
    };
    if ((window as { __shedCodeToApp?: boolean }).__shedCodeToApp) {
      const dropped = () => {
        window.history.replaceState({}, "", pageWithoutSignInParams());
        window.sessionStorage.removeItem(PENDING_PROVIDER_KEY);
        setBusy(false);
      };
      window.addEventListener("shed-code-fallback", exchange, { once: true });
      window.addEventListener("shed-code-taken", dropped, { once: true });
      return () => {
        window.removeEventListener("shed-code-fallback", exchange);
        window.removeEventListener("shed-code-taken", dropped);
      };
    }
    exchange();
  }, [signIn]);

  const clearError = useCallback(() => setError(null), []);
  const clearRejected = useCallback(() => setRejected(false), []);

  return { busy, error, rejected, clearError, clearRejected };
};

export const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

export const useGoogleSignIn = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithGoogle = async (): Promise<SignInOutcome> => {
    setError(null);
    setBusy(true);
    try {
      if (Platform.OS === "web") {
        window.sessionStorage.setItem(PENDING_PROVIDER_KEY, PROVIDER);
        await signIn(PROVIDER, {
          redirectTo: `${window.location.origin}${pageWithoutSignInParams()}${WEB_ONLY_MARKER}`,
        });
        return "cancelled";
      }
      const scheme = Constants.expoConfig?.scheme ?? "theshedmobile";
      const redirectTo = makeRedirectUri({
        scheme: Array.isArray(scheme) ? scheme[0] : scheme,
      });
      const { redirect } = await signIn(PROVIDER, { redirectTo });
      if (!redirect) {
        setBusy(false);
        return "cancelled";
      }
      const outcome = await new Promise<{
        url: string | null;
        error?: unknown;
        rejected?: boolean;
      }>((resolve) => {
        let settled = false;
        let graceTimer: ReturnType<typeof setTimeout> | null = null;
        let sessionError: unknown = null;
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
          resolve({
            url: null,
            error: sessionError,
            rejected: completedNoCode,
          });
        };
        const sub = Linking.addEventListener("url", (e) => {
          if (codeFromUrl(e.url)) finishUrl(e.url);
        });
        const startGrace = () => {
          if (settled || graceTimer) return;
          graceTimer = setTimeout(finishWithoutCode, REDIRECT_GRACE_MS);
        };
        void openAuthSessionAsync(redirect.toString(), redirectTo).then(
          (result) => {
            if (result.type === "success" && codeFromUrl(result.url)) {
              finishUrl(result.url);
            } else {
              if (result.type === "success") completedNoCode = true;
              startGrace();
            }
          },
          (e) => {
            sessionError = e;
            startGrace();
          },
        );
      });
      const code = outcome.url ? codeFromUrl(outcome.url) : null;
      if (code) {
        await signIn(PROVIDER, { code });
        setBusy(false);
        return "signed-in";
      }
      if (outcome.error) throw outcome.error;
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
