const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const convexPlugin = require("@convex-dev/eslint-plugin");
const comments = require("@eslint-community/eslint-plugin-eslint-comments/configs");
const globals = require("globals");

// The PR that added these rules (branch chore/pstack-cleanup) lists the review
// comments and commits behind each one. CI runs `eslint . --max-warnings 0`,
// so a rule here is an error or it isn't here.

const webBlindDialogs = [
  {
    selector: "CallExpression[callee.object.name='Alert'][callee.property.name='alert']",
    message:
      "Alert.alert does nothing on web. Use notify() from @/lib/notify. A multi-button sheet on a native-only branch needs a disable comment saying so.",
  },
  {
    selector: "CallExpression[callee.object.name='window'][callee.property.name=/^(alert|confirm|prompt)$/]",
    message: "window.alert/confirm/prompt don't exist on iOS and Android. Use notify() from @/lib/notify, or ConfirmDialog from @/components/ui.",
  },
];

const rawLinking = {
  selector: "CallExpression[callee.object.name='Linking'][callee.property.name='openURL']",
  message:
    "Linking.openURL rejects when nothing handles the URL, and the rejection goes unhandled. Use openExternalLink from @/lib/openExternalLink.",
};

// `as never` fits any type, so it switches type checking off for the value
// without saying what type it should have been.
const asNever = {
  selector: "TSAsExpression > TSNeverKeyword.typeAnnotation",
  message: "`as never` turns type checking off. Give the value its real type, or assert to the type the call expects.",
};

module.exports = defineConfig([
  expoConfig,
  comments.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: ["eslint-enable"] }],
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
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
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: true, arguments: false } }],
      "no-restricted-syntax": ["error", asNever],
    },
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-restricted-syntax": ["error", ...webBlindDialogs, rawLinking, asNever],
      // An index key hands a row's state to its neighbour when a row is added
      // or removed above it. Key on the item (keysFor/keyed in
      // src/lib/listKeys.ts), or useRowIds for an editable list.
      "react/no-array-index-key": "error",
    },
  },
  {
    files: ["convex/**/*.ts"],
    plugins: { "@convex-dev": convexPlugin },
    rules: {
      "@convex-dev/no-old-registered-function-syntax": "error",
      "@convex-dev/require-args-validator": "error",
      "@convex-dev/no-filter-in-query": "error",
      "@convex-dev/no-schema-import-cycle": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[property.name='length'] > AwaitExpression.object > CallExpression.argument[callee.property.name='collect']",
          message:
            "`.collect().length` reads every row to count them. Keep a counter (convex/memberCount.ts, convex/attendanceCounts.ts) or paginate.",
        },
        {
          selector: "CallExpression[callee.property.name=/^run(After|At)$/] > MemberExpression.arguments[object.object.name='api']",
          message: "Schedule internal functions (internal.*), not public api.*, so the scheduled work can't also be called from a client.",
        },
        asNever,
      ],
    },
  },
  {
    // Environment variables are read in one module per runtime, which lists
    // them all: src/env.ts for the app, convex/environment.ts for the backend.
    files: ["src/**/*.ts", "src/**/*.tsx", "convex/**/*.ts"],
    ignores: ["src/env.ts", "convex/environment.ts", "convex/**/*.test.ts"],
    rules: { "no-process-env": "error" },
  },
  {
    files: ["convex/**/*.test.ts"],
    rules: { "@convex-dev/no-filter-in-query": "off", "no-restricted-syntax": ["error", asNever] },
  },
  {
    ignores: ["dist/**", "coverage/**", "convex/_generated/**", ".expo/**", ".verify/**", "ios/**", "android/**"],
  },
]);
