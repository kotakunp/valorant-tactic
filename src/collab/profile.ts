import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from '../lib/safeStorage';

/** Distinct from the ally teal and enemy red so a cursor never reads as a team marker. */
export const PEER_COLORS = ['#ffb84d', '#7cc6ff', '#c792ea', '#9ef01a', '#ff7eb6', '#fde047', '#fb923c', '#a5b4fc'];

interface Profile {
  name: string;
  color: string;
  setName: (name: string) => void;
  setColor: (color: string) => void;
}

const pick = <T,>(list: T[]) => list[Math.floor(Math.random() * list.length)];

export const useProfile = create<Profile>()(
  persist(
    (set) => ({
      name: `Player ${Math.floor(100 + Math.random() * 900)}`,
      color: pick(PEER_COLORS),
      setName: (name) => set({ name: name.slice(0, 24) }),
      setColor: (color) => set({ color }),
    }),
    { name: 'valo-tactic:profile', storage: safeJSONStorage(), partialize: (s) => ({ name: s.name, color: s.color }) },
  ),
);

export function displayName(name: string) {
  return name.trim() || 'Anonymous';
}
