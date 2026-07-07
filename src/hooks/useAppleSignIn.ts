import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexError } from "convex/values";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { APPLE_ORG_EMAIL_REJECTION } from "../../convex/appleIdentity";
import type { SignInOutcome } from "./useGoogleSignIn";

// expo-apple-authentication rejects with this code when the user dismisses the
// system sheet — the silent, no-action-needed case (matches Google's cancel).
const CANCEL_CODE = "ERR_REQUEST_CANCELED";

const isCancel = (e: unknown): boolean =>
  typeof e === "object" &&
  e !== null &&
  "code" in e &&
  (e as { code?: unknown }).code === CANCEL_CODE;

// The server rejected an @sow.org.au account arriving via Apple (see
// convex/auth.ts). Thrown as a ConvexError so its `data` survives Convex's
// production error masking; the menu turns this into the "use your SOW account"
// guidance rather than a generic error.
const isOrgEmailRejection = (e: unknown): boolean =>
  e instanceof ConvexError &&
  (e.data as { kind?: unknown } | undefined)?.kind ===
    APPLE_ORG_EMAIL_REJECTION;

const errorText = (e: unknown): string =>
  e instanceof Error ? e.message : String(e);

/** Join Apple's structured name into "Given Family", or null if none was given. */
const formatFullName = (
  name: AppleAuthentication.AppleAuthenticationFullName | null
): string | null => {
  if (!name) return null;
  const full = [name.givenName, name.familyName]
    .filter((p): p is string => !!p && p.trim().length > 0)
    .join(" ")
    .trim();
  return full.length > 0 ? full : null;
};

/**
 * Whether Sign in with Apple can be offered on this device: iOS only, and only
 * where the OS supports it. Returns false on Android/web so the sign-in menu can
 * hide the row. Never calls the native module off iOS.
 */
export const useAppleSignInAvailable = (): boolean => {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    let active = true;
    void AppleAuthentication.isAvailableAsync().then((ok) => {
      if (active) setAvailable(ok);
    });
    return () => {
      active = false;
    };
  }, []);
  return available;
};

/**
 * The "Sign in with Apple" flow, the Guideline 4.8 equivalent login. Presents
 * the native system sheet, then hands the signed identity token to the
 * server-side `apple` provider (convex/auth.ts) for verification. Mirrors
 * {@link useGoogleSignIn}'s shape and {@link SignInOutcome} so the signed-out
 * dropdown composes it identically.
 */
export const useAppleSignIn = () => {
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signInWithApple = async (): Promise<SignInOutcome> => {
    setError(null);
    setBusy(true);
    try {
      // A fresh random nonce per attempt. Apple echoes it into the identity
      // token; the server requires the echo to match, defeating token replay.
      const rawNonce = Crypto.randomUUID();
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: rawNonce,
      });
      if (!credential.identityToken) {
        throw new Error("Apple did not return an identity token.");
      }
      // Apple provides the name ONLY on the first authorization for this Apple
      // ID; it never appears in the token, so forward it or it is lost. Omit the
      // key entirely when absent — the signIn params type disallows undefined.
      const fullName = formatFullName(credential.fullName);
      await signIn("apple", {
        identityToken: credential.identityToken,
        rawNonce,
        ...(fullName ? { fullName } : {}),
      });
      // On success the app flips to Authenticated in place; stay busy so the
      // button doesn't flicker clickable before the flip lands.
      setBusy(false);
      return "signed-in";
    } catch (e) {
      setBusy(false);
      if (isCancel(e)) return "cancelled";
      if (isOrgEmailRejection(e)) return "rejected";
      setError(errorText(e));
      return "error";
    }
  };

  return { signInWithApple, busy, error, clearError: () => setError(null) };
};
