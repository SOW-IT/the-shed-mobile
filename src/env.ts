const DEV_CONVEX_DEPLOYMENTS = ["successful-lynx-56"];
const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "";

export const IS_DEV_ENVIRONMENT = DEV_CONVEX_DEPLOYMENTS.some((name) =>
  convexUrl.includes(name)
);
