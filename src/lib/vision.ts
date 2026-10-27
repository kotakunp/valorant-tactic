import { useEffect, useState } from 'react';
import type { ApiMap } from '../api/valorant';
import type { AgentEl, BoardEl } from '../types';
import { BOARD, metersToBoard } from './geo';
import { DEFAULT_FOV, DEFAULT_VISION_RANGE, normalizeAngle } from './elements';
import { canvasUrl } from './canvasImage';

/** Walkable mask from the minimap: opaque pixels are floor, transparent pixels are walls or out of bounds. */
export interface Occupancy {
  size: number;
  open: Uint8Array;
}

export type Obstacle =
  | { type: 'circle'; x: number; y: number; r: number }
  | { type: 'segment'; x1: number; y1: number; x2: number; y2: number };

export interface Viewer {
  id: string;
  team: AgentEl['team'];
  x: number;
  y: number;
  facing: number;
  fov: number;
  /** Board units. */
  range: number;
}

export interface Sighting {
  viewerId: string;
  targetId: string;
}

const GRID = 1024;
const pending = new Map<string, Promise<Occupancy>>();
const loaded = new Map<string, Occupancy>();

export function loadOccupancy(url: string): Promise<Occupancy> {
  let p = pending.get(url);
  if (!p) {
    p = new Promise<Occupancy>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = GRID;
        canvas.height = GRID;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return reject(new Error('2D canvas unavailable'));
        ctx.drawImage(img, 0, 0, GRID, GRID);
        const data = ctx.getImageData(0, 0, GRID, GRID).data;
        const open = new Uint8Array(GRID * GRID);
        for (let i = 0; i < open.length; i++) open[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
        const occ = { size: GRID, open };
        loaded.set(url, occ);
        resolve(occ);
      };
      img.onerror = () => reject(new Error(`Could not load minimap ${url}`));
      img.src = canvasUrl(url);
    });
    p.catch(() => pending.delete(url));
    pending.set(url, p);
  }
  return p;
}

export function useOccupancy(url: string | undefined): Occupancy | null {
  const [occ, setOcc] = useState<Occupancy | null>(() => (url ? loaded.get(url) ?? null : null));
  useEffect(() => {
    if (!url) return setOcc(null);
    const ready = loaded.get(url);
    if (ready) return setOcc(ready);
    setOcc(null);
    let alive = true;
    loadOccupancy(url)
      .then((o) => alive && setOcc(o))
      .catch(() => alive && setOcc(null));
    return () => {
      alive = false;
    };
  }, [url]);
  return occ;
}

export function isOpen(occ: Occupancy, x: number, y: number) {
  const s = occ.size / BOARD;
  const gx = Math.floor(x * s);
  const gy = Math.floor(y * s);
  if (gx < 0 || gy < 0 || gx >= occ.size || gy >= occ.size) return false;
  return occ.open[gy * occ.size + gx] === 1;
}

/** Distance along a unit ray to the first obstacle hit, or Infinity. */
function rayHit(ox: number, oy: number, dx: number, dy: number, obs: Obstacle): number {
  if (obs.type === 'circle') {
    const cx = ox - obs.x;
    const cy = oy - obs.y;
    const b = cx * dx + cy * dy;
    const c = cx * cx + cy * cy - obs.r * obs.r;
    const disc = b * b - c;
    if (disc < 0) return Infinity;
    const s = Math.sqrt(disc);
    const t1 = -b - s;
    // From inside a smoke the far edge is where sight ends, so take the first positive root.
    if (t1 > 1e-6) return t1;
    const t2 = -b + s;
    return t2 > 1e-6 ? t2 : Infinity;
  }
  const ex = obs.x2 - obs.x1;
  const ey = obs.y2 - obs.y1;
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-9) return Infinity;
  const wx = obs.x1 - ox;
  const wy = obs.y1 - oy;
  const t = (wx * ey - wy * ex) / denom;
  const u = (wx * dy - wy * dx) / denom;
  return t > 1e-6 && u >= 0 && u <= 1 ? t : Infinity;
}

function obstacleDistance(ox: number, oy: number, dx: number, dy: number, obstacles: Obstacle[]) {
  let best = Infinity;
  for (const o of obstacles) best = Math.min(best, rayHit(ox, oy, dx, dy, o));
  return best;
}

