### Changed
- **Pull requests no longer pick their own version number.** After each
  merge, the Release version workflow gives `main` the next patch version and
  writes that version's changelog section from the notes the merged pull
  requests left in `changelog.d/`. Open pull requests stop conflicting with
  each other over the version and the changelog, and no number is used
  twice. The over-the-air update and the "merged" message in Google Chat now
  come from the numbered commit.
