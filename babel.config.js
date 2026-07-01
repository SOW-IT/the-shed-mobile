// Explicit Babel config so the transform pipeline is deterministic across
// local, CI, and EAS builds rather than relying on @expo/metro-config's
// implicit default. `babel-preset-expo` is what pulls in the React Native /
// Expo transforms AND the `react-native-worklets` plugin that compiles
// Reanimated 4 worklets ahead of time — without that plugin running, worklets
// fall back to runtime source compilation under Hermes, which aborts the app
// at launch in a release build. Keep this preset present (and rebuild with a
// clean cache) so worklets are always precompiled.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
