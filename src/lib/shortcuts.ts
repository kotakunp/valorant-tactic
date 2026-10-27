export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

const KEY_NAMES: Record<string, string> = isMac
  ? { Mod: '⌘', Shift: '⇧', Alt: '⌥', Delete: 'Del', ArrowLeft: '←', ArrowRight: '→' }
  : { Mod: 'Ctrl', Delete: 'Del', ArrowLeft: '←', ArrowRight: '→' };

/** "Mod+Shift+Z" -> ["⌘", "⇧", "Z"] on macOS, ["Ctrl", "Shift", "Z"] elsewhere. */
export function formatCombo(combo: string): string[] {
  return combo.split('+').map((k) => KEY_NAMES[k] ?? k);
}

export interface Shortcut {
  label: string;
  /** Alternative combos, e.g. ["Delete", "Backspace"]. */
  keys: string[];
}

/** Single source for tooltips and the shortcuts sheet; App's key handler implements these. */
export const SHORTCUTS = {
  select: { label: 'Select & move', keys: ['V'] },
  pan: { label: 'Pan (drag the map)', keys: ['H', 'Space'] },
  pen: { label: 'Freehand draw', keys: ['P'] },
  line: { label: 'Straight line', keys: ['L'] },
  area: { label: 'Area circle', keys: ['O'] },
  text: { label: 'Text', keys: ['T'] },
  eraser: { label: 'Eraser', keys: ['E'] },
  arrow: { label: 'Toggle arrow head', keys: ['A'] },
  dashed: { label: 'Toggle dashed lines', keys: ['D'] },
  color: { label: 'Next / previous color', keys: ['C', 'Shift+C'] },
  width: { label: 'Cycle stroke width', keys: ['W'] },
  team: { label: 'Switch ally / enemy', keys: ['X'] },
  undo: { label: 'Undo', keys: ['Mod+Z'] },
  redo: { label: 'Redo', keys: ['Mod+Shift+Z', 'Mod+Y'] },
  duplicate: { label: 'Duplicate selection', keys: ['Mod+D'] },
  delete: { label: 'Delete selection', keys: ['Delete', 'Backspace'] },
  deselect: { label: 'Cancel placing / deselect', keys: ['Esc'] },
  turnLeft: { label: 'Turn agent left (Shift = 5°)', keys: ['['] },
  turnRight: { label: 'Turn agent right (Shift = 5°)', keys: [']'] },
  prevStep: { label: 'Previous step', keys: ['ArrowLeft'] },
  nextStep: { label: 'Next step', keys: ['ArrowRight'] },
  newStep: { label: 'New step (copy of current)', keys: ['N'] },
  blankStep: { label: 'New blank step', keys: ['Shift+N'] },
  play: { label: 'Play / stop animation', keys: ['K'] },
  rotateCw: { label: 'Rotate map clockwise', keys: ['R'] },
  rotateCcw: { label: 'Rotate map counter-clockwise', keys: ['Shift+R'] },
  rot0: { label: 'Rotate to 0°', keys: ['1'] },
  rot90: { label: 'Rotate to 90°', keys: ['2'] },
  rot180: { label: 'Rotate to 180°', keys: ['3'] },
  rot270: { label: 'Rotate to 270°', keys: ['4'] },
  fit: { label: 'Fit map', keys: ['F'] },
  zoomIn: { label: 'Zoom in', keys: ['='] },
  zoomOut: { label: 'Zoom out', keys: ['-'] },
  maps: { label: 'Change map', keys: ['M'] },
  library: { label: 'Library', keys: ['Mod+O'] },
  newPlan: { label: 'New strategy', keys: ['Mod+Alt+N'] },
  save: { label: 'Saved automatically', keys: ['Mod+S'] },
  share: { label: 'Copy share link', keys: ['Mod+Shift+S'] },
  exportPng: { label: 'Export PNG', keys: ['Mod+Shift+E'] },
  help: { label: 'Keyboard shortcuts', keys: ['?'] },
} satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_GROUPS: { title: string; ids: ShortcutId[] }[] = [
  { title: 'Tools', ids: ['select', 'pan', 'pen', 'line', 'area', 'text', 'eraser'] },
  { title: 'Drawing', ids: ['arrow', 'dashed', 'color', 'width', 'team'] },
  { title: 'Editing', ids: ['undo', 'redo', 'duplicate', 'delete', 'deselect', 'turnLeft', 'turnRight'] },
  { title: 'Steps', ids: ['prevStep', 'nextStep', 'newStep', 'blankStep', 'play'] },
  { title: 'View', ids: ['rotateCw', 'rotateCcw', 'rot0', 'rot90', 'rot180', 'rot270', 'fit', 'zoomIn', 'zoomOut'] },
  { title: 'Strategy', ids: ['maps', 'library', 'newPlan', 'save', 'share', 'exportPng', 'help'] },
];

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Spread onto a button to give it a hover tooltip (rendered by TooltipLayer) and an accessible name. */
export function tip(label: string, shortcut?: ShortcutId | null, side: Side = 'bottom') {
  const keys = shortcut ? SHORTCUTS[shortcut].keys.join(' | ') : undefined;
  return {
    'data-tip': label,
    'data-tip-keys': keys,
    'data-tip-side': side,
    'aria-label': label,
  } as const;
}

export function tipFor(id: ShortcutId, side: Side = 'bottom', label?: string) {
  return tip(label ?? SHORTCUTS[id].label, id, side);
}
