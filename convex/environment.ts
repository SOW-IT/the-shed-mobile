// Every environment variable the backend reads. Set them with
// `npx convex env set`; LAUNCH.md says which ones prod needs.
export type EnvName =
  | "APPLE_KEY_ID"
  | "APPLE_PRIVATE_KEY"
  | "APPLE_TEAM_ID"
  | "APP_URL"
  | "AUTH_ALLOWED_DOMAIN"
  | "E2E_AUTH_ENABLED"
  | "E2E_AUTH_SECRET"
  | "GOOGLE_ADMIN_IMPERSONATE"
  | "GOOGLE_CALENDAR_ID"
  | "GOOGLE_MAPS_API_KEY"
  | "GOOGLE_SA_CLIENT_EMAIL"
  | "GOOGLE_SA_PRIVATE_KEY"
  | "NIGHTLY_JOBS_PAUSED"
  | "RESEND_API_KEY"
  | "RESEND_FROM_EMAIL"
  | "SITE_URL"
  | "SPOTIFY_CLIENT_ID"
  | "SPOTIFY_CLIENT_SECRET"
  | "SPOTIFY_TOKEN_ENCRYPTION_KEY"
  | "YOUTUBE_API_KEY";

/** The variable's value, read at the call, so a test can set it first. */
export const env = (name: EnvName): string | undefined => process.env[name];
