/**
 * The Convex runtime provides `process.env` for deployment environment
 * variables without the full Node.js type surface.
 */
declare const process: {
  env: Record<string, string | undefined>;
};
