// Every variable the app reads at build time. Expo inlines an
// EXPO_PUBLIC_* variable only where `process.env.NAME` is written out in
// full, so each one is read here by name and exported.
export const CONVEX_URL = process.env.EXPO_PUBLIC_CONVEX_URL;
export const E2E_BUILD = process.env.EXPO_PUBLIC_E2E === "1";
export const APP_VARIANT = process.env.EXPO_PUBLIC_APP_VARIANT;
export const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
export const GOOGLE_MAPS_MAP_ID = process.env.EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID;

const DEV_CONVEX_DEPLOYMENTS = ["successful-lynx-56"];

export const IS_DEV_ENVIRONMENT = DEV_CONVEX_DEPLOYMENTS.some((name) =>
  (CONVEX_URL ?? "").includes(name)
);
