import type { OverlayShape } from '../types';

export interface RangePreset {
  shape: OverlayShape;
  /** Meters: radius for circles, length for everything else. */
  size: number;
  /** Meters, rect shapes. */
  width?: number;
  /** Degrees, cone shapes. */
  angle?: number;
  blocksVision?: boolean;
}

export const DEFAULT_RECT_WIDTH = 6;
export const DEFAULT_CONE_ANGLE = 60;

/**
 * Approximate in-game footprints, keyed by "Agent/Ability". The API ships no
 * ability dimensions, so these are community-measured values and stay editable.
 */
const PRESETS: Record<string, RangePreset> = {
  // Smokes and vision blockers
  'Brimstone/Sky Smoke': { shape: 'circle', size: 4.1, blocksVision: true },
  'Omen/Dark Cover': { shape: 'circle', size: 4.1, blocksVision: true },
  'Astra/Nebula / Dissipate': { shape: 'circle', size: 4.75, blocksVision: true },
  'Astra/Astral Form / Cosmic Divide': { shape: 'line', size: 200, blocksVision: true },
  'Viper/Poison Cloud': { shape: 'circle', size: 4.5, blocksVision: true },
  'Viper/Toxic Screen': { shape: 'wall', size: 50, blocksVision: true },
  "Viper/Viper's Pit": { shape: 'circle', size: 15.5, blocksVision: true },
  'Jett/Cloudburst': { shape: 'circle', size: 3.35, blocksVision: true },
  'Harbor/Cove': { shape: 'circle', size: 4.5, blocksVision: true },
  'Harbor/High Tide': { shape: 'wall', size: 50, blocksVision: true },
  'Harbor/Storm Surge': { shape: 'circle', size: 7 },
  'Harbor/Reckoning': { shape: 'rect', size: 25, width: 14 },
  'Clove/Ruse': { shape: 'circle', size: 4.1, blocksVision: true },
  'Clove/Meddle': { shape: 'circle', size: 6 },
  'Cypher/Cyber Cage': { shape: 'circle', size: 3.65, blocksVision: true },
  'Sage/Barrier Orb': { shape: 'wall', size: 10, blocksVision: true },
  'Sage/Slow Orb': { shape: 'circle', size: 7 },
  'Phoenix/Blaze': { shape: 'wall', size: 16, blocksVision: true },
  'Neon/Fast Lane': { shape: 'rect', size: 50, width: 4.5, blocksVision: true },
  'Iso/Contingency': { shape: 'wall', size: 9, blocksVision: true },
  'Iso/Kill Contract': { shape: 'rect', size: 35, width: 7 },
  'Vyse/Shear': { shape: 'wall', size: 12, blocksVision: true },
  'Vyse/Steel Garden': { shape: 'circle', size: 32.5 },
  'Deadlock/Barrier Mesh': { shape: 'wall', size: 9, blocksVision: true },
  'Deadlock/GravNet': { shape: 'circle', size: 5 },
  'Deadlock/Sonic Sensor': { shape: 'cone', size: 14, angle: 90 },

  // Damage and area denial
  'Brimstone/Incendiary': { shape: 'circle', size: 4.5 },
  'Brimstone/Stim Beacon': { shape: 'circle', size: 6 },
  'Brimstone/Orbital Strike': { shape: 'circle', size: 9 },
  'Viper/Snake Bite': { shape: 'circle', size: 4.5 },
  'Phoenix/Hot Hands': { shape: 'circle', size: 4.5 },
  'Killjoy/Nanoswarm': { shape: 'circle', size: 4.5 },
  'Killjoy/Lockdown': { shape: 'circle', size: 32.5 },
  'Killjoy/TURRET': { shape: 'cone', size: 40, angle: 180 },
  'Killjoy/ALARMBOT': { shape: 'circle', size: 5.5 },
  'Raze/Paint Shells': { shape: 'circle', size: 7 },
  'Raze/Blast Pack': { shape: 'circle', size: 4 },
  'KAY/O/FRAG/ment': { shape: 'circle', size: 4.5 },
  'KAY/O/ZERO/point': { shape: 'circle', size: 15 },
  'KAY/O/NULL/cmd': { shape: 'circle', size: 42.5 },
  'Gekko/Mosh Pit': { shape: 'circle', size: 4.5 },
  'Sova/Shock Bolt': { shape: 'circle', size: 4 },
  "Sova/Hunter's Fury": { shape: 'rect', size: 66, width: 2 },
  'Chamber/Trademark': { shape: 'circle', size: 10 },
  'Chamber/Rendezvous': { shape: 'circle', size: 15 },
  'Vyse/Arc Rose': { shape: 'cone', size: 12, angle: 100 },
  'Vyse/Razorvine': { shape: 'circle', size: 6.5 },

  // Info, stuns and lines
  'Sova/Recon Bolt': { shape: 'circle', size: 30 },
  'Fade/Haunt': { shape: 'circle', size: 30 },
  'Fade/Seize': { shape: 'circle', size: 6.5 },
  'Fade/Nightfall': { shape: 'rect', size: 40, width: 22 },
  'Breach/Fault Line': { shape: 'rect', size: 40, width: 8 },
  'Breach/Aftershock': { shape: 'rect', size: 6, width: 5 },
  'Breach/Rolling Thunder': { shape: 'cone', size: 32, angle: 60 },
  'Cypher/Trapwire': { shape: 'line', size: 15 },
  'Cypher/Spycam': { shape: 'cone', size: 30, angle: 100 },
  'Skye/Regrowth': { shape: 'circle', size: 18 },
  'Astra/Gravity Well': { shape: 'circle', size: 4.75 },
  'Astra/Nova Pulse': { shape: 'circle', size: 4.75 },
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

export const SHAPE_LABELS: Record<OverlayShape, string> = {
  none: 'Icon',
  circle: 'Radius',
  wall: 'Wall',
  cone: 'Cone',
  rect: 'Area',
  line: 'Line',
};
