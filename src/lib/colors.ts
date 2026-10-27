import type { Team } from '../types';

export const TEAM_COLORS: Record<Team, string> = {
  ally: '#3ee0c0',
  enemy: '#ff4655',
};

export const DRAW_COLORS = ['#ff4655', '#3ee0c0', '#ffd166', '#ece8e1', '#7aa2ff', '#c77dff'];

export const STROKE_WIDTHS = [2, 4, 7];

export function withAlpha(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
