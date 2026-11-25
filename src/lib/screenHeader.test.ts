import { describe, expect, test } from "vitest";
import { headerPlacement, titleInsets, type ScreenHeader } from "./screenHeader";

const header: ScreenHeader = {
  title: "Devotionals",
  icon: "book-outline",
  action: { label: "Today", onPress: () => {} },
};

describe("headerPlacement", () => {
  test("on a phone the title and Today go in the top bar, and the page shows neither", () => {
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
    expect(headerPlacement(false, { title: "Churches" }).topBar).toEqual({ title: "Churches" });
    expect(headerPlacement(true, { title: "Churches" }).page).toEqual({ title: "Churches" });
  });
});

describe("titleInsets", () => {
  test("keeps the usual inset on both sides while the controls are small", () => {
    expect(titleInsets(60, 40, 24, 370)).toEqual({ left: 60, right: 60 });
  });

  test("pads both sides to clear the wider one, so the title stays centred and clear of buttons", () => {
    expect(titleInsets(60, 40, 100, 370)).toEqual({ left: 112, right: 112 });
    expect(titleInsets(60, 96.4, 30, 370)).toEqual({ left: 109, right: 109 });
  });

  test("when centring would leave the title too little room, it centres between the controls instead", () => {
    expect(titleInsets(60, 40, 165, 370)).toEqual({ left: 60, right: 177 });
  });
});
