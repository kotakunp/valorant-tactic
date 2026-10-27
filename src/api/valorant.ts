import type { AbilitySlot } from '../types';

const BASE = 'https://valorant-api.com/v1';
const CACHE_TTL = 1000 * 60 * 60 * 12;
const CACHE_VERSION = 'v1';

export interface ApiCallout {
  regionName: string;
  superRegionName: string;
  location: { x: number; y: number };
}

export interface ApiMap {
  uuid: string;
  displayName: string;
  tacticalDescription: string | null;
  coordinates: string | null;
  displayIcon: string;
  listViewIcon: string;
  splash: string;
  xMultiplier: number;
  yMultiplier: number;
  xScalarToAdd: number;
  yScalarToAdd: number;
  callouts: ApiCallout[];
}

export interface ApiAbility {
  slot: AbilitySlot;
  displayName: string;
  description: string;
  displayIcon: string;
}

export interface ApiRole {
  uuid: string;
  displayName: string;
  displayIcon: string;
}

export interface ApiAgent {
  uuid: string;
  displayName: string;
  description: string;
  displayIcon: string;
  displayIconSmall: string;
  bustPortrait: string | null;
  role: ApiRole | null;
  backgroundGradientColors: string[] | null;
  abilities: ApiAbility[];
}

const PLACEABLE_SLOTS: AbilitySlot[] = ['Grenade', 'Ability1', 'Ability2', 'Ultimate'];

async function getCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const storageKey = `valo-api:${CACHE_VERSION}:${key}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const { at, data } = JSON.parse(raw) as { at: number; data: T };
      if (Date.now() - at < CACHE_TTL) return data;
    }
  } catch {
    /* corrupt cache entry, refetch */
  }
  const data = await load();
  try {
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), data }));
  } catch {
    /* storage full; caching is best-effort */
  }
  return data;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`valorant-api.com responded ${res.status} for ${path}`);
  const body = (await res.json()) as { status: number; data: T };
  return body.data;
}

/**
 * Minimaps valorant-api.com hasn't re-exported after a layout change. Each replacement must sit in
 * the same frame as the API image so the API's world-to-minimap transform and callouts still line up.
 * Drop an entry once the API serves the current layout.
 */
const MINIMAP_OVERRIDES: Record<string, string> = {
  // Corrode, reworked in patch 13.08. Image from ValoMapper (MIT, github.com/Shafin-A/ValoMapper), rotated into the API's frame.
  '1c18ab1f-420d-0d8b-71d0-77ad3c439115': '/maps/corrode-13.08.webp',
};

function applyMinimapOverrides(maps: ApiMap[]): ApiMap[] {
  return maps.map((m) => (MINIMAP_OVERRIDES[m.uuid] ? { ...m, displayIcon: MINIMAP_OVERRIDES[m.uuid] } : m));
}

export function fetchMaps(): Promise<ApiMap[]> {
  return getCached('maps', async () => {
    const raw = await getJson<any[]>('/maps');
    return raw
      // Competitive maps are the ones with site info, a minimap and world->minimap transforms.
      .filter((m) => m.tacticalDescription && m.displayIcon && m.xMultiplier && m.callouts?.length)
      .map<ApiMap>((m) => ({
        uuid: m.uuid,
        displayName: m.displayName,
        tacticalDescription: m.tacticalDescription,
        coordinates: m.coordinates,
        displayIcon: m.displayIcon,
        listViewIcon: m.listViewIcon,
        splash: m.splash,
        xMultiplier: m.xMultiplier,
        yMultiplier: m.yMultiplier,
        xScalarToAdd: m.xScalarToAdd,
        yScalarToAdd: m.yScalarToAdd,
        callouts: (m.callouts ?? []).map((c: any) => ({
          regionName: c.regionName,
          superRegionName: c.superRegionName,
          location: { x: c.location.x, y: c.location.y },
        })),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }).then(applyMinimapOverrides);
}

export function fetchAgents(): Promise<ApiAgent[]> {
  return getCached('agents', async () => {
    const raw = await getJson<any[]>('/agents?isPlayableCharacter=true');
    const seen = new Set<string>();
    return raw
      .filter((a) => {
        if (seen.has(a.displayName)) return false;
        seen.add(a.displayName);
        return true;
      })
      .map<ApiAgent>((a) => ({
        uuid: a.uuid,
        displayName: a.displayName,
        description: a.description,
        displayIcon: a.displayIcon,
        displayIconSmall: a.displayIconSmall,
        bustPortrait: a.bustPortrait,
        role: a.role
          ? { uuid: a.role.uuid, displayName: a.role.displayName, displayIcon: a.role.displayIcon }
          : null,
        backgroundGradientColors: a.backgroundGradientColors,
        abilities: (a.abilities as any[])
          .filter((ab) => PLACEABLE_SLOTS.includes(ab.slot) && ab.displayIcon)
          .map((ab) => ({
            slot: ab.slot,
            displayName: ab.displayName,
            description: ab.description,
            displayIcon: ab.displayIcon,
          }))
          .sort((x, y) => PLACEABLE_SLOTS.indexOf(x.slot) - PLACEABLE_SLOTS.indexOf(y.slot)),
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  });
}
