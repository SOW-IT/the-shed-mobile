/**
 * Which mobile app a web deployment hands phones over to. The production web
 * pairs with The SHED; the dev web (the-shed-web-dev) pairs with The SHED
 * Staging, which is on TestFlight rather than the stores.
 */
export type AppVariant = "production" | "staging";

export type AppLink = {
  scheme: string;
  iosStore: string | null;
  androidStore: string | null;
};

export const APP_LINKS: Record<AppVariant, AppLink> = {
  production: {
    scheme: "theshedmobile",
    iosStore: "https://apps.apple.com/app/id6781592871",
    androidStore: "https://play.google.com/store/apps/details?id=au.org.sow.theshed",
  },
  staging: { scheme: "theshedmobilestaging", iosStore: null, androidStore: null },
};

/** The variant named by EXPO_PUBLIC_APP_VARIANT at build time; production
 *  unless it says staging. */
export const appVariantFrom = (value: string | undefined): AppVariant =>
  value?.trim().toLowerCase() === "staging" ? "staging" : "production";

export const appLinkFor = (value: string | undefined): AppLink =>
  APP_LINKS[appVariantFrom(value)];
