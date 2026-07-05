import { useAuthActions } from "@convex-dev/auth/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { LoadingState } from "@/components/ui";

// Dev/test-only auth bypass so Maestro can drive signed-in flows without the
// (unscriptable) Google OAuth web sheet. Open:
//
//   theshedmobile://e2e-auth?email=someone@sow.org.au&secret=<E2E_AUTH_SECRET>
//
// and this screen signs the app in via the gated "e2e" credentials provider
// (see convex/auth.ts), then routes to the app root — landing wherever that role
// normally lands.
//
// Gated on the client so production bundles never even attempt it; the server
// provider is ALSO absent in production (E2E_AUTH_ENABLED unset), which is the
// real security boundary. With both off this screen is inert — it just replaces
// itself with "/".
const E2E_ENABLED = __DEV__ || process.env.EXPO_PUBLIC_E2E === "1";

export default function E2eAuthScreen() {
  const { signIn, signOut } = useAuthActions();
  const router = useRouter();
  const { email, secret, signout } = useLocalSearchParams<{
    email?: string;
    secret?: string;
    signout?: string;
  }>();
  // Deep links can re-render this screen; only act once.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      if (E2E_ENABLED && signout === "1") {
        // ?signout=1 — return to a signed-out state (used by public flows so
        // they start clean regardless of a leftover session).
        await signOut().catch(() => {});
      } else if (
        E2E_ENABLED &&
        typeof email === "string" &&
        typeof secret === "string"
      ) {
        try {
          // Sign out any existing session first so opening this link reliably
          // SWITCHES to the requested account — signIn() alone is a no-op when a
          // session already exists, which breaks role-switching between flows.
          await signOut().catch(() => {});
          await signIn("e2e", { email, secret });
        } catch (e) {
          // Surface in Metro logs; the flow will fail its next assertion.
          console.warn("[e2e-auth] sign-in failed", e);
        }
      }
      router.replace("/");
    })();
  }, [email, secret, signout, signIn, signOut, router]);

  return <LoadingState />;
}