/** First wall hit within maxDist when marching the minimap mask, or maxDist. */
function marchWalls(occ: Occupancy | null, ox: number, oy: number, dx: number, dy: number, maxDist: number) {
  // Agents dropped off the walkable area would see nothing at all; let them see unoccluded instead.
  if (!occ || !isOpen(occ, ox, oy)) return maxDist;
  const step = (BOARD / occ.size) * 0.75;
  for (let t = step; t < maxDist; t += step) {
    if (!isOpen(occ, ox + dx * t, oy + dy * t)) return t;
  }
  return maxDist;
}

/** Visible area as a closed polygon [x0, y0, x1, y1, ...] starting at the viewer. */
export function castVision(occ: Occupancy | null, obstacles: Obstacle[], v: Viewer): number[] {
  const rays = Math.max(16, Math.ceil(v.fov / 0.5));
  const start = ((v.facing - v.fov / 2) * Math.PI) / 180;
  const stepA = ((v.fov * Math.PI) / 180) / rays;
  const pts = [v.x, v.y];
  for (let i = 0; i <= rays; i++) {
    const a = start + stepA * i;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const limit = Math.min(v.range, obstacleDistance(v.x, v.y, dx, dy, obstacles));
    const d = marchWalls(occ, v.x, v.y, dx, dy, limit);
    pts.push(v.x + dx * d, v.y + dy * d);
  }
  return pts;
}

/** Where the crosshair lands: the first wall or vision blocker straight along the facing direction. */
export function castAim(occ: Occupancy | null, obstacles: Obstacle[], v: Viewer, maxDist: number) {
  const a = (v.facing * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const limit = Math.min(maxDist, obstacleDistance(v.x, v.y, dx, dy, obstacles));
  const d = marchWalls(occ, v.x, v.y, dx, dy, limit);
  return { x: v.x + dx * d, y: v.y + dy * d, blocked: d < maxDist - 1e-6 };
}

export function canSee(occ: Occupancy | null, obstacles: Obstacle[], v: Viewer, tx: number, ty: number, useWalls: boolean) {
  const vx = tx - v.x;
  const vy = ty - v.y;
  const dist = Math.hypot(vx, vy);
  if (dist > v.range || dist < 1e-6) return false;
  const angle = (Math.atan2(vy, vx) * 180) / Math.PI;
  if (Math.abs(normalizeAngle(angle - v.facing)) > v.fov / 2) return false;
  const dx = vx / dist;
  const dy = vy / dist;
  if (obstacleDistance(v.x, v.y, dx, dy, obstacles) < dist) return false;
  return !useWalls || marchWalls(occ, v.x, v.y, dx, dy, dist) >= dist;
}

export function toViewer(el: AgentEl, map: ApiMap | undefined): Viewer | null {
  if (!el.vision || el.facing === undefined) return null;
  return {
    id: el.id,
    team: el.team,
    x: el.x,
    y: el.y,
    facing: el.facing,
    fov: el.fov ?? DEFAULT_FOV,
    range: metersToBoard(map, el.range ?? DEFAULT_VISION_RANGE),
  };
}

export function collectObstacles(elements: BoardEl[], map: ApiMap | undefined): Obstacle[] {
  const out: Obstacle[] = [];
  for (const el of elements) {
    if (el.kind !== 'ability' || !el.blocksVision || el.shape === 'none') continue;
    const len = metersToBoard(map, el.size);
    if (el.shape === 'circle') {
      out.push({ type: 'circle', x: el.x, y: el.y, r: len });
    } else {
      const a = (el.rotation * Math.PI) / 180;
      const hx = (Math.cos(a) * len) / 2;
      const hy = (Math.sin(a) * len) / 2;
      out.push({ type: 'segment', x1: el.x - hx, y1: el.y - hy, x2: el.x + hx, y2: el.y + hy });
    }
  }
  return out;
}

/** Every (viewer, opposing agent) pair where the viewer has the target in sight. */
export function computeSightings(
  agents: AgentEl[],
  occ: Occupancy | null,
  obstacles: Obstacle[],
  map: ApiMap | undefined,
  useWalls: boolean,
): Sighting[] {
  const out: Sighting[] = [];
  for (const viewerEl of agents) {
    const v = toViewer(viewerEl, map);
    if (!v) continue;
    for (const target of agents) {
      if (target.team === v.team) continue;
      if (canSee(useWalls ? occ : null, obstacles, v, target.x, target.y, useWalls)) {
        out.push({ viewerId: v.id, targetId: target.id });
      }
    }
  }
  return out;
}
