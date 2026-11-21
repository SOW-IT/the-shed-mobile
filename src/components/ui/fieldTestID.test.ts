import { describe, expect, test } from "vitest";
import { fieldTestID } from "./fieldTestID";

describe("fieldTestID", () => {
  test("turns the label into a kebab-case id", () => {
    expect(fieldTestID("Title")).toBe("field-title");
    expect(fieldTestID("Link (web, email or tel:number)")).toBe("field-link-web-email-or-tel-number");
    expect(fieldTestID("BSB")).toBe("field-bsb");
  });

  test("leaves out (optional), so the id survives a field becoming optional", () => {
    expect(fieldTestID("Phone (optional)")).toBe("field-phone");
    expect(fieldTestID("Note (Optional)")).toBe("field-note");
  });

  test("a field with no usable label gets no id", () => {
    expect(fieldTestID(undefined)).toBeUndefined();
    expect(fieldTestID("")).toBeUndefined();
    expect(fieldTestID("(optional)")).toBeUndefined();
    expect(fieldTestID("—")).toBeUndefined();
  });
});
