import { Circle, Group, Label, Line, Tag, Text } from 'react-konva';
import { useCollab, type Peer } from '../../collab/session';
import type { BoardEl } from '../../types';

/** Rough on-board footprint of a piece, for drawing another user's selection around it. */
function ring(el: BoardEl, agentR: number, drag: Peer['drag']) {
  const at = drag && drag.id === el.id ? drag : null;
  switch (el.kind) {
    case 'agent':
      return { x: at?.x ?? el.x, y: at?.y ?? el.y, r: agentR + 7 };
    case 'ability':
    case 'object':
      return { x: at?.x ?? el.x, y: at?.y ?? el.y, r: 18 };
    case 'text':
      return { x: el.x, y: el.y, r: 18 };
    case 'area':
      return { x: el.x, y: el.y, r: el.radius + 6 };
    case 'rect':
      return { x: el.x + el.width / 2, y: el.y + el.height / 2, r: Math.hypot(el.width, el.height) / 2 + 6 };
    case 'image':
      return { x: el.x, y: el.y, r: Math.hypot(el.width, el.height) / 2 + 6 };
    case 'stroke':
    case 'polygon': {
      const xs = el.points.filter((_, i) => i % 2 === 0);
      const ys = el.points.filter((_, i) => i % 2 === 1);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      const y0 = Math.min(...ys);
      const y1 = Math.max(...ys);
      return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: Math.hypot(x1 - x0, y1 - y0) / 2 + 8 };
    }
  }
}

const ARROW = [0, 0, 0, 17, 4.6, 12.8, 8, 20, 11, 18.7, 7.8, 11.8, 13.5, 11.8];

/** Other people's cursors and selections on the step you're looking at. */
export function PeerOverlay({ rot, zoom, stepIndex, elements, agentR }: { rot: number; zoom: number; stepIndex: number; elements: BoardEl[]; agentR: number }) {
  const peers = useCollab((s) => s.peers);
  const here = peers.filter((p) => p.step === stepIndex);
  if (!here.length) return null;
  const byId = new Map(elements.map((e) => [e.id, e]));
  const k = 1 / zoom;
  return (
    <Group listening={false}>
      {here.map((p) => {
        const el = p.selected ? byId.get(p.selected) : undefined;
        const r = el ? ring(el, agentR, p.drag) : null;
        return r ? <Circle key={`sel-${p.id}`} x={r.x} y={r.y} radius={r.r} stroke={p.color} strokeWidth={2 * Math.min(k, 1.5)} dash={[5, 4]} opacity={0.95} /> : null;
      })}
      {here.map((p) =>
        p.cursor ? (
          <Group key={`cur-${p.id}`} x={p.cursor.x} y={p.cursor.y} rotation={-rot} scaleX={k} scaleY={k}>
            <Line points={ARROW} closed fill={p.color} stroke="#0f1923" strokeWidth={1.3} lineJoin="round" shadowColor="#000" shadowBlur={3} shadowOpacity={0.5} />
            <Label x={13} y={18}>
              <Tag fill={p.color} cornerRadius={3} />
              <Text text={p.name} padding={4} fontSize={11.5} fontFamily="Barlow" fontStyle="600" fill="#0f1923" />
            </Label>
          </Group>
        ) : null,
      )}
    </Group>
  );
}
