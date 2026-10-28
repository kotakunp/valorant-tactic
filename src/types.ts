export type Team = 'ally' | 'enemy';
export type Side = 'attack' | 'defense';
export type AbilitySlot = 'Grenade' | 'Ability1' | 'Ability2' | 'Ultimate';
/**
 * circle: radius around the drop point. wall: thick bar centred on it.
 * cone / rect / line: start at the drop point and extend along `rotation`.
 */
export type OverlayShape = 'none' | 'circle' | 'wall' | 'cone' | 'rect' | 'line';
export type ObjectKind = 'spike' | 'danger' | 'vision' | 'death';
export type Tool = 'select' | 'pan' | 'pen' | 'line' | 'area' | 'rect' | 'polygon' | 'text' | 'eraser';

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
  /** Sees over boxes and half walls (on a ledge, box or elevated spot the minimap doesn't show). */
  highGround?: boolean;
  /** Waypoints on the way here from this agent's spot in the previous step, in board coordinates. */
  via?: Point[];
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
  /** Meters. Radius for circles; length for walls, cones, rects and lines. */
  size: number;
  /** Meters, rect shapes only. */
  width?: number;
  /** Degrees, cone shapes only. */
  angle?: number;
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

export interface RectEl {
  id: string;
  kind: 'rect';
  /** Top-left corner. */
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface PolygonEl {
  id: string;
  kind: 'polygon';
  points: number[];
  color: string;
}

export interface ImageEl {
  id: string;
  kind: 'image';
  /** Centre; images stay upright when the map rotates. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Downscaled data URL, so plans stay self-contained. */
  src: string;
}

export type BoardEl = AgentEl | AbilityEl | ObjectEl | StrokeEl | TextEl | AreaEl | RectEl | PolygonEl | ImageEl;

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
  /** Library folder name; missing means unfiled. */
  folder?: string;
  tags?: string[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Lineup {
  id: string;
  mapId: string;
  agentId: string;
  slot: AbilitySlot;
  side: Side | 'both';
  title: string;
  notes: string;
  /** Board coordinates, same frame as plan elements. */
  stand: Point;
  land: Point;
  /** Downscaled data URLs: where to stand, where to aim, the result. */
  images: string[];
  videoUrl?: string;
  createdAt: number;
  updatedAt: number;
}

export type PalettePayload =
  | { kind: 'agent'; agentId: string }
  | { kind: 'ability'; agentId: string; slot: AbilitySlot }
  | { kind: 'object'; object: ObjectKind };
