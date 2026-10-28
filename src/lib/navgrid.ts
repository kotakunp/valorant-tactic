/**
 * Walkability, cover and routing derived from a minimap image.
 *
 * Valorant minimaps draw floor as opaque grey, walls and out-of-bounds as transparent, and
 * boxes, railings and half walls as light outlines inside the floor. Those outlines (and the
 * small areas they enclose) are treated as cover: they block sight and are walked around.
 *
 * Kept free of app imports so it can run (and be tested) outside the browser.
 */

/** Board size in board units; mirrors geo.BOARD. */
const BOARD = 1000;

export interface Point {
  x: number;
  y: number;
}

export interface MapMasks {
  size: number;
  /** 1 = floor (anything a player can stand on). */
  open: Uint8Array;
  /** 1 = cover: box outlines, half walls, railings and the box tops they enclose. */
  cover: Uint8Array;
}

/** Light pixels inside the floor are the minimap's outline strokes. */
const OUTLINE_LUMA = 172;
/** Outlines this close to a wall edge are just that edge being drawn, not free-standing cover. */
const EDGE_MARGIN = 3;
/** Enclosed floor regions smaller than this many pixels (at 1024²) are box tops, not rooms. */
const BOX_MAX_AREA = 1400;

export function masksFromRgba(rgba: Uint8ClampedArray | Uint8Array, size: number): MapMasks {
  const n = size * size;
  const open = new Uint8Array(n);
  const light = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (rgba[o + 3] < 128) continue;
    open[i] = 1;
    if ((rgba[o] + rgba[o + 1] + rgba[o + 2]) / 3 >= OUTLINE_LUMA) light[i] = 1;
  }

  const nearVoid = dilate(invert(open), size, EDGE_MARGIN);
  const cover = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (light[i] && !nearVoid[i]) cover[i] = 1;

  // Box tops: small floor regions fully enclosed by outline strokes.
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (!open[start] || light[start] || label[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = start;
    let touchesVoid = false;
    while (head < tail) {
      const i = queue[head++];
      const x = i % size;
      const y = (i - x) / size;
      for (let k = 0; k < 4; k++) {
        const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
          touchesVoid = true;
          continue;
        }
        const j = ny * size + nx;
        if (!open[j]) touchesVoid = true;
        if (!open[j] || light[j] || label[j] !== -1) continue;
        label[j] = start;
        queue[tail++] = j;
      }
    }
    if (tail <= BOX_MAX_AREA && !touchesVoid) for (let q = 0; q < tail; q++) cover[queue[q]] = 1;
  }
  return { size, open, cover };
}

function invert(a: Uint8Array) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] ? 0 : 1;
  return out;
}

/** Square dilation by r pixels, done as two separable passes. */
function dilate(a: Uint8Array, size: number, r: number) {
  const tmp = new Uint8Array(a.length);
  for (let y = 0; y < size; y++) {
    let last = -1e9;
    for (let x = 0; x < size; x++) {
      if (a[y * size + x]) last = x;
      if (x - last <= r) tmp[y * size + x] = 1;
    }
    last = 1e9;
    for (let x = size - 1; x >= 0; x--) {
      if (a[y * size + x]) last = x;
      if (last - x <= r) tmp[y * size + x] = 1;
    }
  }
  const out = new Uint8Array(a.length);
  for (let x = 0; x < size; x++) {
    let last = -1e9;
    for (let y = 0; y < size; y++) {
      if (tmp[y * size + x]) last = y;
      if (y - last <= r) out[y * size + x] = 1;
    }
    last = 1e9;
    for (let y = size - 1; y >= 0; y--) {
      if (tmp[y * size + x]) last = y;
      if (last - y <= r) out[y * size + x] = 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- navigation

export interface NavGrid {
  size: number;
  /** 0 = blocked, 1 = floor, 2 = cover (walkable at a high cost, e.g. jumping a box). */
  cell: Uint8Array;
  /** Chebyshev-ish distance to the nearest blocked cell, in cells, capped at 255. */
  clear: Uint8Array;
}

const NAV_SIZE = 512;

export function buildNavGrid(masks: MapMasks): NavGrid {
  const size = NAV_SIZE;
  const f = masks.size / size;
  const cell = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let open = 0;
      let cover = 0;
      for (let dy = 0; dy < f; dy++) {
        for (let dx = 0; dx < f; dx++) {
          const i = (y * f + dy) * masks.size + x * f + dx;
          open += masks.open[i];
          cover += masks.cover[i];
        }
      }
      // Half the pixels open keeps one-pixel gaps in thin walls from becoming doorways.
      if (open * 2 >= f * f) cell[y * size + x] = cover ? 2 : 1;
    }
  }
  return { size, cell, clear: chamfer(cell, size) };
}

function chamfer(cell: Uint8Array, size: number) {
  const d = new Uint16Array(size * size);
  const INF = 60000;
  for (let i = 0; i < d.length; i++) d[i] = cell[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : d[y * size + x]);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
    }
  for (let y = size - 1; y >= 0; y--)
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);
    }
  const out = new Uint8Array(size * size);
  for (let i = 0; i < d.length; i++) out[i] = Math.min(255, Math.round(d[i] / 3));
  return out;
}

