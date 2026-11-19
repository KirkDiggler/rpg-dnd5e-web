/**
 * A BEHAVIOUR'S MACHINE, DRAWN (rpg-project#995): a box per state, an arrow
 * per step that changes state, what the creature does while it stays put
 * written inside the box. Hand-laid SVG from `layoutMachine`; the words in
 * it are the engine's plain words (`GetMachineWords`, rpg-project#1015), or
 * its ids and connection words without them (`machineView`), and every
 * mark's full sentences are in the detail pane.
 *
 * Every box and arrow is a mark, as the places marks are: focusable, named,
 * chosen by click, Enter or Space; the chosen one is drawn heavier. The
 * drawing scrolls sideways in its own frame when it is wider than the room.
 */
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';
import {
  alsoText,
  boxName,
  machineMarkKey,
  pieceName,
  type LaidBox,
  type LaidPiece,
  type MachineLayout,
} from './machineLayout';
import { useRevealable } from './useReveal';

/** An engine refusal of one step, shown on its box or arrow
 * (rpg-project#1018). */
export interface MarkRefusal {
  state: string;
  index: number;
  message: string;
}

const refusedText = (list: readonly MarkRefusal[] | undefined): string[] =>
  (list ?? []).map((r) => `Refused: ${r.message}`);

export function MachineDrawing({
  routine,
  layout,
  selected,
  onSelect,
  refused,
  onOpenRefused,
}: {
  routine: string;
  layout: MachineLayout;
  /** The marked box's or arrow's id. */
  selected: string | null;
  onSelect(id: string): void;
  /** The engine's refusals of steps, by the box or arrow that draws the
   * step. */
  refused?: ReadonlyMap<string, readonly MarkRefusal[]>;
  /** Open a refused step's row in its state's Edit tab. */
  onOpenRefused?(state: string, index: number): void;
}): React.JSX.Element {
  const choose = (id: string) => ({
    onClick: (event: ReactMouseEvent<SVGElement>): void => {
      event.stopPropagation();
      onSelect(id);
    },
    onKeyDown: (event: ReactKeyboardEvent<SVGElement>): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      onSelect(id);
    },
  });
  const marker = `es-machine-arrow-${routine}`;
  return (
    <div
      className="es-machine"
      data-machine={routine}
      data-scroll-pane=""
      role="group"
      aria-label={`The machine of ${routine}`}
    >
      <svg
        className="es-machine-svg"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        <defs>
          <marker
            id={marker}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="es-machine-arrowhead" />
          </marker>
        </defs>
        {layout.memory.length > 0 && (
          // What the machine remembers (encounter v0.228.0): each flag
          // with its starting value, its sentence on hover. Static.
          <g className="es-machine-memory" data-memory="">
            {layout.memory.map((m, i) => (
              <text
                key={i}
                className="es-machine-line"
                data-muted={m.statement ? undefined : true}
                data-flag={m.flag ?? undefined}
                x={m.x}
                y={m.y}
              >
                {m.statement && <title>{m.statement.sentence}</title>}
                {m.text}
              </text>
            ))}
          </g>
        )}
        {layout.pieces.map((piece) => (
          <Piece
            key={piece.id}
            routine={routine}
            piece={piece}
            marker={marker}
            selected={selected === piece.id}
            refused={refused?.get(piece.id)}
            choose={choose(piece.id)}
          />
        ))}
        {layout.boxes.map((box) => (
          <Box
            key={box.id}
            routine={routine}
            box={box}
            selected={selected === box.id}
            refused={refused?.get(box.id)}
            choose={choose(box.id)}
          />
        ))}
        {refused && refused.size > 0 && (
          // The visible "refused" marks, apart from the marks they sit on so
          // no control is nested in another: each opens its first step's
          // row in Edit.
          <g className="es-machine-refusals">
            {[...refused.entries()].map(([id, list]) => {
              const box = layout.boxes.find((b) => b.id === id);
              const piece = layout.pieces.find((p) => p.id === id);
              const at = box
                ? {
                    x: box.rect.x + box.rect.w,
                    y: box.rect.y - 4,
                    anchor: 'end' as const,
                  }
                : piece
                  ? {
                      x: piece.label.x,
                      y: piece.label.y - 14,
                      anchor: piece.label.anchor,
                    }
                  : null;
              const first = list[0];
              if (!at || !first) return null;
              const words = refusedText(list).join(' ');
              return (
                <text
                  key={id}
                  className="es-machine-refused-mark"
                  data-refused-mark={id}
                  x={at.x}
                  y={at.y}
                  textAnchor={at.anchor}
                  role="button"
                  tabIndex={0}
                  aria-label={`Refused step ${first.index + 1} in ${first.state}: open it in Edit`}
                  aria-description={words}
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenRefused?.(first.state, first.index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenRefused?.(first.state, first.index);
                  }}
                >
                  <title>{refusedText(list).join('\n')}</title>
                  refused
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

type Choose = {
  onClick(event: ReactMouseEvent<SVGElement>): void;
  onKeyDown(event: ReactKeyboardEvent<SVGElement>): void;
};

function Box({
  routine,
  box,
  selected,
  refused,
  choose,
}: {
  routine: string;
  box: LaidBox;
  selected: boolean;
  refused?: readonly MarkRefusal[];
  choose: Choose;
}): React.JSX.Element {
  const { rect } = box;
  // A jump from a sentence lands here: an SVG mark takes focus and scrolls
  // like any other revealed item.
  const reveal = useRevealable(machineMarkKey(routine, box.id));
  return (
    <g
      ref={(element) => reveal(element as unknown as HTMLElement | null)}
      className="es-machine-state"
      data-state={box.state.id}
      data-mark={box.id}
      data-selected={selected || undefined}
      data-final={box.state.final || undefined}
      data-no-way-out={box.state.noWayOut || undefined}
      data-refused={refused?.length ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={boxName(box)}
      aria-description={refusedText(refused).join(' ') || undefined}
      {...choose}
    >
      <title>
        {[
          ...refusedText(refused),
          ...box.statements.map((st) => st.sentence),
          alsoText(box.also),
        ]
          .filter(Boolean)
          .join('\n')}
      </title>
      <rect
        className="es-machine-box"
        x={rect.x}
        y={rect.y}
        width={rect.w}
        height={rect.h}
        rx={6}
      />
      <text
        className="es-machine-title"
        x={box.title.x}
        y={box.title.y}
        aria-hidden="true"
      >
        {box.title.text}
      </text>
      {box.pills.map((pill) => (
        <g
          key={pill.kind}
          className="es-machine-pill"
          data-pill={pill.kind}
          aria-hidden="true"
        >
          <rect
            x={pill.rect.x}
            y={pill.rect.y}
            width={pill.rect.w}
            height={pill.rect.h}
            rx={9}
          />
          <text x={pill.x} y={pill.y} textAnchor="middle">
            {pill.text}
          </text>
        </g>
      ))}
      {box.lines.map((line, i) => (
        <text
          key={i}
          className="es-machine-line"
          data-muted={line.muted || undefined}
          x={line.x}
          y={line.y}
          aria-hidden="true"
        >
          {line.text}
        </text>
      ))}
    </g>
  );
}

function Piece({
  routine,
  piece,
  marker,
  selected,
  refused,
  choose,
}: {
  routine: string;
  piece: LaidPiece;
  marker: string;
  selected: boolean;
  refused?: readonly MarkRefusal[];
  choose: Choose;
}): React.JSX.Element {
  const all = [piece.strokes, piece.bracket ?? '', piece.arrow]
    .filter(Boolean)
    .join(' ');
  const reveal = useRevealable(machineMarkKey(routine, piece.id));
  return (
    <g
      ref={(element) => reveal(element as unknown as HTMLElement | null)}
      className="es-machine-step"
      data-mark={piece.id}
      data-from={piece.from.join(' ')}
      data-to={piece.to}
      data-beat={piece.edge.beat}
      data-selected={selected || undefined}
      data-refused={refused?.length ? '' : undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={pieceName(piece)}
      aria-description={[
        ...refusedText(refused),
        ...piece.steps.map((step) => step.statement.sentence),
        alsoText(piece.also),
      ]
        .filter(Boolean)
        .join(' ')}
      {...choose}
    >
      <title>
        {[
          ...refusedText(refused),
          ...piece.steps.map((step) => step.statement.sentence),
          alsoText(piece.also),
        ]
          .filter(Boolean)
          .join('\n')}
      </title>
      <path className="es-machine-hit" d={all} />
      {piece.strokes && (
        <path className="es-machine-stroke" d={piece.strokes} />
      )}
      {piece.bracket && (
        <path
          className="es-machine-stroke es-machine-bracket"
          d={piece.bracket}
        />
      )}
      <path
        className="es-machine-stroke"
        d={piece.arrow}
        markerEnd={`url(#${marker})`}
      />
      <text
        className="es-machine-label"
        x={piece.label.x}
        y={piece.label.y}
        textAnchor={piece.label.anchor}
        aria-hidden="true"
      >
        {piece.label.text}
      </text>
      {piece.caption && (
        <text
          className="es-machine-caption"
          x={piece.caption.x}
          y={piece.caption.y}
          aria-hidden="true"
        >
          {piece.caption.text}
        </text>
      )}
    </g>
  );
}
