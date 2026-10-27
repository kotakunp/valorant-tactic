import type { ApiMap } from '../api/valorant';

/** Logical size of the square board. The minimap image is drawn at 0..BOARD on both axes. */
export const BOARD = 1000;

/**
 * Converts in-game world coordinates to board coordinates.
 * valorant-api.com documents the minimap transform as swapping axes:
 * u = worldY * xMultiplier + xScalarToAdd, v = worldX * yMultiplier + yScalarToAdd.
 */
export function worldToBoard(map: ApiMap, x: number, y: number) {
  return {
    x: (y * map.xMultiplier + map.xScalarToAdd) * BOARD,
    y: (x * map.yMultiplier + map.yScalarToAdd) * BOARD,
  };
}

/** World units are centimeters, so this gives real-scale ability ranges per map. */
export function metersToBoard(map: ApiMap | undefined, meters: number) {
  const mul = map ? Math.abs(map.xMultiplier) : 7.5e-5;
  return meters * 100 * mul * BOARD;
}

export function boardToMeters(map: ApiMap | undefined, units: number) {
  const mul = map ? Math.abs(map.xMultiplier) : 7.5e-5;
  return units / (100 * mul * BOARD);
}

export function calloutLabel(superRegion: string, region: string) {
  if (superRegion === 'Attacker Side') return `Attacker ${region}`;
  if (superRegion === 'Defender Side') return `Defender ${region}`;
  return `${superRegion} ${region}`;
}
