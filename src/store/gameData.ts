import { create } from 'zustand';
import { fetchAgents, fetchMaps, type ApiAgent, type ApiMap } from '../api/valorant';

interface GameDataState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  maps: ApiMap[];
  agents: ApiAgent[];
  mapsById: Record<string, ApiMap>;
  agentsById: Record<string, ApiAgent>;
  load: () => Promise<void>;
}

export const useGameData = create<GameDataState>((set, get) => ({
  status: 'idle',
  error: null,
  maps: [],
  agents: [],
  mapsById: {},
  agentsById: {},
  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const [maps, agents] = await Promise.all([fetchMaps(), fetchAgents()]);
      set({
        status: 'ready',
        maps,
        agents,
        mapsById: Object.fromEntries(maps.map((m) => [m.uuid, m])),
        agentsById: Object.fromEntries(agents.map((a) => [a.uuid, a])),
      });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
