import { Arrow, Circle, Group, Image as KImage, Line, Rect, RegularPolygon, Text, Wedge } from 'react-konva';
import type Konva from 'konva';
import { useCanvasImage } from '../../lib/canvasImage';
import type { AbilityEl, AgentEl, AreaEl, BoardEl, ImageEl, ObjectEl, PolygonEl, RectEl, StrokeEl, TextEl } from '../../types';
import type { ApiMap } from '../../api/valorant';
import { useGameData } from '../../store/gameData';
import { TEAM_COLORS, withAlpha } from '../../lib/colors';
import { boardToMeters, metersToBoard } from '../../lib/geo';
import { OBJECT_ICON } from '../../lib/objects';
import { DEFAULT_CONE_ANGLE, DEFAULT_RECT_WIDTH } from '../../lib/abilityPresets';

export interface NodeProps<T extends BoardEl> {
  el: T;
  /** Board rotation in degrees; icons counter-rotate so they stay upright. */
  rot: number;
  scale: number;
  selected: boolean;
  interactive: boolean;
  opacity: number;
  map?: ApiMap;
  showRanges: boolean;
  onChange: (patch: Partial<BoardEl>, coalesceKey?: string) => void;
  /** Reports the in-progress drag position so dependent overlays (vision) can follow live. */
  onLiveMove?: (pos: { x: number; y: number } | null) => void;
}

export const AGENT_RADIUS = 15;

type DragEvt = Konva.KonvaEventObject<DragEvent>;

function moveOnDragEnd(onChange: NodeProps<BoardEl>['onChange']) {
  return (e: DragEvt) => {
    // Drag events bubble from child handles; only react to the token itself.
    if (e.target !== e.currentTarget) return;
    onChange({ x: e.target.x(), y: e.target.y() });
  };
}

const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, cursor: string) => {
  const c = e.target.getStage()?.container();
  if (c) c.style.cursor = cursor;
};

export function AgentNode({ el, rot, scale, selected, interactive, opacity, onChange, onLiveMove }: NodeProps<AgentEl>) {
  const agent = useGameData((s) => s.agentsById[el.agentId]);
  const img = useCanvasImage(agent?.displayIconSmall);
  const r = AGENT_RADIUS * scale;
  const color = TEAM_COLORS[el.team];
  // The token counter-rotates against the board, so board-space angles shift by +rot locally.
  const localFacing = el.facing === undefined ? null : el.facing + rot;
  const facingRad = localFacing === null ? 0 : (localFacing * Math.PI) / 180;
  const handleDist = r + 28;

  const onAim = (e: DragEvt) => {
    e.cancelBubble = true;
    const { x, y } = e.target.position();
    const local = (Math.atan2(y, x) * 180) / Math.PI;
    onChange({ facing: Math.round(local - rot), vision: el.vision ?? true }, `aim-${el.id}`);
  };

  return (
    <Group
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      rotation={-rot}
      opacity={opacity}
      draggable={interactive}
      onDragMove={(e) => {
        if (e.target === e.currentTarget) onLiveMove?.({ x: e.target.x(), y: e.target.y() });
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        onChange({ x: e.target.x(), y: e.target.y() });
        onLiveMove?.(null);
      }}
    >
      {localFacing !== null && (
        <RegularPolygon
          sides={3}
          radius={5 * scale}
          x={Math.cos(facingRad) * (r + 5 * scale)}
          y={Math.sin(facingRad) * (r + 5 * scale)}
          rotation={localFacing + 90}
          fill={color}
          stroke="#0f1923"
          strokeWidth={1}
          listening={false}
        />
      )}
      <Circle radius={r + 2.5} fill={color} shadowColor="#000" shadowBlur={8} shadowOpacity={0.55} />
      <Circle radius={r} fill={el.team === 'ally' ? '#0c2b2a' : '#2d0f15'} />
      <Group clipFunc={(ctx) => ctx.arc(0, 0, r, 0, Math.PI * 2, false)}>
        {img && <KImage image={img} x={-r} y={-r} width={r * 2} height={r * 2} />}
      </Group>
      {selected && (
        <Circle name="selection-ui" radius={r + 7} stroke="#ece8e1" strokeWidth={1.5} dash={[4, 3]} listening={false} />
      )}
      {selected && interactive && (
        <>
          <Line
            name="selection-ui"
            points={[
              Math.cos(facingRad) * (r + 9),
              Math.sin(facingRad) * (r + 9),
              Math.cos(facingRad) * handleDist,
              Math.sin(facingRad) * handleDist,
            ]}
            stroke="#ece8e1"
            strokeWidth={1.5}
            dash={[3, 3]}
            listening={false}
          />
          <Circle
            name="selection-ui"
            x={Math.cos(facingRad) * handleDist}
            y={Math.sin(facingRad) * handleDist}
            radius={6}
            fill="#ece8e1"
            stroke={color}
            strokeWidth={2}
            draggable
            onDragStart={(e) => (e.cancelBubble = true)}
            onDragMove={onAim}
            onDragEnd={(e) => (e.cancelBubble = true)}
            onMouseEnter={(e) => setCursor(e, 'grab')}
            onMouseLeave={(e) => setCursor(e, '')}
          />
        </>
      )}
    </Group>
  );
}

