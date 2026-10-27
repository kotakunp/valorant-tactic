import type Konva from 'konva';

/** Imperative handles to the Konva scene, used by toolbar actions that live outside the canvas. */
export const boardApi = {
  stage: null as Konva.Stage | null,
  background: null as Konva.Rect | null,
  fit: () => {},
  zoom: (_factor: number) => {},
  /** Board coordinates at the middle of the visible canvas. */
  viewCenter: (): { x: number; y: number } => ({ x: 500, y: 500 }),
};

export function exportBoardPng(filename: string) {
  const { stage, background } = boardApi;
  if (!stage || !background) return false;
  const chrome = stage.find('.selection-ui');
  chrome.forEach((n) => n.hide());
  const rect = background.getClientRect();
  let url: string;
  try {
    url = stage.toDataURL({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      pixelRatio: 2048 / rect.width,
    });
  } catch {
    // A fallback-loaded (non-CORS) icon taints the canvas and blocks pixel export.
    return false;
  } finally {
    chrome.forEach((n) => n.show());
  }
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename.replace(/[^\w\- ]+/g, '').trim() || 'strategy'}.png`;
  a.click();
  return true;
}
