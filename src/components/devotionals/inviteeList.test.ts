import { describe, expect, it } from "vitest";
import { inviteeList } from "./inviteeList";

describe("inviteeList", () => {
  it("names one or two people in full", () => {
    expect(inviteeList(["Ben Carter"])).toBe("Ben Carter");
    expect(inviteeList(["Ben Carter", "Chloe Wright"])).toBe("Ben Carter and Chloe Wright");
  });

  it("counts everyone after the first two", () => {
    expect(inviteeList(["Ben", "Chloe", "Daniel"])).toBe("Ben, Chloe and 1 other");
    expect(inviteeList(["Ben", "Chloe", "Daniel", "Ella"])).toBe("Ben, Chloe and 2 others");
  });
});
