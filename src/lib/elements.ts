import type { AgentEl, BoardEl, PalettePayload, Point, Team } from '../types';
import { pathLength, pointAlong } from './navgrid';
import { useGameData } from '../store/gameData';
import { DEFAULT_CONE_ANGLE, DEFAULT_RECT_WIDTH, rangePreset } from './abilityPresets';
import { uid } from './ids';
import { BOARD } from './geo';

export const DEFAULT_FOV = 103;
export const DEFAULT_VISION_RANGE = 60;

export function createFromPayload(payload: PalettePayload, pos: { x: number; y: number }, team: Team): BoardEl | null {
  const { x, y } = pos;
  switch (payload.kind) {
    case 'agent':
      return {
        id: uid(),
        kind: 'agent',
        agentId: payload.agentId,
        team,
        x,
        y,
        // Facing the middle of the map is a better first guess than a fixed direction.
        facing: Math.round((Math.atan2(BOARD / 2 - y, BOARD / 2 - x) * 180) / Math.PI),
        vision: true,
        fov: DEFAULT_FOV,
        range: DEFAULT_VISION_RANGE,
      };
    case 'ability': {
      const agent = useGameData.getState().agentsById[payload.agentId];
      const ability = agent?.abilities.find((a) => a.slot === payload.slot);
      const preset = agent && ability ? rangePreset(agent.displayName, ability.displayName) : { shape: 'none' as const, size: 5 };
      return {
        id: uid(),
        kind: 'ability',
        agentId: payload.agentId,
        slot: payload.slot,
        team,
        x,
        y,
        rotation: 0,
        shape: preset.shape,
        size: preset.size,
        width: preset.width ?? DEFAULT_RECT_WIDTH,
        angle: preset.angle ?? DEFAULT_CONE_ANGLE,
        blocksVision: preset.blocksVision ?? false,
      };
    }
    case 'object':
      return { id: uid(), kind: 'object', object: payload.object, x, y };
  }
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function normalizeAngle(deg: number) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

const lerpAngle = (a: number, b: number, t: number) => a + normalizeAngle(b - a) * t;

export interface Frame {
  el: BoardEl;
  opacity: number;
}

/** Walking path for an agent between its spot in two steps; null for a straight glide. */
export type RouteFn = (from: AgentEl, to: AgentEl) => Point[] | null;

/** Fraction of the move spent turning from the old facing to the direction of travel, and back at the end. */
const TURN = 0.15;

/**
 * Blends two steps: shared ids glide to their new spot (agents along their walking route),
 * added ones fade in, removed ones fade out.
 */
export function interpolateSteps(from: BoardEl[], to: BoardEl[], rawT: number, route?: RouteFn): Frame[] {
  const t = easeInOut(Math.max(0, Math.min(1, rawT)));
  const fromById = new Map(from.map((e) => [e.id, e]));
  const toIds = new Set(to.map((e) => e.id));
  const leaving: Frame[] = from.filter((e) => !toIds.has(e.id)).map((el) => ({ el, opacity: 1 - t }));
  const staying: Frame[] = to.map((el) => {
    const prev = fromById.get(el.id);
    if (!prev) return { el, opacity: t };
    if (prev.kind !== el.kind || !('x' in el) || !('x' in prev)) return { el, opacity: 1 };
    const moved = { ...el, x: lerp(prev.x, el.x, t), y: lerp(prev.y, el.y, t) } as BoardEl;
    const path = moved.kind === 'agent' && prev.kind === 'agent' ? route?.(prev, moved) : null;
    if (path && path.length >= 2 && moved.kind === 'agent' && prev.kind === 'agent') {
      const at = pointAlong(path, pathLength(path) * t);
      moved.x = at.x;
      moved.y = at.y;
      if (prev.facing !== undefined && moved.facing !== undefined) {
        // Look where you're going while moving, then settle on the planned angle.
        moved.facing =
          t < TURN
            ? lerpAngle(prev.facing, at.heading, t / TURN)
            : t > 1 - TURN
              ? lerpAngle(at.heading, moved.facing, (t - (1 - TURN)) / TURN)
              : at.heading;
      }
    } else if (moved.kind === 'agent' && prev.kind === 'agent' && prev.facing !== undefined && moved.facing !== undefined) {
      moved.facing = lerpAngle(prev.facing, moved.facing, t);
    }
    if (moved.kind === 'ability' && prev.kind === 'ability') {
      moved.size = lerp(prev.size, moved.size, t);
      moved.rotation = lerp(prev.rotation, moved.rotation, t);
    }
    return { el: moved, opacity: 1 };
  });
  return [...leaving, ...staying];
}
