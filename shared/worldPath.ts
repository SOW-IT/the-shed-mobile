import {
  clampTarget,
  halfWidthAt,
  PLACE_OBSTACLES,
  WALK_BOUNDS,
  type Obstacle,
  type Place,
  type Waypoint,
} from "./world";

const CELL = 0.4;
const PLAYER_PAD = 0.16;
const SEGMENT_STEP = 0.14;
export const MAX_PATH_WAYPOINTS = 24;

const COLS = Math.floor((WALK_BOUNDS.maxX - WALK_BOUNDS.minX) / CELL) + 1;
const ROWS = Math.floor((WALK_BOUNDS.maxZ - WALK_BOUNDS.minZ) / CELL) + 1;

const cellX = (col: number) => WALK_BOUNDS.minX + col * CELL;
const cellZ = (row: number) => WALK_BOUNDS.minZ + row * CELL;
const cellIndex = (col: number, row: number) => row * COLS + col;

const insideBounds = (x: number, z: number) =>
  z >= WALK_BOUNDS.minZ && z <= WALK_BOUNDS.maxZ && Math.abs(x) <= halfWidthAt(z);

const insideEllipse = (o: Obstacle, x: number, z: number, pad: number) =>
  Math.hypot((x - o.x) / (o.rx + pad), (z - o.z) / (o.rz + pad)) < 1;

const isBlocked = (x: number, z: number, obstacles: readonly Obstacle[], pad: number) =>
  !insideBounds(x, z) || obstacles.some((o) => insideEllipse(o, x, z, pad));

const segmentClear = (a: Waypoint, b: Waypoint, obstacles: readonly Obstacle[], pad: number): boolean => {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return true;
  const steps = Math.max(2, Math.ceil(dist / SEGMENT_STEP));
  for (let i = 1; i < steps; i++) {
    const k = i / steps;
    if (isBlocked(a.x + dx * k, a.z + dz * k, obstacles, pad)) return false;
  }
  return true;
};

const nearestWalkableCell = (
  target: Waypoint,
  walkable: Uint8Array
): { col: number; row: number } | null => {
  const baseCol = Math.max(0, Math.min(COLS - 1, Math.round((target.x - WALK_BOUNDS.minX) / CELL)));
  const baseRow = Math.max(0, Math.min(ROWS - 1, Math.round((target.z - WALK_BOUNDS.minZ) / CELL)));
  if (walkable[cellIndex(baseCol, baseRow)] === 1) return { col: baseCol, row: baseRow };
  let best: { col: number; row: number } | null = null;
  let bestDist = Infinity;
  for (let row = 0; row < ROWS; row++) {
    const dz = cellZ(row) - target.z;
    for (let col = 0; col < COLS; col++) {
      if (walkable[cellIndex(col, row)] !== 1) continue;
      const d = Math.hypot(cellX(col) - target.x, dz);
      if (d < bestDist) {
        bestDist = d;
        best = { col, row };
      }
    }
  }
  return best;
};

