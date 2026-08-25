const fs = require("fs");
const path = require("path");

const IS_STAGING = process.env.APP_VARIANT === "staging";

const resolveGoogleServicesFile = () => {
  if (process.env.GOOGLE_SERVICES_JSON) {
    return process.env.GOOGLE_SERVICES_JSON;
  }
  if (process.env.EAS_BUILD === "true") {
    return undefined;
  }
  const local = path.resolve(__dirname, "google-services.json");
  return fs.existsSync(local) ? "./google-services.json" : undefined;
};

module.exports = ({ config }) => {
  const googleServicesFile = IS_STAGING
    ? undefined
    : resolveGoogleServicesFile();
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
    ...config,
    name: "The SHED Staging",
    scheme: "theshedmobilestaging",
    ios: {
      ...config.ios,
      bundleIdentifier: "au.org.sow.theshed.staging",
      associatedDomains: ["applinks:the-shed-web-dev.vercel.app"],
    },
    android: {
      ...config.android,
      package: "au.org.sow.theshed.staging",
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
