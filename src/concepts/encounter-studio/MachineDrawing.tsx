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

export function MachineDrawing({
  routine,
  layout,
  selected,
  onSelect,
}: {
  routine: string;
  layout: MachineLayout;
  /** The marked box's or arrow's id. */
  selected: string | null;
  onSelect(id: string): void;
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
                data-flag={m.statement ? m.text.split(':')[0] : undefined}
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
            choose={choose(piece.id)}
          />
        ))}
        {layout.boxes.map((box) => (
          <Box
            key={box.id}
            routine={routine}
            box={box}
            selected={selected === box.id}
            choose={choose(box.id)}
          />
        ))}
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
  choose,
}: {
  routine: string;
  box: LaidBox;
  selected: boolean;
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
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={boxName(box)}
      {...choose}
    >
      <title>
        {[...box.statements.map((st) => st.sentence), alsoText(box.also)]
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
  choose,
}: {
  routine: string;
  piece: LaidPiece;
  marker: string;
  selected: boolean;
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
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={pieceName(piece)}
      aria-description={[
        ...piece.steps.map((step) => step.statement.sentence),
        alsoText(piece.also),
      ]
        .filter(Boolean)
        .join(' ')}
      {...choose}
    >
      <title>
        {[
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
