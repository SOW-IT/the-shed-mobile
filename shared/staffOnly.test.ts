import { describe, expect, it } from "vitest";
import { staffOnlyMessage } from "./staffOnly";

describe("staffOnlyMessage", () => {
  it("tells a campus leader the requests are for staff", () => {
    expect(
      staffOnlyMessage("Event", { email: "lee@sow.org.au", year: 2027, profile: {}, isCampusLeader: true })
    ).toBe("Event requests are for SOW staff, not campus leaders.");
  });

  it("tells a SOW address with no profile that it has no role yet", () => {
    expect(staffOnlyMessage("Design", { email: "new@sow.org.au", year: 2027, profile: null })).toBe(
      "Design requests are for SOW staff. No role or department is assigned to new@sow.org.au for 2027 yet."
    );
  });

  it("asks a personal account to use a SOW account instead of promising a role", () => {
    expect(staffOnlyMessage("Event", { email: "john@icloud.com", year: 2027, profile: null })).toBe(
      "Event requests are for SOW staff. Sign in with your SOW Google account to make one."
    );
  });
});
