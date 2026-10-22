type AppVariant = "production" | "staging";

type AppLink = {
  scheme: string;
  web: string;
  iosStore: string | null;
  androidStore: string | null;
};

export const APP_LINKS: Record<AppVariant, AppLink> = {
  production: {
    scheme: "theshedmobile",
    web: "https://theshed.sow.org.au",
    iosStore: "https://apps.apple.com/app/id6781592871",
    androidStore: "https://play.google.com/store/apps/details?id=au.org.sow.theshed",
  },
  staging: {
    scheme: "theshedmobilestaging",
    web: "https://the-shed-web-dev.vercel.app",
    iosStore: null,
    androidStore: null,
  },
};

export const appVariantFrom = (value: string | undefined): AppVariant =>
  value?.trim().toLowerCase() === "staging" ? "staging" : "production";

export const appLinkFor = (value: string | undefined): AppLink =>
  APP_LINKS[appVariantFrom(value)];

export const appLinkForScheme = (scheme: string | undefined): AppLink =>
  Object.values(APP_LINKS).find((link) => link.scheme === scheme) ?? APP_LINKS.production;

export const WEB_ONLY_MARKER = "#noapp";

const parts = (version: string) => version.split(".").map((n) => Number.parseInt(n, 10) || 0);

export const compareVersions = (a: string, b: string): number => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

export const isAppVersion = (value: string): boolean => /^\d+\.\d+\.\d+$/.test(value);

type UpdateStatus = "ok" | "recommended" | "required";

type UpdatePolicy = { minimum?: string; recommended?: string };

export const updateStatusFor = (version: string, policy: UpdatePolicy | null): UpdateStatus => {
  if (!isAppVersion(version) || !policy) return "ok";
  if (policy.minimum && compareVersions(version, policy.minimum) < 0) return "required";
  if (policy.recommended && compareVersions(version, policy.recommended) < 0) return "recommended";
  return "ok";
};

const SIGN_IN_RETURN_PARAMS = [
  "code",
  "state",
  "scope",
  "authuser",
  "prompt",
  "hd",
  "error",
  "error_description",
] as const;

export const searchWithoutSignInParams = (search: string): string => {
  const params = new URLSearchParams(search);
  for (const key of SIGN_IN_RETURN_PARAMS) params.delete(key);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
};