const toCell = (g: NavGrid, v: number) => Math.max(0, Math.min(g.size - 1, Math.floor((v / BOARD) * g.size)));
const toBoard = (g: NavGrid, c: number) => ((c + 0.5) / g.size) * BOARD;

function walkable(g: NavGrid, i: number) {
  return g.cell[i] !== 0;
}

/** Nearest floor spot to p with at least `minClear` cells of room, searching outward. */
export function nearestWalkable(g: NavGrid, p: Point, minClear = 2): Point | null {
  const cx = toCell(g, p.x);
  const cy = toCell(g, p.y);
  const ok = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= g.size || y >= g.size) return false;
    const i = y * g.size + x;
    // Box tops count: players stand on them.
    return g.cell[i] !== 0 && g.clear[i] >= minClear;
  };
  if (ok(cx, cy)) return p;
  for (let r = 1; r < g.size; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!ok(cx + dx, cy + dy)) continue;
        const d = dx * dx + dy * dy;
        if (!best || d < best.d) best = { x: cx + dx, y: cy + dy, d };
      }
    }
    if (best) return { x: toBoard(g, best.x), y: toBoard(g, best.y) };
  }
  return null;
}

export function isWalkable(g: NavGrid, p: Point) {
  return walkable(g, toCell(g, p.y) * g.size + toCell(g, p.x));
}

class Heap {
  private items: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.items.length;
  }
  push(item: number, key: number) {
    const a = this.items;
    const k = this.keys;
    let i = a.length;
    a.push(item);
    k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      a[i] = a[p];
      k[i] = k[p];
      i = p;
    }
    a[i] = item;
    k[i] = key;
  }
  pop(): number {
    const a = this.items;
    const k = this.keys;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastKey = k.pop()!;
    if (a.length) {
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastKey) break;
        a[i] = a[c];
        k[i] = k[c];
        i = c;
      }
      a[i] = lastItem;
      k[i] = lastKey;
    }
    return top;
  }
}

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;

/** Extra cost multiplier near walls, so routes run down the middle of corridors. */
function wallCost(clear: number) {
  return clear >= 6 ? 1 : 1 + (6 - clear) * 0.35;
}

