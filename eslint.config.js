const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "import/namespace": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@expo/vector-icons",
              message:
                "Import one icon set, e.g. @expo/vector-icons/Ionicons. The package root ships every icon font in the app.",
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "coverage/**", "convex/_generated/**", ".expo/**"],
  },
]);
