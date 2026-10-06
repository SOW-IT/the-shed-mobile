// pdf-lib's prebuilt ES module: the same API as "pdf-lib", with its tslib
// helpers bundled in. Metro's web bundler can't load pdf-lib's unbundled
// build (its `tslib` import resolves to a wrapper with no default export).
declare module "pdf-lib/dist/pdf-lib.esm.min.js" {
  export * from "pdf-lib";
}
