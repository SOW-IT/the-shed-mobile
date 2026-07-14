// Dynamic Expo config.
//
// The base config lives in app.json. This wrapper applies per-variant overrides
// so we can ship a separate "staging" app — its own name and bundle id /
// package — alongside production, installable side-by-side and with its own
// App Store Connect / TestFlight entry.
//
// The variant is selected with the APP_VARIANT env var, set per build profile in
// eas.json (APP_VARIANT=staging for the staging profile; unset otherwise, which
// resolves to production).
//
// Android push (FCM): google-services.json is gitignored. Prefer the EAS file
// env `GOOGLE_SERVICES_JSON` (production/preview builds), with a local
// `./google-services.json` fallback for `eas build` from a machine that has
// the file. Download from Firebase project `theshedsow` for package
// `au.org.sow.theshed`.

const fs = require("fs");
const path = require("path");

const IS_STAGING = process.env.APP_VARIANT === "staging";

const resolveGoogleServicesFile = () => {
  if (process.env.GOOGLE_SERVICES_JSON) {
    return process.env.GOOGLE_SERVICES_JSON;
  }
  const local = path.resolve(__dirname, "google-services.json");
  return fs.existsSync(local) ? "./google-services.json" : undefined;
};

module.exports = ({ config }) => {
  const googleServicesFile = resolveGoogleServicesFile();
  const withAndroidPush = {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };

  if (!IS_STAGING) {
    return withAndroidPush;
  }

  return {
    ...withAndroidPush,
    name: "The SHED Staging",
    // Own deep-link scheme so staging and production can be installed
    // side-by-side without the OS confusing which app owns the OAuth redirect.
    // This scheme is allowlisted in convex/auth.ts's `redirect` callback.
    scheme: "theshedmobilestaging",
    ios: {
      ...withAndroidPush.ios,
      bundleIdentifier: "au.org.sow.theshed.staging",
      // Universal Links for the dev web so the staging app intercepts https://
      // the-shed-web-dev.vercel.app links without going through the browser.
      associatedDomains: ["applinks:the-shed-web-dev.vercel.app"],
    },
    android: {
      ...withAndroidPush.android,
      package: "au.org.sow.theshed.staging",
      // App Links for the dev web — autoVerify requires the assetlinks.json to
      // be served at https://the-shed-web-dev.vercel.app/.well-known/assetlinks.json.
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [{ scheme: "https", host: "the-shed-web-dev.vercel.app" }],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
  };
};
