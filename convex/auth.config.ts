export default {
  providers: [
    {
      // eslint-disable-next-line no-process-env -- the form Convex documents for auth.config.ts, which it reads apart from the functions
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
