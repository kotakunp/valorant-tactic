import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Arrow, Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text } from 'react-konva';
import type Konva from 'konva';
import { useCanvasImage } from '../../lib/canvasImage';
import { Maximize, Minus, Plus, RotateCcw, RotateCw } from 'lucide-react';
import { usePlan, useCurrentStep, type Rotation } from '../../store/planStore';
import { useGameData } from '../../store/gameData';
import { BOARD, calloutLabel, metersToBoard, worldToBoard } from '../../lib/geo';
import { tip, tipFor, type ShortcutId } from '../../lib/shortcuts';
import { TEAM_COLORS, withAlpha } from '../../lib/colors';
import { interpolateSteps, type Frame } from '../../lib/elements';
import { boardApi } from '../../lib/boardApi';
import { uid } from '../../lib/ids';
import type { AgentEl, BoardEl, PalettePayload } from '../../types';
import { ElementNode, AGENT_RADIUS } from './nodes';
import { castVision, collectObstacles, computeSightings, toViewer, useOccupancy } from '../../lib/vision';

type Draft =
  | { kind: 'pen'; points: number[] }
  | { kind: 'line'; points: number[] }
  | { kind: 'area'; x: number; y: number; r: number };

interface TextEditState {
  id?: string;
  boardX: number;
  boardY: number;
  screenX: number;
  screenY: number;
  value: string;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const ROTATION_SHORTCUTS: ShortcutId[] = ['rot0', 'rot90', 'rot180', 'rot270'];
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;

function findElementId(node: Konva.Node | null, stage: Konva.Stage | null): string | null {
  let n: Konva.Node | null = node;
  while (n && n !== stage) {
    if (n.hasName('element')) return n.id();
    n = n.getParent();
  }
  return null;
}

export default function Board() {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const boardRef = useRef<Konva.Group>(null);
  const bgRef = useRef<Konva.Rect>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [spaceDown, setSpaceDown] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const erasing = useRef(false);
  const [textEdit, setTextEdit] = useState<TextEditState | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const coneCache = useRef(new Map<string, number[]>());

  const plan = usePlan((s) => s.plan);
  const stepIndex = usePlan((s) => s.stepIndex);
  const step = useCurrentStep();
  const tool = usePlan((s) => s.tool);
  const armed = usePlan((s) => s.armed);
  const selectedId = usePlan((s) => s.selectedId);
  const settings = usePlan((s) => s.settings);
  const playback = usePlan((s) => s.playback);
  const color = usePlan((s) => s.color);
  const strokeWidth = usePlan((s) => s.strokeWidth);
  const arrow = usePlan((s) => s.arrow);
  const dashed = usePlan((s) => s.dashed);
  const actions = usePlan.getState();

  const map = useGameData((s) => s.mapsById[plan.mapId]);
  const mapImg = useCanvasImage(map?.displayIcon);
  const occupancy = useOccupancy(map?.displayIcon);
  const rot = settings.rotation;
  const interactive = tool === 'select' && !playback && !armed && !spaceDown;

  const setDraftBoth = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  const fit = useCallback(() => {
    if (!size.w || !size.h) return;
    const scale = (Math.min(size.w, size.h) / BOARD) * 0.94;
    setView({ scale, x: (size.w - BOARD * scale) / 2, y: (size.h - BOARD * scale) / 2 });
  }, [size.w, size.h]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => fit(), [fit, plan.mapId]);

  useEffect(() => {
    boardApi.stage = stageRef.current;
    boardApi.background = bgRef.current;
    boardApi.fit = fit;
    boardApi.zoom = (factor) => zoomAt(factor);
  });

  useEffect(() => {
    // Konva measures text on draw, so redraw once the web font is available.
    document.fonts?.ready.then(() => stageRef.current?.batchDraw());
  }, []);

  useEffect(() => {
    const isTyping = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const boardPos = () => boardRef.current?.getRelativePointerPosition() ?? null;

  const finishDraft = useCallback(() => {
    const d = draftRef.current;
    erasing.current = false;
    if (!d) return;
    setDraftBoth(null);
    const s = usePlan.getState();
    if (d.kind === 'pen' && d.points.length >= 6) {
      s.addElement({ id: uid(), kind: 'stroke', points: d.points, color: s.color, width: s.strokeWidth, arrow: s.arrow, dashed: s.dashed, smooth: true });
    } else if (d.kind === 'line') {
      const [x1, y1, x2, y2] = d.points;
      if (Math.hypot(x2 - x1, y2 - y1) > 6) {
        s.addElement({ id: uid(), kind: 'stroke', points: d.points, color: s.color, width: s.strokeWidth, arrow: s.arrow, dashed: s.dashed, smooth: false });
      }
    } else if (d.kind === 'area' && d.r > 4) {
      s.addElement({ id: uid(), kind: 'area', x: d.x, y: d.y, radius: d.r, color: s.color });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pointerup', finishDraft);
    return () => window.removeEventListener('pointerup', finishDraft);
  }, [finishDraft]);

  const openTextEditor = (boardX: number, boardY: number, existing?: { id: string; text: string }) => {
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    setTextEdit({ id: existing?.id, boardX, boardY, screenX: pointer.x, screenY: pointer.y, value: existing?.text ?? '' });
  };

  const commitText = () => {
    if (!textEdit) return;
    const value = textEdit.value.trim();
    const s = usePlan.getState();
    if (textEdit.id) {
      if (value) s.updateElement(textEdit.id, { text: value });
      else s.removeElement(textEdit.id);
    } else if (value) {
      s.addElement({ id: uid(), kind: 'text', x: textEdit.boardX, y: textEdit.boardY, text: value, color: s.color, size: 22 });
    }
    setTextEdit(null);
  };

  const eraseTarget = (node: Konva.Node | null) => {
    const id = findElementId(node, stageRef.current);
    if (id) usePlan.getState().removeElement(id);
  };

  const onPointerDown = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (playback || spaceDown || tool === 'pan' || e.evt.button === 1 || e.evt.button === 2) return;
    if (textEdit) {
      commitText();
      return;
    }
    const pos = boardPos();
    if (!pos) return;
    const stage = stageRef.current;
    const targetId = findElementId(e.target, stage);

    if (armed) {
      actions.placePayload(armed, pos);
      if (!e.evt.shiftKey) actions.setArmed(null);
      return;
    }
    switch (tool) {
      case 'select':
        actions.select(targetId);
        break;
      case 'pen':
        setDraftBoth({ kind: 'pen', points: [pos.x, pos.y] });
        break;
      case 'line':
        setDraftBoth({ kind: 'line', points: [pos.x, pos.y, pos.x, pos.y] });
        break;
      case 'area':
        setDraftBoth({ kind: 'area', x: pos.x, y: pos.y, r: 0 });
        break;
      case 'text':
        // Opened on click instead: the browser's mousedown default would steal focus from the new input.
        break;
      case 'eraser':
        erasing.current = true;
        eraseTarget(e.target);
        break;
    }
  };

  const onPointerMove = () => {
    if (erasing.current) {
      const stage = stageRef.current;
      const p = stage?.getPointerPosition();
      if (stage && p) eraseTarget(stage.getIntersection(p));
      return;
    }
    const d = draftRef.current;
    if (!d) return;
    const pos = boardPos();
    if (!pos) return;
    if (d.kind === 'pen') {
      const n = d.points.length;
      if (Math.hypot(pos.x - d.points[n - 2], pos.y - d.points[n - 1]) < 2.5 / view.scale) return;
      setDraftBoth({ ...d, points: [...d.points, pos.x, pos.y] });
    } else if (d.kind === 'line') {
      setDraftBoth({ ...d, points: [d.points[0], d.points[1], pos.x, pos.y] });
    } else {
      setDraftBoth({ ...d, r: Math.hypot(pos.x - d.x, pos.y - d.y) });
    }
  };

  const onPointerClick = (e: Konva.KonvaEventObject<PointerEvent>) => {
    if (tool !== 'text' || playback || spaceDown || armed || e.evt.button !== 0) return;
    const pos = boardPos();
    if (!pos) return;
    const targetId = findElementId(e.target, stageRef.current);
    const existing = step.elements.find((el) => el.id === targetId);
    if (existing?.kind === 'text') openTextEditor(existing.x, existing.y, existing);
    else openTextEditor(pos.x, pos.y);
  };

  const onDblClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (tool !== 'select' || playback) return;
    const id = findElementId(e.target, stageRef.current);
    const el = step.elements.find((x) => x.id === id);
    if (el?.kind === 'text') openTextEditor(el.x, el.y, el);
  };

  const zoomAt = (factor: number, center?: { x: number; y: number }) => {
    setView((v) => {
      const c = center ?? { x: size.w / 2, y: size.h / 2 };
      const scale = Math.max(MIN_ZOOM * (Math.min(size.w, size.h) / BOARD), Math.min(MAX_ZOOM, v.scale * factor));
      const bx = (c.x - v.x) / v.scale;
      const by = (c.y - v.y) / v.scale;
      return { scale, x: c.x - bx * scale, y: c.y - by * scale };
    });
  };

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const pointer = stageRef.current?.getPointerPosition();
    if (!pointer) return;
    const delta = Math.max(-60, Math.min(60, e.evt.deltaY));
    zoomAt(Math.exp(-delta * 0.006), pointer);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/x-valo');
    const stage = stageRef.current;
    if (!raw || !stage) return;
    stage.setPointersPositions(e.nativeEvent);
    const pos = boardPos();
    if (pos) actions.placePayload(JSON.parse(raw) as PalettePayload, pos);
  };

  const prevStep = stepIndex > 0 ? plan.steps[stepIndex - 1] : null;

  const frames: Frame[] = useMemo(() => {
    if (playback) {
      const from = plan.steps[playback.from]?.elements ?? [];
      const to = plan.steps[playback.to]?.elements ?? [];
      return interpolateSteps(from, to, playback.t);
    }
    return step.elements.map((el) => ({ el, opacity: 1 }));
  }, [playback, plan.steps, step.elements]);

  const liveFrames: Frame[] = useMemo(() => {
    if (!live) return frames;
    return frames.map((f) => (f.el.id === live.id && 'x' in f.el ? { ...f, el: { ...f.el, x: live.x, y: live.y } as BoardEl } : f));
  }, [frames, live]);

  const vision = useMemo(() => {
    const els = liveFrames.map((f) => f.el);
    const agents = els.filter((e): e is AgentEl => e.kind === 'agent');
    const obstacles = settings.showRanges ? collectObstacles(els, map) : [];
    const walls = settings.lineOfSight ? occupancy : null;
    const opacityById = new Map(liveFrames.map((f) => [f.el.id, f.opacity]));

    const cones: { id: string; team: AgentEl['team']; x: number; y: number; range: number; points: number[]; opacity: number }[] = [];
    if (settings.showVision) {
      const cache = coneCache.current;
      if (cache.size > 400) cache.clear();
      const obstacleKey = JSON.stringify(obstacles);
      for (const a of agents) {
        const v = toViewer(a, map);
        if (!v) continue;
        const key = [v.x.toFixed(1), v.y.toFixed(1), v.facing.toFixed(1), v.fov, v.range.toFixed(1), !!walls, map?.uuid, obstacleKey].join('|');
        let points = cache.get(key);
        if (!points) {
          points = castVision(walls, obstacles, v);
          cache.set(key, points);
        }
        cones.push({ id: a.id, team: a.team, x: v.x, y: v.y, range: v.range, points, opacity: opacityById.get(a.id) ?? 1 });
      }
    }

    const byId = new Map(agents.map((a) => [a.id, a]));
    const sightings = settings.showSightLines ? computeSightings(agents, occupancy, obstacles, map, settings.lineOfSight) : [];
    const seenBy = new Map<string, string[]>();
    for (const s of sightings) seenBy.set(s.targetId, [...(seenBy.get(s.targetId) ?? []), s.viewerId]);
    const lines = sightings.flatMap((s) => {
      const from = byId.get(s.viewerId);
      const to = byId.get(s.targetId);
      return from && to ? [{ key: `${s.viewerId}>${s.targetId}`, from, to }] : [];
    });
    const badges = [...seenBy.entries()].flatMap(([targetId, viewers]) => {
      const target = byId.get(targetId);
      return target ? [{ target, count: viewers.length }] : [];
    });
    return { cones, lines, badges };
  }, [liveFrames, settings.showRanges, settings.lineOfSight, settings.showVision, settings.showSightLines, occupancy, map]);

  const ghosts = useMemo(() => {
    if (!settings.onionSkin || !prevStep || playback) return { elements: [] as BoardEl[], paths: [] as { id: string; from: BoardEl; to: BoardEl }[] };
    const currentById = new Map(step.elements.map((el) => [el.id, el]));
    const paths: { id: string; from: BoardEl; to: BoardEl }[] = [];
    const elements: BoardEl[] = [];
    for (const el of prevStep.elements) {
      if (el.kind !== 'agent' && el.kind !== 'ability' && el.kind !== 'object') continue;
      const now = currentById.get(el.id);
      if (now && now.kind === el.kind && Math.hypot(now.x - el.x, now.y - el.y) < 4) continue;
      elements.push(el);
      if (now && now.kind === 'agent') paths.push({ id: el.id, from: el, to: now });
    }
    return { elements, paths };
  }, [settings.onionSkin, prevStep, step.elements, playback]);

  const callouts = useMemo(() => {
    if (!map) return [];
    return map.callouts.map((c, i) => ({ key: i, label: calloutLabel(c.superRegionName, c.regionName), ...worldToBoard(map, c.location.x, c.location.y) }));
  }, [map]);

  const onChangeFor = (id: string) => (patch: Partial<BoardEl>, key?: string) => actions.updateElement(id, patch, key);
  const onLiveFor = (id: string) => (pos: { x: number; y: number } | null) => setLive(pos ? { id, ...pos } : null);
  const agentR = AGENT_RADIUS * settings.iconScale;

  const cursor = spaceDown || tool === 'pan' ? 'grab' : armed ? 'copy' : tool === 'text' ? 'text' : tool === 'select' ? 'default' : 'crosshair';
  const scaleBarPx = metersToBoard(map, 10) * view.scale;

  return (
    <div
      className="board"
      ref={containerRef}
      style={{ cursor }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.w > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          scaleX={view.scale}
          scaleY={view.scale}
          x={view.x}
          y={view.y}
          draggable={spaceDown || tool === 'pan'}
          onDragEnd={(e) => {
            if (e.target === stageRef.current) setView((v) => ({ ...v, x: e.target.x(), y: e.target.y() }));
          }}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerClick={onPointerClick}
          onDblClick={onDblClick}
        >
          <Layer>
            <Group ref={boardRef} x={BOARD / 2} y={BOARD / 2} offsetX={BOARD / 2} offsetY={BOARD / 2} rotation={rot}>
              <Rect ref={bgRef} name="map-bg" width={BOARD} height={BOARD} fill="#0e1822" />
              {mapImg && <KImage name="map-bg" image={mapImg} width={BOARD} height={BOARD} opacity={0.95} />}
              {settings.showCallouts &&
                callouts.map((c) => (
                  <Text
                    key={c.key}
                    x={c.x}
                    y={c.y}
                    width={140}
                    offsetX={70}
                    offsetY={6}
                    rotation={-rot}
                    align="center"
                    text={c.label.toUpperCase()}
                    fontSize={10.5}
                    fontFamily="Barlow Condensed"
                    fontStyle="600"
                    letterSpacing={0.8}
                    fill="rgba(236,232,225,0.78)"
                    shadowColor="#000"
                    shadowBlur={3}
                    shadowOpacity={0.9}
                    listening={false}
                  />
                ))}
            </Group>
          </Layer>
          <Layer>
            <Group x={BOARD / 2} y={BOARD / 2} offsetX={BOARD / 2} offsetY={BOARD / 2} rotation={rot}>
              <Group listening={false}>
                {vision.cones.map((c) => (
                  <Line
                    key={`cone-${c.id}`}
                    points={c.points}
                    closed
                    opacity={c.opacity}
                    fillRadialGradientStartPoint={{ x: c.x, y: c.y }}
                    fillRadialGradientEndPoint={{ x: c.x, y: c.y }}
                    fillRadialGradientStartRadius={0}
                    fillRadialGradientEndRadius={c.range}
                    fillRadialGradientColorStops={[0, withAlpha(TEAM_COLORS[c.team], 0.34), 1, withAlpha(TEAM_COLORS[c.team], 0.06)]}
                    stroke={withAlpha(TEAM_COLORS[c.team], c.id === selectedId ? 0.95 : 0.45)}
                    strokeWidth={c.id === selectedId ? 1.5 : 1}
                    lineJoin="round"
                  />
                ))}
                {vision.lines.map(({ key, from, to }) => (
                  <Line
                    key={`sight-${key}`}
                    points={[from.x, from.y, to.x, to.y]}
                    stroke={withAlpha(TEAM_COLORS[from.team], 0.95)}
                    strokeWidth={1.5}
                    dash={[2, 4]}
                    lineCap="round"
                  />
                ))}
              </Group>
              <Group listening={false} opacity={0.3}>
                {ghosts.elements.map((el) => (
                  <ElementNode
                    key={`ghost-${el.id}`}
                    el={el}
                    rot={rot}
                    scale={settings.iconScale}
                    selected={false}
                    interactive={false}
                    opacity={1}
                    map={map}
                    showRanges={false}
                    onChange={() => {}}
                  />
                ))}
              </Group>
              {ghosts.paths.map(({ id, from, to }) =>
                from.kind === 'agent' && to.kind === 'agent' ? (
                  <Arrow
                    key={`path-${id}`}
                    points={[from.x, from.y, to.x, to.y]}
                    stroke={withAlpha(TEAM_COLORS[to.team], 0.75)}
                    fill={withAlpha(TEAM_COLORS[to.team], 0.75)}
                    strokeWidth={2}
                    dash={[6, 5]}
                    pointerLength={7}
                    pointerWidth={7}
                    listening={false}
                  />
                ) : null,
              )}
              {frames.map(({ el, opacity }) => (
                <ElementNode
                  key={el.id}
                  el={el}
                  rot={rot}
                  scale={settings.iconScale}
                  selected={!playback && el.id === selectedId}
                  interactive={interactive}
                  opacity={opacity}
                  map={map}
                  showRanges={settings.showRanges}
                  onChange={onChangeFor(el.id)}
                  onLiveMove={onLiveFor(el.id)}
                />
              ))}
              {vision.badges.map(({ target, count }) => (
                <Group key={`badge-${target.id}`} x={target.x} y={target.y} rotation={-rot} listening={false}>
                  <Circle radius={agentR + 5} stroke="#ffd166" strokeWidth={2} shadowColor="#ffd166" shadowBlur={8} shadowOpacity={0.8} />
                  <Group y={-agentR - 20}>
                    <Rect
                      x={count > 1 ? -36 : -22}
                      width={count > 1 ? 72 : 44}
                      height={13}
                      cornerRadius={2}
                      fill={count > 1 ? '#ffd166' : 'rgba(15,25,35,0.9)'}
                      stroke="#ffd166"
                      strokeWidth={1}
                    />
                    <Text
                      x={count > 1 ? -36 : -22}
                      width={count > 1 ? 72 : 44}
                      y={2}
                      align="center"
                      text={count > 1 ? `CROSSFIRE ×${count}` : 'SPOTTED'}
                      fontSize={9.5}
                      fontFamily="Barlow Condensed"
                      fontStyle="bold"
                      letterSpacing={0.6}
                      fill={count > 1 ? '#0f1923' : '#ffd166'}
                    />
                  </Group>
                </Group>
              ))}
              {draft?.kind === 'pen' && (
                <Line points={draft.points} stroke={color} strokeWidth={strokeWidth} tension={0.45} lineCap="round" lineJoin="round" dash={dashed ? [strokeWidth * 2.5, strokeWidth * 2] : undefined} listening={false} />
              )}
              {draft?.kind === 'line' &&
                (arrow ? (
                  <Arrow points={draft.points} stroke={color} fill={color} strokeWidth={strokeWidth} pointerLength={8 + strokeWidth * 1.6} pointerWidth={8 + strokeWidth * 1.6} lineCap="round" dash={dashed ? [strokeWidth * 2.5, strokeWidth * 2] : undefined} listening={false} />
                ) : (
                  <Line points={draft.points} stroke={color} strokeWidth={strokeWidth} lineCap="round" dash={dashed ? [strokeWidth * 2.5, strokeWidth * 2] : undefined} listening={false} />
                ))}
              {draft?.kind === 'area' && (
                <Circle x={draft.x} y={draft.y} radius={draft.r} fill={withAlpha(color, 0.22)} stroke={color} strokeWidth={2} listening={false} />
              )}
            </Group>
          </Layer>
        </Stage>
      )}

      {textEdit && (
        <input
          className="board-text-input"
          autoFocus
          style={{ left: textEdit.screenX, top: textEdit.screenY - 16, color }}
          value={textEdit.value}
          placeholder="Type a note…"
          onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitText();
            if (e.key === 'Escape') setTextEdit(null);
            e.stopPropagation();
          }}
          onBlur={commitText}
        />
      )}

      {map && (
        <div className="board-scale" aria-hidden>
          <div className="board-scale-bar" style={{ width: scaleBarPx }} />
          <span>10 m</span>
        </div>
      )}

      <div className="board-view-controls">
        <button className="icon-btn" {...tipFor('zoomOut', 'top')} onClick={() => zoomAt(1 / 1.25)}>
          <Minus size={16} />
        </button>
        <span className="board-zoom">{Math.round((view.scale / ((Math.min(size.w, size.h) / BOARD) * 0.94 || 1)) * 100)}%</span>
        <button className="icon-btn" {...tipFor('zoomIn', 'top')} onClick={() => zoomAt(1.25)}>
          <Plus size={16} />
        </button>
        <button className="icon-btn" {...tipFor('fit', 'top')} onClick={fit}>
          <Maximize size={15} />
        </button>
      </div>

      <div className="board-rotate-controls" role="group" aria-label="Map rotation">
        <button className="icon-btn" {...tipFor('rotateCcw', 'top')} onClick={() => actions.setSettings({ rotation: (((rot + 270) % 360) as Rotation) })}>
          <RotateCcw size={15} />
        </button>
        {ROTATIONS.map((deg, i) => (
          <button
            key={deg}
            className={`rotate-preset ${rot === deg ? 'on' : ''}`}
            aria-pressed={rot === deg}
            {...tip(`Rotate to ${deg}°`, ROTATION_SHORTCUTS[i], 'top')}
            onClick={() => actions.setSettings({ rotation: deg })}
          >
            {deg}°
          </button>
        ))}
        <button className="icon-btn" {...tipFor('rotateCw', 'top')} onClick={() => actions.setSettings({ rotation: (((rot + 90) % 360) as Rotation) })}>
          <RotateCw size={15} />
        </button>
      </div>

      {armed && <div className="board-hint">Click the map to place · Shift+click to place several · Esc to cancel</div>}
      {playback && <div className="board-hint board-hint--live">Playing step {playback.to + 1} of {plan.steps.length}</div>}
    </div>
  );
}
