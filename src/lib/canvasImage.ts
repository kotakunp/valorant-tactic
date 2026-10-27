import { useEffect, useState } from 'react';

/**
 * media.valorant-api.com only sends CORS headers when the request has an Origin, and doesn't
 * send `Vary: Origin`. Plain <img> tags in the UI therefore leave a non-CORS copy in the
 * browser cache that a later crossOrigin request reuses and rejects. Canvas loads use a
 * distinct URL so they always get their own CORS response.
 */
export function canvasUrl(url: string) {
  if (!/^https?:/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}canvas=1`;
}

const loaded = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

function load(src: string, crossOrigin: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

export function loadCanvasImage(url: string): Promise<HTMLImageElement> {
  const hit = loaded.get(url);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(url);
  if (!p) {
    p = load(canvasUrl(url), true)
      // Last resort: show the icon even though it would taint the canvas for PNG export.
      .catch(() => load(url, false))
      .then((img) => {
        loaded.set(url, img);
        return img;
      });
    p.catch(() => pending.delete(url));
    pending.set(url, p);
  }
  return p;
}

export function useCanvasImage(url: string | undefined): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement | undefined>(() => (url ? loaded.get(url) : undefined));
  useEffect(() => {
    if (!url) return setImg(undefined);
    const hit = loaded.get(url);
    if (hit) return setImg(hit);
    setImg(undefined);
    let alive = true;
    loadCanvasImage(url)
      .then((i) => alive && setImg(i))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}
