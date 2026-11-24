import { describe, expect, test } from "vitest";
import { posAt, WALK_SPEED, type Walk } from "../../shared/world";
import { drawnPose, restingGait } from "./gait";
import { followWalks, glidePoses, type Tracks } from "./useGlide";

const east: Walk = { fromX: 0, fromZ: 0, toX: WALK_SPEED * 2, toZ: 0, startedAt: 1000 };
const none: Tracks = new Map();

describe("followWalks", () => {
  test("someone seen for the first time is drawn on their walk with no glide", () => {
    const people = [{ memberId: "b", me: false, walk: east }];
    const tracks = followWalks(none, people, 1500);
    expect(tracks.get("b")?.offset).toBeUndefined();
    expect(glidePoses(tracks, people, 1500)).toEqual([drawnPose(east, restingGait(east), 1500)]);
  });

  test("nothing changes while the same walks stay current", () => {
    const people = [{ memberId: "b", me: false, walk: east }];
    const tracks = followWalks(none, people, 1500);
    expect(followWalks(tracks, people, 1600)).toBe(tracks);
  });

  test("a new walk a little off from where they were drawn glides there instead of jumping", () => {
    const tracks = followWalks(none, [{ memberId: "b", me: false, walk: east }], 1000);
    const was = posAt(east, 2000);
    const turn: Walk = { fromX: was.x + 0.5, fromZ: 0, toX: was.x + 0.5, toZ: 2, startedAt: 2000 };
    const people = [{ memberId: "b", me: false, walk: turn }];
    const next = followWalks(tracks, people, 2000);
    expect(next.get("b")?.offset).toEqual({ dx: -0.5, dz: 0, at: 2000 });
    const [atStart] = glidePoses(next, people, 2000);
    expect(atStart?.x).toBeCloseTo(was.x);
    expect(atStart?.walking).toBe(true);
    const [later] = glidePoses(next, people, 4000);
    expect(later?.x).toBeCloseTo(turn.toX);
  });

  test("a far jump snaps instead of gliding", () => {
    const tracks = followWalks(none, [{ memberId: "b", me: false, walk: east }], 1000);
    const far: Walk = { fromX: 40, fromZ: 40, toX: 40, toZ: 40, startedAt: 2000 };
    expect(followWalks(tracks, [{ memberId: "b", me: false, walk: far }], 2000).get("b")?.offset).toBeUndefined();
  });

  test("your own walk is drawn as it is and never tracked", () => {
    const people = [{ memberId: "a", me: true, walk: east }];
    expect(followWalks(none, people, 1500)).toBe(none);
    expect(glidePoses(none, people, 1500)).toEqual([drawnPose(east, restingGait(east), 1500)]);
  });

  test("someone without a walk keeps their track and is not drawn", () => {
    const tracks = followWalks(none, [{ memberId: "b", me: false, walk: east }], 1000);
    const people = [{ memberId: "b", me: false, walk: null }];
    expect(followWalks(tracks, people, 2000)).toBe(tracks);
    expect(glidePoses(tracks, people, 2000)).toEqual([null]);
  });

  test("people who left are forgotten, so a rejoin starts fresh", () => {
    const tracks = followWalks(
      none,
      [
        { memberId: "b", me: false, walk: east },
        { memberId: "c", me: false, walk: east },
      ],
      1000
    );
    const left = followWalks(tracks, [{ memberId: "c", me: false, walk: east }], 2000);
    expect([...left.keys()]).toEqual(["c"]);
  });

  test("someone not yet followed is drawn resting on their walk", () => {
    expect(glidePoses(none, [{ memberId: "b", me: false, walk: east }], 1500)).toEqual([
      drawnPose(east, restingGait(east), 1500),
    ]);
  });
});
