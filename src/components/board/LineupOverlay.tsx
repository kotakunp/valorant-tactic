import { Arrow, Circle, Group, Image as KImage, Rect } from 'react-konva';
import { useCanvasImage } from '../../lib/canvasImage';
import { useGameData } from '../../store/gameData';
import type { AbilitySlot, Point } from '../../types';

const GOLD = '#ffd166';

interface MarkerProps {
  id: string;
  agentId: string;
  slot: AbilitySlot;
  stand: Point | null;
  land: Point | null;
  rot: number;
  active: boolean;
  dimmed: boolean;
}

/** One lineup on the board: where to stand, the throw, and where it lands. */
export function LineupMarker({ id, agentId, slot, stand, land, rot, active, dimmed }: MarkerProps) {
  const agent = useGameData((s) => s.agentsById[agentId]);
  const ability = agent?.abilities.find((a) => a.slot === slot);
  const agentImg = useCanvasImage(agent?.displayIconSmall);
  const abilityImg = useCanvasImage(ability?.displayIcon);
  const opacity = dimmed ? 0.4 : 1;
  const r = active ? 11 : 9;
  const half = active ? 11 : 9;

  return (
    <Group opacity={opacity} name="lineup" lineupId={id}>
      {stand && land && (
        <Arrow
          points={[stand.x, stand.y, land.x, land.y]}
          stroke={GOLD}
          fill={GOLD}
          strokeWidth={active ? 2 : 1.5}
          dash={[5, 4]}
          pointerLength={7}
          pointerWidth={7}
          shadowColor="#000"
          shadowBlur={3}
          shadowOpacity={0.8}
          listening={false}
        />
      )}
      {stand && (
        <Group x={stand.x} y={stand.y} rotation={-rot}>
          <Circle radius={r + 2} fill={GOLD} shadowColor="#000" shadowBlur={6} shadowOpacity={0.6} />
          <Circle radius={r} fill="#0f1923" />
          <Group clipFunc={(ctx) => ctx.arc(0, 0, r, 0, Math.PI * 2, false)}>
            {agentImg && <KImage image={agentImg} x={-r} y={-r} width={r * 2} height={r * 2} listening={false} />}
          </Group>
        </Group>
      )}
      {land && (
        <Group x={land.x} y={land.y} rotation={-rot}>
          <Rect x={-half} y={-half} width={half * 2} height={half * 2} cornerRadius={3} fill="#0f1923" stroke={GOLD} strokeWidth={2} shadowColor="#000" shadowBlur={6} shadowOpacity={0.6} />
          {abilityImg && <KImage image={abilityImg} x={-half * 0.75} y={-half * 0.75} width={half * 1.5} height={half * 1.5} listening={false} />}
        </Group>
      )}
    </Group>
  );
}
