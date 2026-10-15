import { describe, expect, test } from "vitest";
import { isAllowedDeepLink } from "./deepLinks";

describe("push deep links", () => {
  test("the church reminder and Churches page open from a push", () => {
    expect(isAllowedDeepLink("/profile")).toBe(true);
    expect(isAllowedDeepLink("/churches?church=abc")).toBe(true);
    expect(isAllowedDeepLink("/profiles")).toBe(false);
    expect(isAllowedDeepLink("https://evil.example/profile")).toBe(false);
  });
});
