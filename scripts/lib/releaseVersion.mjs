const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;
const GROUP_ORDER = ["Added", "Removed", "Changed", "Fixed"];
const UNRELEASED_HEADING = "## [Unreleased]";

export const parseVersion = (version) => {
  const match = VERSION_PATTERN.exec(String(version ?? "").trim());
  if (!match) throw new Error(`"${version}" is not a major.minor.patch version.`);
  return match.slice(1).map(Number);
};

export const compareVersions = (a, b) => {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
};

export const awaitsRelease = (version, parentVersion) =>
  parentVersion != null && compareVersions(version, parentVersion) <= 0;

const BUMPS = ["patch", "minor", "major"];

/** The version after the highest of `versions`, raising `bump` (patch, minor or major). */
export const nextVersion = (bump, ...versions) => {
  if (!BUMPS.includes(bump)) throw new Error(`"${bump}" is not patch, minor or major.`);
  const highest = versions.reduce((max, version) => (compareVersions(version, max) > 0 ? version : max));
  const [major, minor, patch] = parseVersion(highest);
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const nextPatch = (...versions) => nextVersion("patch", ...versions);

/**
 * Splits a changelog.d note into its notes and the bump it asks for. A note may
 * start with front matter (`---`, `bump: minor`, `---`) to ask for a minor or
 * major release; without it, it asks for a patch.
 */
export const parseFragment = (text, file = "a changelog.d note") => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!match) return { bump: "patch", notes: text };
  let bump = "patch";
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const field = /^bump:\s*(\S+)\s*$/.exec(line);
    if (!field || !BUMPS.includes(field[1])) {
      throw new Error(`${file} has front matter "${line.trim()}"; the only field is bump: patch, minor or major.`);
    }
    bump = field[1];
  }
  return { bump, notes: text.slice(match[0].length) };
};

/** The largest of the bumps asked for (patch when none are). */
export const largestBump = (bumps) => BUMPS[Math.max(0, ...bumps.map((bump) => BUMPS.indexOf(bump)))];

const replaceExactlyOnce = (text, pattern, version, file) => {
  const matches = text.match(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`)) ?? [];
  if (matches.length !== 1) {
    throw new Error(`Expected one version line to set in ${file}, found ${matches.length}.`);
  }
  return text.replace(pattern, (_whole, before, _old, after) => `${before}${version}${after}`);
};

export const setPackageJsonVersion = (text, version) =>
  replaceExactlyOnce(text, /^( {2}"version": ")([^"]*)(")/m, version, "package.json");

export const setAppJsonVersion = (text, version) =>
  replaceExactlyOnce(text, /^( {4}"version": ")([^"]*)(")/m, version, "app.json");

export const setPackageLockVersion = (text, version) => {
  const top = replaceExactlyOnce(text, /^( {2}"version": ")([^"]*)(")/m, version, "package-lock.json");
  return replaceExactlyOnce(
    top,
    /("packages": \{\n {4}"": \{\n {6}"name": "[^"]*",\n {6}"version": ")([^"]*)(")/,
    version,
    "package-lock.json"
  );
};

export const appJsonVersion = (text) => JSON.parse(text).expo.version;
export const packageJsonVersion = (text) => JSON.parse(text).version;

const isVersionHeading = (line) => line.startsWith("## [");

const splitSections = (changelog) => {
  const lines = changelog.split("\n");
  const sections = [];
  let current = { heading: null, lines: [] };
  for (const line of lines) {
    if (isVersionHeading(line)) {
      sections.push(current);
      current = { heading: line, lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.map((section) => ({ heading: section.heading, text: section.lines.join("\n") }));
};

const headingCounts = (sections) => {
  const counts = new Map();
  for (const { heading } of sections) {
    if (heading) counts.set(heading, (counts.get(heading) ?? 0) + 1);
  }
  return counts;
};

const bodyOf = (sectionText) => sectionText.split("\n").slice(1).join("\n");

export const groupNotes = (notes) => {
  const groups = new Map();
  let group = "Changed";
  for (const line of notes.split("\n")) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      group = heading[1];
      continue;
    }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(line);
  }
  const trimmed = new Map();
  for (const [name, lines] of groups) {
    const text = lines.join("\n").replace(/^\s*\n/, "").trimEnd();
    if (text.trim()) trimmed.set(name, text);
  }
  return trimmed;
};

const mergeGroups = (noteTexts) => {
  const merged = new Map();
  for (const notes of noteTexts) {
    for (const [name, text] of groupNotes(notes)) {
      merged.set(name, merged.has(name) ? `${merged.get(name)}\n${text}` : text);
    }
  }
  const known = GROUP_ORDER.filter((name) => merged.has(name));
  const others = [...merged.keys()].filter((name) => !GROUP_ORDER.includes(name));
  return [...known, ...others].map((name) => `### ${name}\n${merged.get(name)}`).join("\n\n");
};

export const changelogVersions = (changelog) =>
  [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map((match) => match[1]);

export const sydneyDate = (now) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const fallbackEntry = (subject) => `- ${subject.trim()}`;

export const releaseChangelog = ({ changelog, parentChangelog, version, date, fragments = [], fallbackSubjects = [] }) => {
  const sections = splitSections(changelog);
  const unreleasedIndex = sections.findIndex((section) => section.heading === UNRELEASED_HEADING);
  if (unreleasedIndex === -1) throw new Error(`CHANGELOG.md has no "${UNRELEASED_HEADING}" heading.`);
  if (sections.some((section) => section.heading?.startsWith(`## [${version}]`))) {
    throw new Error(`CHANGELOG.md already has a ${version} section.`);
  }

  const handNumbered = new Set();
  if (parentChangelog != null) {
    const parentCounts = headingCounts(splitSections(parentChangelog));
    for (const [heading, count] of headingCounts(sections)) {
      const extra = count - (parentCounts.get(heading) ?? 0);
      if (heading === UNRELEASED_HEADING || extra <= 0) continue;
      const candidates = sections
        .map((section, index) => ({ section, index }))
        .filter(({ section }) => section.heading === heading)
        .sort((a, b) => Number(parentChangelog.includes(a.section.text.trimEnd())) - Number(parentChangelog.includes(b.section.text.trimEnd())));
      candidates.slice(0, extra).forEach(({ index }) => handNumbered.add(index));
    }
  }

  const noteTexts = [
    bodyOf(sections[unreleasedIndex].text),
    ...[...handNumbered].sort((a, b) => a - b).map((index) => bodyOf(sections[index].text)),
    ...fragments,
  ].filter((notes) => notes.trim());
  const fallback = fallbackSubjects.map(fallbackEntry).join("\n");
  const notes = mergeGroups(fallback ? [...noteTexts, `### Changed\n${fallback}`] : noteTexts);

  const kept = sections.filter((_section, index) => index !== unreleasedIndex && !handNumbered.has(index));
  const preamble = kept.shift().text.trimEnd();
  const rest = kept.map((section) => section.text.trimEnd()).join("\n\n");
  const released = `## [${version}] - ${date}\n\n${notes || "### Changed\n- Maintenance release."}`;
  return `${preamble}\n\n${UNRELEASED_HEADING}\n\n${released}\n\n${rest}\n`;
};
