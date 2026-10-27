import type { ObjectKind } from '../types';

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`)}`;

export const OBJECTS: { kind: ObjectKind; label: string; icon: string }[] = [
  {
    kind: 'spike',
    label: 'Spike',
    icon: svg(
      '<circle cx="32" cy="32" r="29" fill="#0f1923" stroke="#ff4655" stroke-width="4"/><path d="M32 9 46 30 39 55H25L18 30Z" fill="#ff4655"/><path d="M32 19 39 31 35.5 47h-7L25 31Z" fill="#ffd9dc"/>',
    ),
  },
  {
    kind: 'danger',
    label: 'Danger',
    icon: svg(
      '<path d="M32 5 61 57H3Z" fill="#ffd166" stroke="#0f1923" stroke-width="3" stroke-linejoin="round"/><rect x="29" y="22" width="6" height="19" rx="2" fill="#0f1923"/><circle cx="32" cy="48" r="3.6" fill="#0f1923"/>',
    ),
  },
  {
    kind: 'vision',
    label: 'Watch',
    icon: svg(
      '<circle cx="32" cy="32" r="29" fill="#0f1923" stroke="#7aa2ff" stroke-width="4"/><path d="M10 32c6-10 14-15 22-15s16 5 22 15c-6 10-14 15-22 15S16 42 10 32Z" fill="none" stroke="#ece8e1" stroke-width="4"/><circle cx="32" cy="32" r="7" fill="#7aa2ff"/>',
    ),
  },
  {
    kind: 'death',
    label: 'Kill',
    icon: svg(
      '<circle cx="32" cy="32" r="29" fill="#0f1923" stroke="#ece8e1" stroke-width="4"/><path d="M20 20 44 44M44 20 20 44" stroke="#ff4655" stroke-width="7" stroke-linecap="round"/>',
    ),
  },
];

export const OBJECT_ICON: Record<ObjectKind, string> = Object.fromEntries(OBJECTS.map((o) => [o.kind, o.icon])) as Record<
  ObjectKind,
  string
>;
