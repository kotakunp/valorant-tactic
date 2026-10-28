import type { LiveLink } from '../types';

export interface NewRoom {
  room: string;
  edit: string;
  view: string;
}

async function errorText(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? fallback;
  } catch {
    return fallback;
  }
}

export async function createRoom(): Promise<NewRoom> {
  let res: Response;
  try {
    res = await fetch('/api/rooms', { method: 'POST' });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await errorText(res, "Couldn't start a live session"));
  return (await res.json()) as NewRoom;
}

/** Stores an image on the server and returns its same-origin `/media/…` URL. */
export async function uploadImage(room: string, token: string, image: Blob): Promise<string> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(room)}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': image.type || 'application/octet-stream' },
    body: image,
  });
  if (!res.ok) throw new Error(await errorText(res, 'Image upload failed'));
  return ((await res.json()) as { url: string }).url;
}

export async function dataUrlToBlob(src: string) {
  return (await fetch(src)).blob();
}

export function collabSocketUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`;
}

/**
 * Tokens go in the fragment so they never reach server logs or other sites' Referer headers.
 * Edit links also carry the view token, so any editor can invite viewers.
 */
export function inviteUrl(live: LiveLink, role: 'edit' | 'view') {
  const hash = role === 'edit' ? `k=${live.token}${live.viewToken ? `&v=${live.viewToken}` : ''}` : `k=${live.viewToken ?? live.token}`;
  return `${location.origin}/?room=${encodeURIComponent(live.room)}#${hash}`;
}

export function readRoomLink(): Omit<LiveLink, 'role'> | null {
  const room = new URLSearchParams(location.search).get('room');
  if (!room) return null;
  const hash = new URLSearchParams(location.hash.slice(1));
  const token = hash.get('k');
  if (!token || !/^[A-Za-z0-9_-]{16}$/.test(room)) return null;
  return { room, token, viewToken: hash.get('v') ?? undefined };
}

export function clearRoomLink() {
  history.replaceState(null, '', location.pathname);
}