export function AbilityNode({ el, rot, scale, selected, interactive, opacity, map, showRanges, onChange, onLiveMove }: NodeProps<AbilityEl>) {
  const agent = useGameData((s) => s.agentsById[el.agentId]);
  const ability = agent?.abilities.find((a) => a.slot === el.slot);
  const img = useCanvasImage(ability?.displayIcon);
  const color = TEAM_COLORS[el.team];
  const half = 12 * scale;
  const len = metersToBoard(map, el.size);
  const thickness = Math.max(3, metersToBoard(map, 1));
  const rad = (el.rotation * Math.PI) / 180;
  const handleDist = el.shape === 'wall' ? len / 2 : len;
  const showOverlay = showRanges && el.shape !== 'none';

  const onHandleMove = (e: DragEvt) => {
    e.cancelBubble = true;
    const { x, y } = e.target.position();
    const dist = Math.hypot(x, y);
    const meters = boardToMeters(map, el.shape === 'wall' ? dist * 2 : dist);
    onChange(
      {
        size: Math.round(Math.max(0.5, Math.min(80, meters)) * 10) / 10,
        rotation: Math.round((Math.atan2(y, x) * 180) / Math.PI),
      },
      `handle-${el.id}`,
    );
  };

  return (
    <Group
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      opacity={opacity}
      draggable={interactive}
      onDragMove={(e) => {
        if (e.target === e.currentTarget && el.blocksVision) onLiveMove?.({ x: e.target.x(), y: e.target.y() });
      }}
      onDragEnd={(e) => {
        if (e.target !== e.currentTarget) return;
        onChange({ x: e.target.x(), y: e.target.y() });
        onLiveMove?.(null);
      }}
    >
      {showOverlay && el.shape === 'circle' && (
        <Circle
          radius={len}
          fill={withAlpha(color, el.blocksVision ? 0.42 : 0.2)}
          stroke={withAlpha(color, 0.9)}
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
      )}
      {showOverlay && el.shape === 'wall' && (
        <Rect
          width={len}
          height={thickness}
          offsetX={len / 2}
          offsetY={thickness / 2}
          rotation={el.rotation}
          fill={withAlpha(color, 0.6)}
          stroke={color}
          strokeWidth={1}
          cornerRadius={thickness / 2}
          listening={false}
        />
      )}
      {showOverlay && el.shape === 'cone' && (
        <Wedge
          radius={len}
          angle={el.angle ?? DEFAULT_CONE_ANGLE}
          rotation={el.rotation - (el.angle ?? DEFAULT_CONE_ANGLE) / 2}
          fill={withAlpha(color, 0.2)}
          stroke={withAlpha(color, 0.9)}
          strokeWidth={1.5}
          dash={[6, 4]}
          listening={false}
        />
      )}
      {showOverlay && el.shape === 'rect' && (() => {
        const w = metersToBoard(map, el.width ?? DEFAULT_RECT_WIDTH);
        return (
          <Rect
            width={len}
            height={w}
            offsetY={w / 2}
            rotation={el.rotation}
            fill={withAlpha(color, el.blocksVision ? 0.3 : 0.2)}
            stroke={withAlpha(color, 0.9)}
            strokeWidth={1.5}
            dash={el.blocksVision ? undefined : [6, 4]}
            listening={false}
          />
        );
      })()}
      {showOverlay && el.shape === 'line' && (
        <>
          <Line
            points={[0, 0, Math.cos(rad) * len, Math.sin(rad) * len]}
            stroke={color}
            strokeWidth={el.blocksVision ? thickness : 2}
            opacity={el.blocksVision ? 0.6 : 1}
            lineCap="round"
            shadowColor="#000"
            shadowBlur={3}
            shadowOpacity={0.7}
            listening={false}
          />
          <Circle x={Math.cos(rad) * len} y={Math.sin(rad) * len} radius={3} fill={color} stroke="#0f1923" strokeWidth={1} listening={false} />
        </>
      )}
      <Group rotation={-rot}>
        <Rect
          x={-half}
          y={-half}
          width={half * 2}
          height={half * 2}
          cornerRadius={4 * scale}
          fill="#0f1923"
          stroke={color}
          strokeWidth={2}
          shadowColor="#000"
          shadowBlur={6}
          shadowOpacity={0.5}
        />
        {img && <KImage image={img} x={-half * 0.72} y={-half * 0.72} width={half * 1.44} height={half * 1.44} />}
      </Group>
      {selected && (
        <Rect
          name="selection-ui"
          x={-half - 5}
          y={-half - 5}
          width={half * 2 + 10}
          height={half * 2 + 10}
          rotation={-rot}
          cornerRadius={6}
          stroke="#ece8e1"
          strokeWidth={1.5}
          dash={[4, 3]}
          listening={false}
        />
      )}
      {selected && showOverlay && interactive && (
        <Circle
          name="selection-ui"
          x={Math.cos(rad) * handleDist}
          y={Math.sin(rad) * handleDist}
          radius={6}
          fill="#ece8e1"
          stroke={color}
          strokeWidth={2}
          draggable
          onDragStart={(e) => (e.cancelBubble = true)}
          onDragMove={onHandleMove}
          onDragEnd={(e) => (e.cancelBubble = true)}
          onMouseEnter={(e) => setCursor(e, 'grab')}
          onMouseLeave={(e) => setCursor(e, '')}
        />
      )}
    </Group>
  );
}