const DIRS: readonly [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

const simplify = (
  points: readonly Waypoint[],
  obstacles: readonly Obstacle[],
  pad: number
): Waypoint[] => {
  if (points.length <= 2) return [...points];
  const out: Waypoint[] = [points[0]];
  let i = 0;
  while (i < points.length - 1) {
    let next = i + 1;
    for (let j = points.length - 1; j > i + 1; j--) {
      if (segmentClear(points[i], points[j], obstacles, pad)) {
        next = j;
        break;
      }
    }
    out.push(points[next]);
    i = next;
  }
  return out;
};

const roundCoord = (n: number) => Math.round(n * 1000) / 1000;

export const findPath = (
  place: Place,
  from: Waypoint,
  to: Waypoint,
  extra: readonly Obstacle[] = [],
  { allowGoalInside = false }: { allowGoalInside?: boolean } = {}
): Waypoint[] => {
  if (Math.hypot(to.x - from.x, to.z - from.z) < 0.05) return [];
  const all = extra.length > 0 ? [...PLACE_OBSTACLES[place], ...extra] : PLACE_OBSTACLES[place];
  if (all.length === 0) return [];

  const obstacles = all.filter((o) => {
    if (insideEllipse(o, from.x, from.z, 0.01)) return false;
    if (allowGoalInside && insideEllipse(o, to.x, to.z, 0.01)) return false;
    return true;
  });

  if (segmentClear(from, to, obstacles, PLAYER_PAD)) return [];

  const total = COLS * ROWS;
  const walkable = new Uint8Array(total);
  for (let row = 0; row < ROWS; row++) {
    const z = cellZ(row);
    for (let col = 0; col < COLS; col++) {
      const x = cellX(col);
      if (!isBlocked(x, z, obstacles, PLAYER_PAD)) walkable[cellIndex(col, row)] = 1;
    }
  }

  const startCell = nearestWalkableCell(from, walkable);
  const goalCell = nearestWalkableCell(to, walkable);
  if (!startCell || !goalCell) return [];

  const startIdx = cellIndex(startCell.col, startCell.row);
  const goalIdx = cellIndex(goalCell.col, goalCell.row);
  if (startIdx === goalIdx) return [];

  const gScore = new Float64Array(total);
  gScore.fill(Infinity);
  const parent = new Int32Array(total);
  parent.fill(-1);
  const closed = new Uint8Array(total);

  const heapNodes: number[] = [startIdx];
  const heapF: number[] = [Math.hypot(goalCell.col - startCell.col, goalCell.row - startCell.row)];
  gScore[startIdx] = 0;

  const pushHeap = (node: number, f: number) => {
    let idx = heapNodes.length;
    heapNodes.push(node);
    heapF.push(f);
    while (idx > 0) {
      const p = (idx - 1) >> 1;
      if (heapF[p] <= heapF[idx]) break;
      [heapNodes[p], heapNodes[idx]] = [heapNodes[idx], heapNodes[p]];
      [heapF[p], heapF[idx]] = [heapF[idx], heapF[p]];
      idx = p;
    }
  };

  const popHeap = (): number => {
    const top = heapNodes[0];
    const lastNode = heapNodes.pop()!;
    const lastF = heapF.pop()!;
    if (heapNodes.length > 0) {
      heapNodes[0] = lastNode;
      heapF[0] = lastF;
      let idx = 0;
      const len = heapNodes.length;
      while (true) {
        const left = idx * 2 + 1;
        const right = left + 1;
        let smallest = idx;
        if (left < len && heapF[left] < heapF[smallest]) smallest = left;
        if (right < len && heapF[right] < heapF[smallest]) smallest = right;
        if (smallest === idx) break;
        [heapNodes[smallest], heapNodes[idx]] = [heapNodes[idx], heapNodes[smallest]];
        [heapF[smallest], heapF[idx]] = [heapF[idx], heapF[smallest]];
        idx = smallest;
      }
    }
    return top;
  };

  let found = false;
  while (heapNodes.length > 0) {
    const cur = popHeap();
    if (closed[cur] === 1) continue;
    closed[cur] = 1;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    const curRow = Math.floor(cur / COLS);
    const curCol = cur - curRow * COLS;
    const curG = gScore[cur];

    for (const [dc, dr, cost] of DIRS) {
      const nc = curCol + dc;
      const nr = curRow + dr;
      if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
      const next = cellIndex(nc, nr);
      if (closed[next] === 1 || walkable[next] !== 1) continue;
      if (dc !== 0 && dr !== 0) {
        if (walkable[cellIndex(curCol + dc, curRow)] !== 1 || walkable[cellIndex(curCol, curRow + dr)] !== 1) continue;
      }
      const tentativeG = curG + cost;
      if (tentativeG < gScore[next]) {
        gScore[next] = tentativeG;
        parent[next] = cur;
        const h = Math.hypot(goalCell.col - nc, goalCell.row - nr);
        pushHeap(next, tentativeG + h);
      }
    }
  }

  if (!found) return [];

  const gridPoints: Waypoint[] = [];
  let trace = goalIdx;
  while (trace !== -1) {
    const row = Math.floor(trace / COLS);
    const col = trace - row * COLS;
    gridPoints.push({ x: cellX(col), z: cellZ(row) });
    trace = parent[trace];
  }
  gridPoints.reverse();

  const full: Waypoint[] = [from, ...gridPoints, to];
  const smoothed = simplify(full, obstacles, PLAYER_PAD);
  const intermediates = smoothed.slice(1, -1).map((pt) => ({ x: roundCoord(pt.x), z: roundCoord(pt.z) }));
  return intermediates.slice(0, MAX_PATH_WAYPOINTS);
};

export const sanitizePath = (
  path: readonly Waypoint[] | undefined,
  place: Place,
  extra: readonly Obstacle[] = []
): Waypoint[] | undefined => {
  if (!path || path.length === 0) return undefined;
  const clean: Waypoint[] = [];
  for (const pt of path.slice(0, MAX_PATH_WAYPOINTS)) {
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.z)) continue;
    clean.push(clampTarget(pt.x, pt.z, place, extra));
  }
  return clean.length > 0 ? clean : undefined;
};
