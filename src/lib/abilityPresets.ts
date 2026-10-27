import type { OverlayShape } from '../types';

export interface RangePreset {
  shape: OverlayShape;
  /** Meters: radius for circles, length for walls. */
  size: number;
  blocksVision?: boolean;
}

/**
 * Approximate in-game footprints, keyed by "Agent/Ability". The API ships no
 * ability dimensions, so these are community-measured values and stay editable.
 */
const PRESETS: Record<string, RangePreset> = {
  'Brimstone/Sky Smoke': { shape: 'circle', size: 4.1, blocksVision: true },
  'Omen/Dark Cover': { shape: 'circle', size: 4.1, blocksVision: true },
  'Astra/Nebula / Dissipate': { shape: 'circle', size: 4.75, blocksVision: true },
  'Viper/Poison Cloud': { shape: 'circle', size: 4.5, blocksVision: true },
  'Viper/Toxic Screen': { shape: 'wall', size: 50, blocksVision: true },
  'Jett/Cloudburst': { shape: 'circle', size: 3.35, blocksVision: true },
  'Harbor/Cove': { shape: 'circle', size: 4.5, blocksVision: true },
  'Clove/Ruse': { shape: 'circle', size: 4.1, blocksVision: true },
  'Cypher/Cyber Cage': { shape: 'circle', size: 3.65, blocksVision: true },
  'Killjoy/Lockdown': { shape: 'circle', size: 32.5 },
  'Sage/Barrier Orb': { shape: 'wall', size: 10, blocksVision: true },
  'Phoenix/Blaze': { shape: 'wall', size: 16, blocksVision: true },
  'Harbor/High Tide': { shape: 'wall', size: 50, blocksVision: true },
  'Neon/Fast Lane': { shape: 'wall', size: 50, blocksVision: true },
};

export function rangePreset(agentName: string, abilityName: string): RangePreset {
  const key = `${agentName}/${abilityName}`.replace(/\s+/g, ' ').trim();
  return PRESETS[key] ?? { shape: 'none', size: 5 };
}

export const SLOT_KEYS: Record<string, string> = {
  Grenade: 'C',
  Ability1: 'Q',
  Ability2: 'E',
  Ultimate: 'X',
};
