export interface EncodedImage {
  src: string;
  width: number;
  height: number;
}

/** Downscales and re-encodes an image so it fits comfortably in localStorage and share files. */
export async function encodeImage(file: Blob, maxSide = 1280, quality = 0.82): Promise<EncodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("The browser can't read that image"));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    ctx.drawImage(img, 0, 0, width, height);
    let src = canvas.toDataURL('image/webp', quality);
    // Older Safari silently falls back to PNG, which is several times larger.
    if (!src.startsWith('data:image/webp')) src = canvas.toDataURL('image/jpeg', quality);
    return { src, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function pickImageFiles(multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

/** First image in a paste event, if any. */
export function imageFromClipboard(e: ClipboardEvent): File | null {
  for (const item of e.clipboardData?.items ?? []) {
    if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
  }
  return null;
}
