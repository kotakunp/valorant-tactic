import type { Lineup, Point } from '../types';
import type { LineupFilter } from '../store/lineupStore';
import type { ApiMap } from '../api/valorant';
import { usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import { createFromPayload } from './elements';
import { calloutLabel, worldToBoard } from './geo';
import { uid } from './ids';

const FORMAT = 'valo-tactic/lineups';

export function filterLineups(lineups: Lineup[], mapId: string, filter: LineupFilter): Lineup[] {
  const q = filter.query.trim().toLowerCase();
  const { agentsById } = useGameData.getState();
  return lineups.filter((l) => {
    if (l.mapId !== mapId) return false;
    if (filter.agentId && l.agentId !== filter.agentId) return false;
    if (filter.side !== 'all' && l.side !== 'both' && l.side !== filter.side) return false;
    if (!q) return true;
    const agent = agentsById[l.agentId];
    const ability = agent?.abilities.find((a) => a.slot === l.slot)?.displayName ?? '';
    return [lineupTitle(l), l.notes, agent?.displayName ?? '', ability].some((s) => s.toLowerCase().includes(q));
  });
}

export function nearestCallout(map: ApiMap | undefined, p: Point): string | null {
  if (!map?.callouts.length) return null;
  let best: { d: number; label: string } | null = null;
  for (const c of map.callouts) {
    const b = worldToBoard(map, c.location.x, c.location.y);
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    if (!best || d < best.d) best = { d, label: calloutLabel(c.superRegionName, c.regionName) };
  }
  return best?.label ?? null;
}

export function lineupTitle(l: Pick<Lineup, 'title' | 'agentId' | 'slot' | 'mapId' | 'land'>): string {
  if (l.title) return l.title;
  const { agentsById, mapsById } = useGameData.getState();
  const ability = agentsById[l.agentId]?.abilities.find((a) => a.slot === l.slot);
  const where = nearestCallout(mapsById[l.mapId], l.land);
  return [ability?.displayName ?? 'Lineup', where && `to ${where}`].filter(Boolean).join(' ');
}

/** Drops the agent at the stand spot (aimed at the landing spot) and the ability where it lands. */
export function placeLineup(l: Lineup) {
  const s = usePlan.getState();
  const agent = createFromPayload({ kind: 'agent', agentId: l.agentId }, l.stand, s.team);
  const ability = createFromPayload({ kind: 'ability', agentId: l.agentId, slot: l.slot }, l.land, s.team);
  if (!agent || !ability || agent.kind !== 'agent' || ability.kind !== 'ability') return;
  agent.facing = Math.round((Math.atan2(l.land.y - l.stand.y, l.land.x - l.stand.x) * 180) / Math.PI);
  s.addElements([agent, ability]);
  s.showToast('Lineup added to this step');
}

export function downloadLineups(lineups: Lineup[], name: string) {
  const blob = new Blob([JSON.stringify({ format: FORMAT, version: 1, lineups }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^\w\- ]+/g, '').trim() || 'lineups'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function readLineupsFile(file: File): Promise<Lineup[]> {
  let data: { format?: string; lineups?: unknown };
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON');
  }
  if (data?.format !== FORMAT || !Array.isArray(data.lineups)) throw new Error('That file is not a Valo Tactic lineups file');
  const ok = (p: unknown): p is Point => !!p && typeof (p as Point).x === 'number' && typeof (p as Point).y === 'number';
  return (data.lineups as Lineup[])
    .filter((l) => l && typeof l.mapId === 'string' && typeof l.agentId === 'string' && ok(l.stand) && ok(l.land))
    .map((l) => ({
      ...l,
      id: typeof l.id === 'string' ? l.id : uid(),
      title: String(l.title ?? ''),
      notes: String(l.notes ?? ''),
      images: Array.isArray(l.images) ? l.images.filter((s) => typeof s === 'string' && s.startsWith('data:image/')) : [],
      videoUrl: typeof l.videoUrl === 'string' && /^https?:\/\//.test(l.videoUrl) ? l.videoUrl : undefined,
      updatedAt: Number(l.updatedAt) || Date.now(),
      createdAt: Number(l.createdAt) || Date.now(),
    }));
}
