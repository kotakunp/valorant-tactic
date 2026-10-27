export type Team = 'ally' | 'enemy';
export type Side = 'attack' | 'defense';
export type AbilitySlot = 'Grenade' | 'Ability1' | 'Ability2' | 'Ultimate';
export type OverlayShape = 'none' | 'circle' | 'wall';
export type ObjectKind = 'spike' | 'danger' | 'vision' | 'death';
export type Tool = 'select' | 'pan' | 'pen' | 'line' | 'area' | 'text' | 'eraser';

export interface AgentEl {
  id: string;
  kind: 'agent';
  agentId: string;
  team: Team;
  x: number;
  y: number;
  /** Degrees in board space (0 = +x, clockwise). Missing on plans saved before vision existed. */
  facing?: number;
  vision?: boolean;
  /** Horizontal field of view in degrees. */
  fov?: number;
  /** Vision range in meters. */
  range?: number;
}

export interface AbilityEl {
  id: string;
  kind: 'ability';
  agentId: string;
  slot: AbilitySlot;
  team: Team;
  x: number;
  y: number;
  /** Degrees, in board space. Used by wall overlays. */
  rotation: number;
  shape: OverlayShape;
  /** Meters. Radius for circles, full length for walls. */
  size: number;
  /** Smokes and walls that stop line of sight. */
  blocksVision?: boolean;
}

export interface ObjectEl {
  id: string;
  kind: 'object';
  object: ObjectKind;
  x: number;
  y: number;
}

export interface StrokeEl {
  id: string;
  kind: 'stroke';
  points: number[];
  color: string;
  width: number;
  arrow: boolean;
  dashed: boolean;
  smooth: boolean;
}

export interface TextEl {
  id: string;
  kind: 'text';
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}

export interface AreaEl {
  id: string;
  kind: 'area';
  x: number;
  y: number;
  radius: number;
  color: string;
}

export type BoardEl = AgentEl | AbilityEl | ObjectEl | StrokeEl | TextEl | AreaEl;

export interface Step {
  id: string;
  name: string;
  notes: string;
  elements: BoardEl[];
}

export interface Plan {
  id: string;
  title: string;
  mapId: string;
  side: Side;
  steps: Step[];
  updatedAt: number;
}

export type PalettePayload =
  | { kind: 'agent'; agentId: string }
  | { kind: 'ability'; agentId: string; slot: AbilitySlot }
  | { kind: 'object'; object: ObjectKind };
