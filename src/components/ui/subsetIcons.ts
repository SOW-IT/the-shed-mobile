import createIconSet from "@expo/vector-icons/createIconSet";

// The app shows two MaterialCommunityIcons glyphs and one FontAwesome glyph.
// Importing those sets whole shipped a 1.3 MB and a 166 KB font, plus their
// glyph maps (about 190 KB of JS), for three icons. These fonts are subsets of
// the ones in @expo/vector-icons with the same outlines and metrics, so the
// icons draw exactly as before. Both keep their name tables, which carry the
// licences (MaterialCommunityIcons: Apache 2.0; FontAwesome 4.7: SIL OFL 1.1).
//
// To add a glyph, look up its code point in
// node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/,
// add it below, and rebuild the font with fonttools:
//   pyftsubset node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.ttf \
//     --unicodes=U+F0C44,U+F00EF --name-IDs='*' --output-file=assets/fonts/MaterialCommunityIcons-subset.ttf
// The full sets are blocked in eslint.config.js so they don't creep back in.

export const MaterialSubsetIcons = createIconSet(
  {
    "calendar-check": 0xf00ef,
    "calendar-check-outline": 0xf0c44,
  },
  "material-community-subset",
  require("../../../assets/fonts/MaterialCommunityIcons-subset.ttf")
);

export const FontAwesomeSubsetIcons = createIconSet(
  { spotify: 0xf1bc },
  "font-awesome-subset",
  require("../../../assets/fonts/FontAwesome-subset.ttf")
);
