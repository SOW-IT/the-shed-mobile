import { describe, expect, test } from "vitest";
import { isAllowedDeepLink } from "./deepLinks";

describe("push deep links", () => {
  test("the church reminder and Churches page open from a push", () => {
    expect(isAllowedDeepLink("/profile")).toBe(true);
    expect(isAllowedDeepLink("/churches?church=abc")).toBe(true);
    expect(isAllowedDeepLink("/profiles")).toBe(false);
    expect(isAllowedDeepLink("https://evil.example/profile")).toBe(false);
  });

  test("grievance updates open the grievance, and the handover reminder opens the team's list", () => {
    expect(isAllowedDeepLink("/grievances/v572nqkhj7vrfvjgcj3cppawx58jfe2q")).toBe(true);
    expect(isAllowedDeepLink("/grievances?tab=submitted")).toBe(true);
    expect(isAllowedDeepLink("/grievancesx")).toBe(false);
  });

  test("a poke opens the Garden, and a game's push opens the game", () => {
    expect(isAllowedDeepLink("/world")).toBe(true);
    expect(isAllowedDeepLink("/world?reopen=x")).toBe(true);
    expect(isAllowedDeepLink("/games/runner")).toBe(true);
    expect(isAllowedDeepLink("/worlds")).toBe(false);
    expect(isAllowedDeepLink("/gamesx")).toBe(false);
  });

  test("devotional group invites and reminders open devotionals", () => {
    expect(isAllowedDeepLink("/devotionals")).toBe(true);
    expect(isAllowedDeepLink("/devotionals/2026-11-25")).toBe(true);
    expect(isAllowedDeepLink("/devotionals/groups/abc123")).toBe(true);
    expect(isAllowedDeepLink("/devotionalsx")).toBe(false);
  });
});