export function ObjectNode({ el, rot, scale, selected, interactive, opacity, onChange }: NodeProps<ObjectEl>) {
  const img = useCanvasImage(OBJECT_ICON[el.object]);
  const s = 26 * scale;
  return (
    <Group
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      rotation={-rot}
      opacity={opacity}
      draggable={interactive}
      onDragEnd={moveOnDragEnd(onChange)}
    >
      {img && <KImage image={img} x={-s / 2} y={-s / 2} width={s} height={s} shadowColor="#000" shadowBlur={6} shadowOpacity={0.5} />}
      {selected && <Circle name="selection-ui" radius={s / 2 + 6} stroke="#ece8e1" strokeWidth={1.5} dash={[4, 3]} listening={false} />}
    </Group>
  );
}

export function StrokeNode({ el, selected, interactive, opacity, onChange }: NodeProps<StrokeEl>) {
  const common = {
    id: el.id,
    name: 'element',
    points: el.points,
    stroke: el.color,
    strokeWidth: el.width,
    lineCap: 'round' as const,
    lineJoin: 'round' as const,
    tension: el.smooth ? 0.45 : 0,
    dash: el.dashed ? [el.width * 2.5, el.width * 2] : undefined,
    hitStrokeWidth: Math.max(14, el.width + 10),
    opacity,
    draggable: interactive,
    shadowColor: selected ? '#ffffff' : '#000000',
    shadowBlur: selected ? 10 : 4,
    shadowOpacity: selected ? 0.9 : 0.45,
    onDragEnd: (e: DragEvt) => {
      const node = e.target;
      const dx = node.x();
      const dy = node.y();
      // Points are absolute; bake the drag offset in and reset the node origin.
      node.position({ x: 0, y: 0 });
      onChange({ points: el.points.map((p, i) => p + (i % 2 === 0 ? dx : dy)) });
    },
  };
  return el.arrow ? (
    <Arrow {...common} fill={el.color} pointerLength={8 + el.width * 1.6} pointerWidth={8 + el.width * 1.6} />
  ) : (
    <Line {...common} />
  );
}

