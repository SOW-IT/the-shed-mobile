import type { Href, useRouter } from "expo-router";

export const backOr = (router: ReturnType<typeof useRouter>, fallback: Href) =>
  router.canGoBack() ? router.back() : router.replace(fallback);
