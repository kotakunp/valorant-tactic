import { useMemo } from 'react';
import { useCurrentStep, usePlan } from '../store/planStore';
import { useGameData } from '../store/gameData';
import type { AgentEl } from '../types';
import { collectObstacles, computeSightings, useOccupancy, type Sighting } from './vision';

/** Sightings for the current step, for UI outside the canvas. */
export function useStepSightings(): Sighting[] {
  const step = useCurrentStep();
  const mapId = usePlan((s) => s.plan.mapId);
  const lineOfSight = usePlan((s) => s.settings.lineOfSight);
  const showRanges = usePlan((s) => s.settings.showRanges);
  const coverBlocks = usePlan((s) => s.settings.coverBlocksVision);
  const map = useGameData((s) => s.mapsById[mapId]);
  const occ = useOccupancy(map?.displayIcon);
  return useMemo(() => {
    const agents = step.elements.filter((e): e is AgentEl => e.kind === 'agent');
    const obstacles = showRanges ? collectObstacles(step.elements, map) : [];
    return computeSightings(agents, occ, obstacles, map, lineOfSight, coverBlocks);
  }, [step.elements, occ, map, lineOfSight, showRanges, coverBlocks]);
}