export function TextNode({ el, rot, selected, interactive, opacity, onChange }: NodeProps<TextEl>) {
  return (
    <Group id={el.id} name="element" x={el.x} y={el.y} rotation={-rot} opacity={opacity} draggable={interactive} onDragEnd={moveOnDragEnd(onChange)}>
      <Text
        text={el.text}
        fill={el.color}
        fontSize={el.size}
        fontFamily="Barlow Condensed"
        fontStyle="bold"
        letterSpacing={0.5}
        shadowColor={selected ? '#ffffff' : '#000000'}
        shadowBlur={selected ? 10 : 5}
        shadowOpacity={0.9}
      />
    </Group>
  );
}

export function AreaNode({ el, selected, interactive, opacity, onChange }: NodeProps<AreaEl>) {
  return (
    <Circle
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      radius={el.radius}
      fill={withAlpha(el.color, 0.22)}
      stroke={selected ? '#ece8e1' : el.color}
      strokeWidth={2}
      dash={selected ? [6, 4] : undefined}
      opacity={opacity}
      draggable={interactive}
      onDragEnd={moveOnDragEnd(onChange)}
    />
  );
}

export function RectNode({ el, selected, interactive, opacity, onChange }: NodeProps<RectEl>) {
  return (
    <Rect
      id={el.id}
      name="element"
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      fill={withAlpha(el.color, 0.22)}
      stroke={selected ? '#ece8e1' : el.color}
      strokeWidth={2}
      strokeScaleEnabled={false}
      dash={selected ? [6, 4] : undefined}
      opacity={opacity}
      draggable={interactive}
      onDragEnd={moveOnDragEnd(onChange)}
    />
  );
}

export function PolygonNode({ el, selected, interactive, opacity, onChange }: NodeProps<PolygonEl>) {
  return (
    <Line
      id={el.id}
      name="element"
      points={el.points}
      closed
      fill={withAlpha(el.color, 0.22)}
      stroke={selected ? '#ece8e1' : el.color}
      strokeWidth={2}
      lineJoin="round"
      dash={selected ? [6, 4] : undefined}
      opacity={opacity}
      draggable={interactive}
      onDragEnd={(e: DragEvt) => {
        const node = e.target;
        const dx = node.x();
        const dy = node.y();
        node.position({ x: 0, y: 0 });
        onChange({ points: el.points.map((p, i) => p + (i % 2 === 0 ? dx : dy)) });
      }}
    />
  );
}

export function ImageNode({ el, rot, selected, interactive, opacity, onChange }: NodeProps<ImageEl>) {
  const img = useCanvasImage(el.src);
  return (
    <Group id={el.id} name="element" x={el.x} y={el.y} rotation={-rot} opacity={opacity} draggable={interactive} onDragEnd={moveOnDragEnd(onChange)}>
      <Rect
        x={-el.width / 2}
        y={-el.height / 2}
        width={el.width}
        height={el.height}
        fill="#0b131b"
        stroke={selected ? '#ece8e1' : 'rgba(236,232,225,0.35)'}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        shadowColor="#000"
        shadowBlur={10}
        shadowOpacity={0.55}
      />
      {img && <KImage image={img} x={-el.width / 2} y={-el.height / 2} width={el.width} height={el.height} />}
    </Group>
  );
}

export function ElementNode(props: NodeProps<BoardEl>) {
  const { el } = props;
  switch (el.kind) {
    case 'agent':
      return <AgentNode {...props} el={el} />;
    case 'ability':
      return <AbilityNode {...props} el={el} />;
    case 'object':
      return <ObjectNode {...props} el={el} />;
    case 'stroke':
      return <StrokeNode {...props} el={el} />;
    case 'text':
      return <TextNode {...props} el={el} />;
    case 'area':
      return <AreaNode {...props} el={el} />;
    case 'rect':
      return <RectNode {...props} el={el} />;
    case 'polygon':
      return <PolygonNode {...props} el={el} />;
    case 'image':
      return <ImageNode {...props} el={el} />;
  }
}
