// Which environment this build is running against.
//
// The staging app, the dev web build (the-shed-web-dev) and local `npm start`
// all point at the dev Convex deployment; production points at its own. So the
// Convex URL the app was built with tells us whether this is a test build.

const DEV_CONVEX_DEPLOYMENTS = ["industrious-robin-425"];
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";

/** True on the dev / staging environment (anything pointed at dev Convex). */
export const IS_DEV_ENVIRONMENT = DEV_CONVEX_DEPLOYMENTS.some((name) =>
  convexUrl.includes(name)
);
