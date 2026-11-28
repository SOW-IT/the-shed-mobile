import { describe, expect, test } from "vitest";
import { runScreens } from "./verifyPhase.mjs";

// Records what ran, and whether the simulator lock was held at the time.
const harness = ({ iosThrows = false } = {}) => {
  let held = false;
  const events = [];
  return {
    events,
    phase: {
      web: async () => events.push(`web locked=${held}`),
      ios: async () => {
        events.push(`ios locked=${held}`);
        if (iosThrows) throw new Error("maestro failed");
      },
      lockSimulator: async () => {
        held = true;
        events.push("lock");
      },
      unlockSimulator: () => {
        held = false;
        events.push("unlock");
      },
    },
  };
};

describe("runScreens", () => {
  test("web runs without the simulator lock; iOS runs inside it", async () => {
    const { events, phase } = harness();
    await runScreens(phase);
    expect(events).toEqual(["web locked=false", "lock", "ios locked=true", "unlock"]);
  });

  test("a web-only phase never takes the simulator lock", async () => {
    const { events, phase } = harness();
    await runScreens({ ...phase, ios: false });
    expect(events).toEqual(["web locked=false"]);
  });

  test("an iOS-only phase still takes it", async () => {
    const { events, phase } = harness();
    await runScreens({ ...phase, web: false });
    expect(events).toEqual(["lock", "ios locked=true", "unlock"]);
  });

  test("the lock is given back when iOS fails", async () => {
    const { events, phase } = harness({ iosThrows: true });
    await expect(runScreens(phase)).rejects.toThrow("maestro failed");
    expect(events.at(-1)).toBe("unlock");
  });
});
