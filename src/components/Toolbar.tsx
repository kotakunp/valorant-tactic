import { Circle, Eraser, Hand, ImagePlus, MousePointer2, MoveUpRight, Pencil, Pentagon, Spline, Square, Type } from 'lucide-react';
import { usePlan } from '../store/planStore';
import { addImageFiles } from '../lib/actions';
import { pickImageFiles } from '../lib/images';
import { DRAW_COLORS, STROKE_WIDTHS } from '../lib/colors';
import { SHORTCUTS, tip, tipFor, type ShortcutId } from '../lib/shortcuts';
import type { Tool } from '../types';

const TOOLS: { tool: Tool; Icon: typeof Pencil }[] = [
  { tool: 'select', Icon: MousePointer2 },
  { tool: 'pan', Icon: Hand },
  { tool: 'pen', Icon: Pencil },
  { tool: 'line', Icon: MoveUpRight },
  { tool: 'area', Icon: Circle },
  { tool: 'rect', Icon: Square },
  { tool: 'polygon', Icon: Pentagon },
  { tool: 'text', Icon: Type },
  { tool: 'eraser', Icon: Eraser },
];

export default function Toolbar() {
  const tool = usePlan((s) => s.tool);
  const color = usePlan((s) => s.color);
  const strokeWidth = usePlan((s) => s.strokeWidth);
  const arrow = usePlan((s) => s.arrow);
  const dashed = usePlan((s) => s.dashed);
  const a = usePlan.getState();

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      {TOOLS.map(({ tool: t, Icon }) => (
        <button key={t} className={`tool ${tool === t ? 'on' : ''}`} onClick={() => a.setTool(t)} aria-pressed={tool === t} {...tipFor(t as ShortcutId, 'right')}>
          <Icon size={18} />
        </button>
      ))}
      <button className="tool" onClick={() => pickImageFiles(true).then(addImageFiles)} {...tipFor('image', 'right')}>
        <ImagePlus size={18} />
      </button>
      <div className="toolbar-sep" />
      {DRAW_COLORS.map((c) => (
        <button
          key={c}
          className={`swatch ${color === c ? 'on' : ''}`}
          style={{ background: c }}
          onClick={() => a.setColor(c)}
          aria-pressed={color === c}
          {...tip(`Color ${c}`, 'color', 'right')}
        />
      ))}
      <div className="toolbar-sep" />
      {STROKE_WIDTHS.map((w) => (
        <button key={w} className={`tool ${strokeWidth === w ? 'on' : ''}`} onClick={() => a.setStrokeWidth(w)} aria-pressed={strokeWidth === w} {...tip(`Stroke ${w}px`, 'width', 'right')}>
          <span className="width-dot" style={{ width: w + 3, height: w + 3 }} />
        </button>
      ))}
      <div className="toolbar-sep" />
      <button className={`tool ${arrow ? 'on' : ''}`} onClick={() => a.setArrow(!arrow)} aria-pressed={arrow} {...tip(`${SHORTCUTS.arrow.label} (${arrow ? 'on' : 'off'})`, 'arrow', 'right')}>
        <MoveUpRight size={18} />
      </button>
      <button className={`tool ${dashed ? 'on' : ''}`} onClick={() => a.setDashed(!dashed)} aria-pressed={dashed} {...tip(`${SHORTCUTS.dashed.label} (${dashed ? 'on' : 'off'})`, 'dashed', 'right')}>
        <Spline size={18} strokeDasharray="3 3" />
      </button>
    </div>
  );
}
