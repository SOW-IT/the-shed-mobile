import { describe, expect, test } from "vitest";
import {
  canEditHomeProfile,
  DEFAULT_HOME_BLOCKS,
  emptyHomeBlock,
  HOME_BLOCK_LABELS,
  HOME_TABS,
  type HomeBlock,
  HomeContentError,
  isHomeTabKey,
  MAX_HOME_BLOCKS,
  MAX_HOME_ITEMS,
  normalizeHomeUrl,
  paragraphs,
  sanitizeHomeBlocks,
} from "./homeContent";

describe("homeContent defaults", () => {
  test("every tab has default content that passes its own checks unchanged", () => {
    for (const { key } of HOME_TABS) {
      expect(DEFAULT_HOME_BLOCKS[key].length).toBeGreaterThan(0);
      expect(sanitizeHomeBlocks(DEFAULT_HOME_BLOCKS[key])).toEqual(DEFAULT_HOME_BLOCKS[key]);
    }
  });

  test("tab keys", () => {
    expect(isHomeTabKey("connect")).toBe(true);
    expect(isHomeTabKey("campuses")).toBe(false);
  });

  test("empty blocks exist for every type", () => {
    for (const type of Object.keys(HOME_BLOCK_LABELS) as HomeBlock["type"][]) {
      expect(emptyHomeBlock(type).type).toBe(type);
    }
  });
});

describe("canEditHomeProfile", () => {
  test("admins, Marketing staff and the Engagement head", () => {
    const marketing = { assignments: [{ role: "Staff", department: "Marketing" }] };
    const finance = { assignments: [{ role: "Staff", department: "Finance" }] };
    const alumni = { assignments: [{ role: "Staff", department: "Alumni" }] };
    const divisionHead = { assignments: [{ role: "Head of Division", division: "Engagement" }] };
    expect(canEditHomeProfile(marketing, false, [])).toBe(true);
    expect(canEditHomeProfile(finance, false, [])).toBe(false);
    expect(canEditHomeProfile(finance, true, [])).toBe(true);
    expect(canEditHomeProfile(alumni, false, [])).toBe(false);
    expect(canEditHomeProfile(divisionHead, false, ["Engagement"])).toBe(true);
    expect(canEditHomeProfile(divisionHead, false, ["Operations"])).toBe(false);
  });
});

describe("normalizeHomeUrl", () => {
  test.each([
    ["https://sow.org.au", "https://sow.org.au"],
    ["  sow.org.au/pray ", "https://sow.org.au/pray"],
    ["info@sowaustralia.com", "mailto:info@sowaustralia.com"],
    ["tel:131114", "tel:131114"],
    ["mailto:a@b.co", "mailto:a@b.co"],
    ["", null],
    ["javascript:alert(1)", null],
    ["not a link", null],
  ])("%s", (raw, expected) => {
    expect(normalizeHomeUrl(raw)).toBe(expected);
  });
});

describe("sanitizeHomeBlocks", () => {
  test("trims text, drops empty rows and optional fields, fixes links", () => {
    const out = sanitizeHomeBlocks([
      { type: "hero", eyebrow: " SOW ", text: " Mission " },
      {
        type: "card",
        title: " Give ",
        body: "a\r\nb",
        icon: " ",
        dot: false,
        campus: "",
        tone: "default",
        buttons: [
          { label: "Donate", url: "donorbox.org", style: "primary", icon: "gift-outline" },
          { label: " ", url: "", style: "ghost" },
        ],
      },
      { type: "links", links: [{ name: "Lifeline", url: "tel:131114", note: " 13 11 14 " }, { name: "", url: "" }] },
      { type: "socials", caption: "", links: [{ label: "IG", icon: "logo-instagram", url: "instagram.com/sow" }, { label: "", icon: "x", url: " " }] },
      {
        type: "campuses",
        campuses: [
          { name: "USYD", short: "", about: "", meetingLabel: " ", meeting: "", programs: [" A ", "", "B"], instagram: "@sowusyd" },
          { name: " ", short: "", about: "", meetingLabel: "", meeting: "", programs: [], instagram: "" },
        ],
      },
      { type: "contact", title: "Contact", body: "" },
    ]);
    expect(out).toEqual([
      { type: "hero", eyebrow: "SOW", text: "Mission" },
      {
        type: "card",
        title: "Give",
        body: "a\nb",
        buttons: [{ label: "Donate", url: "https://donorbox.org", style: "primary", icon: "gift-outline" }],
      },
      { type: "links", links: [{ name: "Lifeline", url: "tel:131114", note: "13 11 14" }] },
      { type: "socials", caption: "", links: [{ label: "IG", icon: "logo-instagram", url: "https://instagram.com/sow" }] },
      {
        type: "campuses",
        campuses: [
          { name: "USYD", short: "", about: "", meetingLabel: "Weekly Meeting", meeting: "", programs: ["A", "B"], instagram: "sowusyd" },
        ],
      },
      { type: "contact", title: "Contact", body: "" },
    ]);
  });

  test("keeps card markers and the highlighted tone", () => {
    expect(
      sanitizeHomeBlocks([
        { type: "card", title: "T", body: "", icon: "heart-outline", dot: true, campus: "UTS", tone: "primary", buttons: [] },
      ])
    ).toEqual([
      { type: "card", title: "T", body: "", icon: "heart-outline", dot: true, campus: "UTS", tone: "primary", buttons: [] },
    ]);
  });

  test.each<[string, HomeBlock[], RegExp]>([
    ["empty heading", [{ type: "heading", text: " " }], /Section 1 \(Section heading\) can't be empty/],
    ["empty card", [{ type: "card", title: "", body: " ", buttons: [] }], /needs a title or text/],
    ["button with no link", [{ type: "card", title: "T", body: "", buttons: [{ label: "Go", url: "", style: "tonal" }] }], /button “Go” needs a web address/],
    ["link with no name", [{ type: "links", links: [{ name: "", url: "https://x.co" }] }], /link name can't be empty/],
    ["too long", [{ type: "text", text: "x".repeat(4001) }], /too long/],
    ["too many sections", Array.from({ length: MAX_HOME_BLOCKS + 1 }, () => ({ type: "text" as const, text: "x" })), /at most/],
    ["too many links", [{ type: "links", links: Array.from({ length: MAX_HOME_ITEMS + 1 }, () => ({ name: "a", url: "https://a.co" })) }], /too many items/],
  ])("refuses %s", (_name, blocks, message) => {
    expect(() => sanitizeHomeBlocks(blocks)).toThrow(HomeContentError);
    expect(() => sanitizeHomeBlocks(blocks)).toThrow(message);
  });
});

test("paragraphs splits on blank lines", () => {
  expect(paragraphs("a\n\n  \nb\nc\n\n")).toEqual(["a", "b\nc"]);
});
