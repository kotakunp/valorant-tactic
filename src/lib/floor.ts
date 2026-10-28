import type { BoardEl, Point } from '../types';
import { useGameData } from '../store/gameData';
import { loadedOccupancy, navFor } from './vision';
import { nearestWalkable, type NavGrid } from './navgrid';

/** Nav cells (about 2 board units each) an agent keeps from walls. */
const AGENT_CLEARANCE = 2;

export function navForMap(mapId: string): NavGrid | null {
  const occ = loadedOccupancy(useGameData.getState().mapsById[mapId]?.displayIcon);
  return occ ? navFor(occ) : null;
}

/** The closest spot a player could actually stand. Unchanged while the minimap is still loading. */
export function snapToFloor(nav: NavGrid | null, p: Point): Point {
  if (!nav) return p;
  const q = nearestWalkable(nav, p, AGENT_CLEARANCE);
  return q ? { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 } : p;
}

/** Moves any agent that was added or changed back onto the floor. */
export function keepAgentsOnFloor(mapId: string, before: BoardEl[], after: BoardEl[]): BoardEl[] {
  const nav = navForMap(mapId);
  if (!nav) return after;
  const untouched = new Set(before);
  return after.map((el) => {
    if (el.kind !== 'agent' || untouched.has(el)) return el;
    const p = snapToFloor(nav, el);
    return p.x === el.x && p.y === el.y ? el : { ...el, x: p.x, y: p.y };
  });
}
