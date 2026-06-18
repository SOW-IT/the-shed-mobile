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

const IS_STAGING = process.env.APP_VARIANT === "staging";

module.exports = ({ config }) => {
  if (!IS_STAGING) {
    return config;
  }

  return {
    ...config,
    name: "The SHED Staging",
    // Own deep-link scheme so staging and production can be installed
    // side-by-side without the OS confusing which app owns the OAuth redirect.
    // This scheme is allowlisted in convex/auth.ts's `redirect` callback.
    scheme: "theshedmobilestaging",
    ios: {
      ...config.ios,
      bundleIdentifier: "au.org.sow.theshed.staging",
    },
    android: {
      ...config.android,
      package: "au.org.sow.theshed.staging",
    },
  };
};
