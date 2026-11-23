import { useAuthActions } from "@convex-dev/auth/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { LoadingState } from "@/components/ui";
import { E2E_BUILD } from "@/env";

const E2E_ENABLED = __DEV__ || E2E_BUILD;

export default function E2eAuthScreen() {
  const { signIn, signOut } = useAuthActions();
  const router = useRouter();
  const { email, secret, signout } = useLocalSearchParams<{
    email?: string;
    secret?: string;
    signout?: string;
  }>();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void (async () => {
      if (E2E_ENABLED && signout === "1") {
        await signOut().catch(() => {});
      } else if (
        E2E_ENABLED &&
        typeof email === "string" &&
        typeof secret === "string"
      ) {
        try {
          await signOut().catch(() => {});
          await signIn("e2e", { email, secret });
        } catch (e) {
          console.warn("[e2e-auth] sign-in failed", e);
        }
      }
      router.replace("/");
    })();
  }, [email, secret, signout, signIn, signOut, router]);

  return <LoadingState />;
}
