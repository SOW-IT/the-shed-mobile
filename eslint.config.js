const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "import/namespace": "off" },
  },
  {
    ignores: ["dist/**", "coverage/**", "convex/_generated/**", ".expo/**"],
  },
]);