/** Cell path from a to b, or null when b can't be reached. `penalty` multiplies costs per cell. */
function astar(g: NavGrid, a: Point, b: Point, penalty?: Float32Array): number[] | null {
  const size = g.size;
  const sa = nearestWalkable(g, a, 1);
  const sb = nearestWalkable(g, b, 1);
  if (!sa || !sb) return null;
  const start = toCell(g, sa.y) * size + toCell(g, sa.x);
  const goal = toCell(g, sb.y) * size + toCell(g, sb.x);
  const gx = goal % size;
  const gy = (goal - gx) / size;
  const cost = new Float32Array(size * size).fill(Infinity);
  const from = new Int32Array(size * size).fill(-1);
  const closed = new Uint8Array(size * size);
  const heap = new Heap();
  cost[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const i = heap.pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;
    const x = i % size;
    const y = (i - x) / size;
    for (const [dx, dy, len] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const j = ny * size + nx;
      if (closed[j] || !walkable(g, j)) continue;
      // No squeezing diagonally between two blocked corners.
      if (dx && dy && (!walkable(g, y * size + nx) || !walkable(g, ny * size + x))) continue;
      const c = len * wallCost(g.clear[j]) * (g.cell[j] === 2 ? 8 : 1) * (penalty ? penalty[j] : 1);
      const next = cost[i] + c;
      if (next >= cost[j]) continue;
      cost[j] = next;
      from[j] = i;
      const hx = Math.abs(nx - gx);
      const hy = Math.abs(ny - gy);
      heap.push(j, next + Math.max(hx, hy) + (SQRT2 - 1) * Math.min(hx, hy));
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = from[c]) cells.push(c);
  return cells.reverse();
}

/** True when the straight segment stays on open floor with some room either side. */
function lineClear(g: NavGrid, a: number, b: number, minClear: number) {
  const size = g.size;
  let x0 = a % size;
  let y0 = (a - x0) / size;
  const x1 = b % size;
  const y1 = (b - x1) / size;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    const i = y0 * size + x0;
    if (g.cell[i] !== 1 || g.clear[i] < minClear) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Drops cells that a straight line can skip, keeping a little distance from walls. */
function smooth(g: NavGrid, cells: number[]): number[] {
  if (cells.length <= 2) return cells;
  const out = [cells[0]];
  let anchor = 0;
  while (anchor < cells.length - 1) {
    let next = anchor + 1;
    // Look ahead in growing strides, then back off; full scans would be quadratic on long paths.
    for (let j = cells.length - 1; j > next; j--) {
      const room = Math.min(2, g.clear[cells[anchor]], g.clear[cells[j]]);
      if (lineClear(g, cells[anchor], cells[j], room)) {
        next = j;
        break;
      }
      if (j - next > 60) j = Math.max(next + 1, j - 20);
    }
    out.push(cells[next]);
    anchor = next;
  }
  return out;
}

function cellsToPoints(g: NavGrid, cells: number[]): Point[] {
  return cells.map((c) => {
    const x = c % g.size;
    return { x: toBoard(g, x), y: toBoard(g, (c - x) / g.size) };
  });
}

export function pathLength(points: Point[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  return d;
}

/** Walking route from a to b through each via point in order. Falls back to a straight line. */
export function findRoute(g: NavGrid, a: Point, b: Point, via: Point[] = []): Point[] {
  const stops = [a, ...via, b];
  const out: Point[] = [a];
  for (let i = 0; i < stops.length - 1; i++) {
    const cells = astar(g, stops[i], stops[i + 1]);
    if (!cells) {
      out.push(stops[i + 1]);
      continue;
    }
    const pts = cellsToPoints(g, smooth(g, cells));
    // Keep the exact endpoints rather than their cell centres.
    out.push(...pts.slice(1, -1), stops[i + 1]);
  }
  return out;
}

export interface RouteOption {
  /** Single waypoint that reproduces this route; empty for the shortest one. */
  via: Point[];
  points: Point[];
  length: number;
}

/**
 * The shortest route plus up to `count - 1` clearly different ones, found by making cells
 * near earlier routes expensive and searching again.
 */
export function routeOptions(g: NavGrid, a: Point, b: Point, count = 3): RouteOption[] {
  const base = astar(g, a, b);
  if (!base) return [];
  const basePts = findRoute(g, a, b);
  const options: RouteOption[] = [{ via: [], points: basePts, length: pathLength(basePts) }];
  const penalty = new Float32Array(g.size * g.size).fill(1);
  const used: number[][] = [base];
  const radius = 14;
  for (let attempt = 0; attempt < count + 2 && options.length < count; attempt++) {
    for (const cells of used) stamp(g, penalty, cells, radius, 12);
    const alt = astar(g, a, b, penalty);
    if (!alt) break;
    used.push(alt);
    // The waypoint is the cell of the new route farthest from every route so far.
    const pivot = farthestCell(g, alt, used.slice(0, -1));
    if (pivot.dist < radius * 0.8) continue;
    const via = [cellsToPoints(g, [pivot.cell])[0]];
    const points = findRoute(g, a, b, via);
    const length = pathLength(points);
    if (length > options[0].length * 2.6) continue;
    if (options.some((o) => routeDistance(o.points, points) < (radius * BOARD) / g.size)) continue;
    options.push({ via, points, length });
  }
  return options;
}

function stamp(g: NavGrid, penalty: Float32Array, cells: number[], radius: number, factor: number) {
  const size = g.size;
  for (let k = 0; k < cells.length; k += 2) {
    const c = cells[k];
    const cx = c % size;
    const cy = (c - cx) / size;
    for (let dy = -radius; dy <= radius; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= size) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        if (x < 0 || x >= size || dx * dx + dy * dy > radius * radius) continue;
        penalty[y * size + x] = factor;
      }
    }
  }
}

function farthestCell(g: NavGrid, cells: number[], others: number[][]) {
  const size = g.size;
  let best = { cell: cells[Math.floor(cells.length / 2)], dist: 0 };
  for (let k = 0; k < cells.length; k += 3) {
    const c = cells[k];
    const x = c % size;
    const y = (c - x) / size;
    let nearest = Infinity;
    for (const route of others) {
      for (let m = 0; m < route.length; m += 3) {
        const o = route[m];
        const ox = o % size;
        const d = Math.hypot(ox - x, (o - ox) / size - y);
        if (d < nearest) nearest = d;
      }
    }
    if (nearest > best.dist) best = { cell: c, dist: nearest };
  }
  return best;
}

/** Mean distance from points of b to the polyline a, in board units. */
function routeDistance(a: Point[], b: Point[]) {
  const samples = resample(b, 24);
  let sum = 0;
  for (const p of samples) sum += distToPolyline(p, a);
  return sum / samples.length;
}

export function resample(points: Point[], n: number): Point[] {
  const total = pathLength(points);
  if (points.length < 2 || total === 0) return points.slice();
  const out: Point[] = [];
  for (let k = 0; k < n; k++) out.push(pointAlong(points, (total * k) / (n - 1)));
  return out;
}

/** The point `dist` board units along a polyline, plus the heading there in degrees. */
export function pointAlong(points: Point[], dist: number): Point & { heading: number } {
  let left = Math.max(0, dist);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    const heading = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (left <= seg || i === points.length - 1) {
      const t = seg ? Math.min(1, left / seg) : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading };
    }
    left -= seg;
  }
  const last = points[points.length - 1];
  return { x: last.x, y: last.y, heading: 0 };
}

function distToPolyline(p: Point, line: Point[]) {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len2 = ex * ex + ey * ey;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.y - a.y) * ey) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - (a.x + ex * t), p.y - (a.y + ey * t)));
  }
  return best;
}
