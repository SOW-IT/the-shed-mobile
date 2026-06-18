// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // Generated and build output — not ours to lint.
    ignores: ["dist/**", "coverage/**", "convex/_generated/**", ".expo/**"],
  },
]);
