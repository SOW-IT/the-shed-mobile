type Ramp = { readonly first: number; readonly perWorld: number; readonly limit: number };

export const ramp = (setting: Ramp, steps: number): number => {
  const value = setting.first + setting.perWorld * Math.max(0, steps);
  return setting.perWorld < 0 ? Math.max(setting.limit, value) : Math.min(setting.limit, value);
};

export const GLIDER_V2 = {
  hardestWorld: 10,
  day: { firstSeconds: 26, logFall: 3.64, floorSeconds: 18 },
  pace: { first: 925, perWorld: -50, limit: 480 },
  span: { first: 600, perWorld: -40, limit: 160 },
  drop: { first: 180, perWorld: 34, limit: 520 },
  squeeze: { first: 0, perWorld: 0.045, limit: 0.45 },
  bumpiness: { first: 0.1, perWorld: 0.035, limit: 0.5 },
  perfectLandingDegrees: { first: 30, perWorld: -2.5, limit: 5 },
  steepest: { first: 1.3, perWorld: 0.1, limit: 2.2 },
  oddShapeShare: { first: 0, perWorld: 0.08, limit: 0.97 },
  backToBackShare: { first: 0, perWorld: 0.04, limit: 0.6 },
  landingZone: { first: 1, perWorld: -0.1, limit: 0.1 },
  shapeUnlockWorld: { ramp: 2, plateau: 2, double: 2, cliff: 3, uneven: 3, gorge: 4, jagged: 5, drop: 6, wall: 7 },
  easyShapeWeight: { first: 1, perWorld: -0.15, limit: 0.05 },
  hardShapeWeight: { first: 0.5, perWorld: 0.25, limit: Infinity },
  deepValley: { first: 1.3, perWorld: 0.08, limit: Infinity },
  wallHeight: { first: 1.15, perWorld: 0.04, limit: Infinity },
  jaggedSteps: { first: 2, perWorld: 1 / 3, limit: Infinity },
  jaggedDip: { first: 25, perWorld: 8, limit: Infinity },
  doubleDip: { first: 60, perWorld: 7.2, limit: Infinity },
  doubleDipShare: { first: 0.3, perWorld: 0.04, limit: 0.7 },
  sharpestBend: 0.075,
} as const satisfies Record<string, unknown>;
