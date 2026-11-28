# Changelog notes

Each pull request adds one file here, `<branch name, / as ->.md` (branch
`feat/more-eye-shapes` → `feat-more-eye-shapes.md`), with its entries in
`CHANGELOG.md`'s voice under `### Added`, `### Removed`, `### Changed` or
`### Fixed`. No version heading: the number isn't known until it merges.

After the merge, the Release version workflow
(`.github/workflows/release-version.yml`) gives `main` its next version,
moves every note here into that version's section of `CHANGELOG.md`, and
deletes the files. A merge without a note gets its title as the entry.

Patch by default. A note asks for a minor or major release with front matter:

```markdown
---
bump: minor
---
### Added
- **A new game.** …
```

This file is never treated as a note.
