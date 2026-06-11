import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Only accounts from this Google Workspace organisation may sign in.
const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Google({
      // `hd` asks Google to restrict the account picker to the organisation;
      // the profile callback enforces it server-side (hd alone is advisory).
      authorization: { params: { hd: allowedDomain, prompt: "select_account" } },
      profile(profile) {
        const email = (profile.email ?? "").toLowerCase();
        if (!email.endsWith(`@${allowedDomain}`)) {
          throw new Error(`Only ${allowedDomain} Google accounts can sign in`);
        }
        return {
          id: profile.sub,
          name: profile.name,
          email,
          image: profile.picture,
        };
      },
    }),
  ],
});
