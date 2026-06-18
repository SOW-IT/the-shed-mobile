import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";
import { linkUserProfiles } from "./userLink";

// Only accounts from this Google Workspace organisation may sign in.
const allowedDomain = process.env.AUTH_ALLOWED_DOMAIN ?? "sow.org.au";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  callbacks: {
    // Where sign-in may return to. The client passes its own origin so the
    // hosted site, local dev/static servers and the native app all come back
    // to themselves instead of defaulting to SITE_URL.
    async redirect({ redirectTo }) {
      const allowed = [process.env.SITE_URL, process.env.APP_URL].filter(
        (url): url is string => !!url
      );
      if (redirectTo.startsWith("/")) {
        return `${process.env.SITE_URL ?? ""}${redirectTo}`;
      }
      if (
        allowed.some((url) => redirectTo === url || redirectTo.startsWith(`${url}/`)) ||
        /^https?:\/\/localhost(:\d+)?(\/|$|\?)/.test(redirectTo) ||
        // Vercel preview deployments of the web build (per-branch URLs), scoped
        // to this project + team so it isn't an open redirect to any *.vercel.app.
        /^https:\/\/the-shed-web-[a-z0-9-]+-kimchankwons-projects\.vercel\.app(\/|$|\?)/.test(
          redirectTo
        ) ||
        redirectTo.startsWith("theshedmobile://") ||
        // Staging app variant (separate bundle id) uses its own scheme so it can
        // be installed alongside production — see app.config.js.
        redirectTo.startsWith("theshedmobilestaging://") ||
        redirectTo.startsWith("exp://")
      ) {
        return redirectTo;
      }
      throw new Error(`Invalid redirectTo: ${redirectTo}`);
    },
    // Bind staff profiles to the user id on every sign-in, and re-key all
    // email references if the Google account's email changed (rename).
    async afterUserCreatedOrUpdated(ctx, { userId }) {
      await linkUserProfiles(ctx, userId);
    },
  },
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
