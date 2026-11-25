import { describe, expect, test } from "vitest";
import { headerPlacement, titleInsets, type ScreenHeader } from "./screenHeader";

const header: ScreenHeader = {
  title: "Churches",
  icon: "business-outline",
  action: { label: "Add", onPress: () => {} },
};

describe("headerPlacement", () => {
  test("on a phone the title and action go in the top bar, and the page shows neither", () => {
    expect(headerPlacement(false, header)).toEqual({ topBar: header, page: null });
  });

  test("on a wide screen there is no top bar, so the page shows them", () => {
    expect(headerPlacement(true, header)).toEqual({ topBar: null, page: header });
  });

  test("a screen without a header puts nothing anywhere", () => {
    expect(headerPlacement(false, undefined)).toEqual({ topBar: null, page: null });
    expect(headerPlacement(true, undefined)).toEqual({ topBar: null, page: null });
  });

  test("a title with no action keeps the action out", () => {
    expect(headerPlacement(false, { title: "Insights" }).topBar).toEqual({ title: "Insights" });
  });
});

describe("titleInsets", () => {
  test("keeps the usual inset on both sides while the controls are small", () => {
    expect(titleInsets(60, 40, 24)).toEqual({ left: 60, right: 60 });
  });

  test("clears whichever side is wider, so the title never runs under a button", () => {
    expect(titleInsets(60, 40, 130)).toEqual({ left: 60, right: 142 });
    expect(titleInsets(60, 96.4, 30)).toEqual({ left: 109, right: 60 });
  });
});
