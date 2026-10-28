import type { ApiMap } from '../api/valorant';
import type { AgentEl, BoardEl, Point } from '../types';
import { boardToMeters, calloutLabel, worldToBoard } from './geo';
import { findRoute, pathLength, routeOptions, type NavGrid, type RouteOption } from './navgrid';

/** Below this many board units an agent hasn't really moved between steps. */
export const MIN_MOVE = 4;
/** Running with a rifle out, in meters per second. */
export const RUN_SPEED = 5.4;

const routeCache = new WeakMap<NavGrid, Map<string, Point[]>>();
const optionCache = new WeakMap<NavGrid, Map<string, RouteOption[]>>();

const r1 = (v: number) => Math.round(v);
const keyOf = (a: Point, b: Point, via: Point[] = []) => [a, ...via, b].map((p) => `${r1(p.x)},${r1(p.y)}`).join(';');

function cached<T>(store: WeakMap<NavGrid, Map<string, T>>, nav: NavGrid, key: string, make: () => T): T {
  let m = store.get(nav);
  if (!m) store.set(nav, (m = new Map()));
  let v = m.get(key);
  if (v === undefined) {
    if (m.size > 300) m.clear();
    v = make();
    m.set(key, v);
  }
  return v;
}

/** The walking path between two spots, around walls and through any waypoints. */
export function walkRoute(nav: NavGrid | null, from: Point, to: Point, via: Point[] = []): Point[] {
  if (!nav) return [from, ...via, to];
  return cached(routeCache, nav, keyOf(from, to, via), () => findRoute(nav, from, to, via));
}

export function walkOptions(nav: NavGrid | null, from: Point, to: Point): RouteOption[] {
  if (!nav) return [];
  return cached(optionCache, nav, keyOf(from, to), () => routeOptions(nav, from, to, 3));
}

export function hasMoved(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y) >= MIN_MOVE;
}

/** The agent with the same id in the previous step, if it moved from there to here. */
export function previousSpot(prevElements: BoardEl[] | undefined, el: AgentEl): AgentEl | null {
  const prev = prevElements?.find((e) => e.id === el.id);
  return prev?.kind === 'agent' && hasMoved(prev, el) ? prev : null;
}

export function sameVia(a: Point[] | undefined, b: Point[] | undefined) {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((p, i) => Math.hypot(p.x - y[i].x, p.y - y[i].y) < 2);
}

/** "via Mid Courtyard → B Main": the callouts a route passes, minus where it starts and ends. */
export function routeCallouts(map: ApiMap | undefined, points: Point[]): string[] {
  if (!map?.callouts.length || points.length < 2) return [];
  const spots = map.callouts.map((c) => ({ label: calloutLabel(c.superRegionName, c.regionName), ...worldToBoard(map, c.location.x, c.location.y) }));
  const nearest = (p: Point) => {
    let best = spots[0];
    let bestD = Infinity;
    for (const s of spots) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best.label;
  };
  const total = pathLength(points);
  const labels: string[] = [];
  const samples = Math.max(8, Math.ceil(total / 12));
  for (let k = 0; k <= samples; k++) {
    const label = nearest(pointOn(points, (total * k) / samples));
    if (labels[labels.length - 1] !== label) labels.push(label);
  }
  const start = labels[0];
  const end = labels[labels.length - 1];
  return labels.slice(1, -1).filter((l) => l !== start && l !== end);
}

function pointOn(points: Point[], dist: number): Point {
  let left = dist;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= seg) return { x: a.x + ((b.x - a.x) * left) / (seg || 1), y: a.y + ((b.y - a.y) * left) / (seg || 1) };
    left -= seg;
  }
  return points[points.length - 1];
}

export function routeStats(map: ApiMap | undefined, points: Point[]) {
  const meters = boardToMeters(map, pathLength(points));
  return { meters, seconds: meters / RUN_SPEED };
}
