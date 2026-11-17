/**
 * WHERE A MACHINE'S BOXES AND ARROWS GO (rpg-project#995). Pure and
 * deterministic: the same machine always lays out the same way.
 *
 * ROWS. The top row is the starting state and every state that can get
 * back to it, nearest the start first, then in the engine's order. Every other
 * state — the ones a step leads away to and never back, the sinks among
 * them last — is the lower row, in the order the steps lead. So every
 * arrow joins two neighbouring rows or runs within one.
 *
 * ARROWS. A step between two boxes side by side in a row is a straight
 * arrow in the gap between them, labelled in the gap. Every other drawn
 * step runs in a channel, a band above, between or below the rows, on its
 * own lane: up or down from each state it leaves to the lane, along it, and
 * down or up into its target. A step several states share leaves them by
 * one dashed bracket on its lane, drawn once. A vertical stroke only ever
 * runs from a box into the channel beside its own row, so no stroke
 * crosses a box, and each lane holds one label, so no two labels meet;
 * `overlapsOf` checks both.
 *
 * Text is measured by an estimate per character, not the browser: what
 * does not fit a box or a gap is cut with an ellipsis, and the full text is
 * kept for the mark's tooltip and the detail pane.
 */
import type { ReadBackStatement } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import {
  beatLabel,
  holdLabel,
  stayLabel,
  type MachineEdge,
  type MachineState,
  type MachineStep,
  type MachineView,
} from './machineView';

export const STARTS_WORDS = 'starts here';
export const FINAL_WORDS = 'final';
export const NO_WAY_OUT_WORDS = 'no way out';

type PillKind = 'starts' | 'final' | 'no-way-out';

const MARGIN = 16;
const PAD = 12;
const TITLE_H = 26;
const LINE_H = 18;
const BOX_MIN_W = 160;
const BOX_MAX_W = 300;
const GAP_MIN = 56;
const GAP_MAX = 220;
const LANE_GAP = 34;
const CHANNEL_PAD = 12;
const CHANNEL_EMPTY = 20;
const LABEL_ABOVE = 5;
const CAPTION_BELOW = 14;
/** How far a lane's label may shift to clear a crossing stroke. */
const NEAR = 48;
/** Estimated advance per character: a little wide, so an estimate never
 * undercuts the text it measures. */
const CHAR = { line: 7, title: 8.8, pill: 6.4, caption: 6.4 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaidText {
  /** What is drawn (cut to fit). */
  text: string;
  /** The whole text. */
  full: string;
  x: number;
  /** The baseline. */
  y: number;
  /** The estimated width of `text`. */
  w: number;
  anchor: 'start' | 'middle';
}

export interface LaidLine extends LaidText {
  muted: boolean;
  statement: ReadBackStatement;
}

export interface LaidBox {
  /** The mark's id: `state:<id>`. */
  id: string;
  state: MachineState;
  rect: Rect;
  row: number;
  title: LaidText;
  pills: (LaidText & { kind: PillKind; rect: Rect })[];
  lines: LaidLine[];
  /** Every statement the box stands for: the state's, its staying steps'
   * and its holds'. */
  statements: ReadBackStatement[];
}

export interface LaidPiece {
  /** The mark's id: `step:<edge id>@<row>`. */
  id: string;
  edge: MachineEdge;
  /** The states it leaves, in column order. */
  from: string[];
  to: string;
  steps: MachineStep[];
  /** The strokes without an arrowhead (lead-ins, the run along a lane). */
  strokes: string;
  /** The bracket a shared step leaves its states by, dashed. */
  bracket: string | null;
  /** The last stroke, into the target, with the arrowhead. */
  arrow: string;
  label: LaidText;
  /** Under a bracket: the states it leaves. */
  caption: LaidText | null;
}

export interface MachineLayout {
  width: number;
  height: number;
  boxes: LaidBox[];
  pieces: LaidPiece[];
}

const estimate = (text: string, per: number): number =>
  Math.ceil(text.length * per);

/** `text` cut with an ellipsis to fit `room`. */
function fit(text: string, room: number, per: number): string {
  if (estimate(text, per) <= room) return text;
  const keep = Math.max(1, Math.floor(room / per) - 1);
  return `${text.slice(0, keep).trimEnd()}…`;
}

/** The two rows: the start and every state that gets back to it, then the
 * rest. */
function rowsOf(view: MachineView): [string[], string[]] {
  const ids = view.states.map((s) => s.id);
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const back = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const step of view.steps)
    if (step.to !== null) {
      if (!out.get(step.from)!.includes(step.to))
        out.get(step.from)!.push(step.to);
      if (!back.get(step.to)!.includes(step.from))
        back.get(step.to)!.push(step.from);
    }
  const walk = (
    start: string,
    next: Map<string, string[]>
  ): Map<string, number> => {
    const seen = new Map([[start, 0]]);
    const queue = [start];
    while (queue.length) {
      const at = queue.shift()!;
      for (const to of next.get(at)!)
        if (!seen.has(to)) {
          seen.set(to, seen.get(at)! + 1);
          queue.push(to);
        }
    }
    return seen;
  };
  const reached = walk(view.initial, out);
  const returns = walk(view.initial, back);
  // By how many steps from the start, then in the engine's order.
  const top = [...reached.keys()]
    .filter((id) => returns.has(id))
    .sort(
      (a, b) =>
        reached.get(a)! - reached.get(b)! || ids.indexOf(a) - ids.indexOf(b)
    );
  const rest = ids.filter((id) => !top.includes(id));
  const rank = (id: string): [number, number, number] => [
    reached.get(id) ?? Number.MAX_SAFE_INTEGER,
    out.get(id)!.length === 0 ? 1 : 0,
    ids.indexOf(id),
  ];
  const before = (a: string, b: string): number => {
    const [x, y] = [rank(a), rank(b)];
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  };
  // In the order the steps lead (a topological order of the lower row);
  // a loop among them is broken at its first-ranked state.
  const lower: string[] = [];
  const left = new Set(rest);
  while (left.size) {
    const free = [...left].filter(
      (id) => !back.get(id)!.some((from) => left.has(from) && from !== id)
    );
    const pick = (free.length ? free : [...left]).sort(before)[0]!;
    lower.push(pick);
    left.delete(pick);
  }
  return [top, lower];
}

interface Attach {
  piece: number;
  other: number;
}

/** Lay out a machine. */
export function layoutMachine(view: MachineView): MachineLayout {
  const rows = rowsOf(view).filter((row) => row.length > 0);
  const rowOf = new Map<string, number>();
  const colOf = new Map<string, number>();
  rows.forEach((row, r) =>
    row.forEach((id, c) => {
      rowOf.set(id, r);
      colOf.set(id, c);
    })
  );
  const stateOf = new Map(view.states.map((s) => [s.id, s]));

  // THE BOXES' CONTENTS, AND THEIR WIDTHS.
  interface Draft {
    state: MachineState;
    title: string;
    pills: { text: string; kind: PillKind; w: number }[];
    lines: { text: string; muted: boolean; statement: ReadBackStatement }[];
    w: number;
    h: number;
  }
  const drafts = new Map<string, Draft>();
  for (const state of view.states) {
    const pills = [
      ...(state.initial
        ? [{ text: STARTS_WORDS, kind: 'starts' as const }]
        : []),
      ...(state.final ? [{ text: FINAL_WORDS, kind: 'final' as const }] : []),
      ...(state.noWayOut
        ? [{ text: NO_WAY_OUT_WORDS, kind: 'no-way-out' as const }]
        : []),
    ].map((pill) => ({ ...pill, w: estimate(pill.text, CHAR.pill) + 14 }));
    const lines = [
      ...state.holds.map((hold) => ({
        text: holdLabel(hold),
        muted: true,
        statement: hold.statement,
      })),
      ...state.stays.map((step) => ({
        text: stayLabel(step),
        muted: false,
        statement: step.statement,
      })),
    ];
    const titleW =
      estimate(state.id, CHAR.title) +
      pills.reduce((sum, pill) => sum + pill.w + 8, 0);
    const widest = Math.max(
      titleW,
      ...lines.map((line) => estimate(line.text, CHAR.line))
    );
    drafts.set(state.id, {
      state,
      title: state.id,
      pills,
      lines,
      w: Math.min(BOX_MAX_W, Math.max(BOX_MIN_W, widest + 2 * PAD)),
      h: 2 * PAD + TITLE_H + lines.length * LINE_H,
    });
  }
  const rowH = rows.map((row) =>
    Math.max(...row.map((id) => drafts.get(id)!.h))
  );

  // THE PIECES: each edge, split by the row of the states it leaves.
  interface PieceDraft {
    id: string;
    edge: MachineEdge;
    from: string[];
    to: string;
    steps: MachineStep[];
    full: string;
    short: string;
    kind: 'adjacent' | 'channel';
    channel: number;
  }
  const pieces: PieceDraft[] = [];
  for (const edge of view.edges) {
    const byRow = new Map<number, string[]>();
    for (const from of edge.from) {
      const r = rowOf.get(from)!;
      byRow.set(r, [...(byRow.get(r) ?? []), from]);
    }
    for (const [r, froms] of [...byRow].sort((a, b) => a[0] - b[0])) {
      const from = froms.sort((a, b) => colOf.get(a)! - colOf.get(b)!);
      const targetRow = rowOf.get(edge.to)!;
      const adjacent =
        from.length === 1 &&
        targetRow === r &&
        Math.abs(colOf.get(from[0]!)! - colOf.get(edge.to)!) === 1;
      const channel =
        targetRow !== r ? Math.max(r, targetRow) : r === 0 ? 0 : r + 1;
      pieces.push({
        id: `step:${edge.id}@${r}`,
        edge,
        from,
        to: edge.to,
        steps: edge.steps.filter((step) => from.includes(step.from)),
        full: beatLabel(edge),
        short: `on ${edge.beat}`,
        kind: adjacent ? 'adjacent' : 'channel',
        channel,
      });
    }
  }

  // THE GAPS between side-by-side boxes, wide enough for their labels; a
  // pair holds as many straight arrows as its height spaces out, and the
  // rest take a lane.
  const pairKey = (a: string, b: string): string =>
    colOf.get(a)! < colOf.get(b)! ? `${a}|${b}` : `${b}|${a}`;
  const pairs = new Map<string, PieceDraft[]>();
  for (const piece of pieces) {
    if (piece.kind !== 'adjacent') continue;
    const key = pairKey(piece.from[0]!, piece.to);
    const list = pairs.get(key) ?? [];
    const r = rowOf.get(piece.to)!;
    if ((list.length + 2) * 22 > rowH[r]!) {
      piece.kind = 'channel';
      piece.channel = r === 0 ? 0 : r + 1;
      continue;
    }
    pairs.set(key, [...list, piece]);
  }
  // Forward (left to right) above backward.
  for (const list of pairs.values())
    list.sort(
      (a, b) =>
        Number(colOf.get(a.from[0]!)! > colOf.get(a.to)!) -
          Number(colOf.get(b.from[0]!)! > colOf.get(b.to)!) ||
        pieces.indexOf(a) - pieces.indexOf(b)
    );
  const gapOf = (left: string, right: string): number => {
    const list = pairs.get(pairKey(left, right)) ?? [];
    const widest = Math.max(
      0,
      ...list.map((p) => estimate(p.full, CHAR.line) + 16)
    );
    return Math.min(GAP_MAX, Math.max(GAP_MIN, widest));
  };

  // THE CHANNELS: one above the top row, one between each pair of rows,
  // one below the last; a lane per channelled piece.
  const channels = rows.length + 1;
  const lanes: PieceDraft[][] = Array.from({ length: channels }, () => []);
  for (const piece of pieces)
    if (piece.kind === 'channel') lanes[piece.channel]!.push(piece);
  const channelH = lanes.map((list, c) =>
    list.length
      ? 2 * CHANNEL_PAD + list.length * LANE_GAP
      : c === 0 || c === channels - 1
        ? 0
        : CHANNEL_EMPTY
  );

  // PLACE THE BOXES.
  const rect = new Map<string, Rect>();
  let y = MARGIN;
  const channelTop: number[] = [];
  let width = 0;
  rows.forEach((row, r) => {
    channelTop[r] = y;
    y += channelH[r]!;
    let x = MARGIN;
    row.forEach((id, c) => {
      if (c > 0) x += gapOf(row[c - 1]!, id);
      const w = drafts.get(id)!.w;
      rect.set(id, { x, y, w, h: rowH[r]! });
      x += w;
    });
    width = Math.max(width, x + MARGIN);
    y += rowH[r]!;
  });
  channelTop[rows.length] = y;
  y += channelH[rows.length]!;
  const height = y + MARGIN;
  const centre = (id: string): number => rect.get(id)!.x + rect.get(id)!.w / 2;

  // WHERE EACH PIECE MEETS EACH BOX: spread along the side, ordered by
  // where the other end is, so lead-ins cross as little as they can.
  const sideOf = (id: string, channel: number): 'top' | 'bottom' =>
    channel <= rowOf.get(id)! ? 'top' : 'bottom';
  const attaches = new Map<string, Attach[]>();
  const attach = (id: string, side: string, at: Attach): void => {
    const key = `${id}|${side}`;
    attaches.set(key, [...(attaches.get(key) ?? []), at]);
  };
  pieces.forEach((piece, index) => {
    if (piece.kind !== 'channel') return;
    const others = piece.from.map(centre);
    for (const from of piece.from)
      attach(from, sideOf(from, piece.channel), {
        piece: index,
        other: centre(piece.to),
      });
    attach(piece.to, sideOf(piece.to, piece.channel), {
      piece: index,
      other: others.reduce((a, b) => a + b, 0) / others.length,
    });
  });
  const attachX = new Map<string, number>();
  for (const [key, list] of attaches) {
    const id = key.slice(0, key.lastIndexOf('|'));
    const r = rect.get(id)!;
    const sorted = [...list].sort(
      (a, b) => a.other - b.other || a.piece - b.piece
    );
    sorted.forEach((at, i) =>
      attachX.set(
        `${key}|${at.piece}`,
        Math.round(
          r.x + PAD + ((r.w - 2 * PAD) * (i + 1)) / (sorted.length + 1)
        )
      )
    );
  }
  const pointOf = (
    id: string,
    channel: number,
    piece: number
  ): { x: number; y: number } => {
    const side = sideOf(id, channel);
    const r = rect.get(id)!;
    return {
      x: attachX.get(`${id}|${side}|${piece}`)!,
      y: side === 'top' ? r.y : r.y + r.h,
    };
  };

  const label = (
    full: string,
    short: string,
    room: number,
    x: number,
    baseline: number,
    anchor: 'start' | 'middle'
  ): LaidText => {
    const chosen = estimate(full, CHAR.line) <= room ? full : short;
    const text = fit(chosen, room, CHAR.line);
    return { text, full, x, y: baseline, w: estimate(text, CHAR.line), anchor };
  };

  const laidPieces: LaidPiece[] = [];
  // Straight arrows in the gaps.
  for (const list of pairs.values())
    list.forEach((piece, i) => {
      const from = rect.get(piece.from[0]!)!;
      const to = rect.get(piece.to)!;
      const forward = from.x < to.x;
      const top = Math.max(from.y, to.y);
      const h = Math.min(from.h, to.h);
      const ly = Math.round(top + (h * (i + 1)) / (list.length + 1));
      const x1 = forward ? from.x + from.w : from.x;
      const x2 = forward ? to.x : to.x + to.w;
      const room = Math.abs(x2 - x1) - 12;
      laidPieces.push({
        id: piece.id,
        edge: piece.edge,
        from: piece.from,
        to: piece.to,
        steps: piece.steps,
        strokes: '',
        bracket: null,
        arrow: `M ${x1} ${ly} H ${x2 + (forward ? -2 : 2)}`,
        label: label(
          piece.full,
          piece.short,
          room,
          (x1 + x2) / 2,
          ly - LABEL_ABOVE,
          'middle'
        ),
        caption: null,
      });
    });
  // Lanes. A label or caption on a lane goes where no stroke of its
  // channel crosses it, as near where it wants to be as there is room.
  const crossings = lanes.map((list, c) =>
    list.flatMap((piece) => {
      const index = pieces.indexOf(piece);
      return [...piece.from, piece.to].map((id) => pointOf(id, c, index).x);
    })
  );
  const clearSpot = (c: number, w: number, wantLeft: number): number => {
    const xs = [
      MARGIN,
      ...crossings[c]!.filter((x) => x > MARGIN && x < width - MARGIN),
      width - MARGIN,
    ].sort((a, b) => a - b);
    let best: number | null = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const lo = xs[i]! + 4;
      const hi = xs[i + 1]! - 4 - w;
      if (hi < lo) continue;
      const at = Math.min(Math.max(wantLeft, lo), hi);
      if (best === null || Math.abs(at - wantLeft) < Math.abs(best - wantLeft))
        best = at;
    }
    // Never far from its own strokes: past a short shift, it stays where
    // it wants to be and its halo keeps it readable over a crossing.
    const near = best !== null && Math.abs(best - wantLeft) <= NEAR;
    return Math.round(
      near ? best! : Math.min(Math.max(wantLeft, MARGIN), width - MARGIN - w)
    );
  };
  lanes.forEach((list, c) =>
    list.forEach((piece, lane) => {
      const index = pieces.indexOf(piece);
      const laneY = channelTop[c]! + CHANNEL_PAD + 18 + lane * LANE_GAP;
      const starts = piece.from.map((id) => pointOf(id, c, index));
      const end = pointOf(piece.to, c, index);
      const xs = starts.map((p) => p.x);
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      const leads = starts.map((p) => `M ${p.x} ${p.y} V ${laneY}`);
      const runFrom = end.x < lo ? lo : end.x > hi ? hi : null;
      const run = runFrom === null ? '' : `M ${runFrom} ${laneY} H ${end.x}`;
      const into = end.y > laneY ? end.y - 2 : end.y + 2;
      // The label sits on the lane over its run, or beside the drop.
      const spanLo = Math.min(lo, end.x);
      const spanHi = Math.max(hi, end.x);
      const room = Math.max(width - 2 * MARGIN - 8, 0);
      const chosen = label(
        piece.full,
        piece.short,
        room,
        0,
        laneY - LABEL_ABOVE,
        'start'
      );
      const preferred =
        spanHi - spanLo >= chosen.w + 12
          ? (spanLo + spanHi) / 2 - chosen.w / 2
          : end.x + 6;
      chosen.x = clearSpot(c, chosen.w, preferred);
      const caption =
        piece.from.length > 1
          ? (() => {
              const full = `from ${piece.from.join(', ')}`;
              const text = fit(full, width - MARGIN - lo, CHAR.caption);
              const w = estimate(text, CHAR.caption);
              return {
                text,
                full,
                x: clearSpot(c, w, lo + 4),
                y: laneY + CAPTION_BELOW,
                w,
                anchor: 'start' as const,
              };
            })()
          : null;
      laidPieces.push({
        id: piece.id,
        edge: piece.edge,
        from: piece.from,
        to: piece.to,
        steps: piece.steps,
        strokes: [...leads, run].filter(Boolean).join(' '),
        bracket: piece.from.length > 1 ? `M ${lo} ${laneY} H ${hi}` : null,
        arrow: `M ${end.x} ${laneY} V ${into}`,
        label: chosen,
        caption,
      });
    })
  );
  // In the order the engine says the steps.
  laidPieces.sort(
    (a, b) =>
      pieces.findIndex((p) => p.id === a.id) -
      pieces.findIndex((p) => p.id === b.id)
  );

  const boxes: LaidBox[] = rows.flatMap((row, r) =>
    row.map((id) => {
      const draft = drafts.get(id)!;
      const box = rect.get(id)!;
      const state = stateOf.get(id)!;
      let pillX = box.x + box.w - PAD;
      const pills = [...draft.pills].reverse().map((pill) => {
        pillX -= pill.w;
        const at = pillX;
        pillX -= 8;
        return {
          text: pill.text,
          full: pill.text,
          kind: pill.kind,
          x: at + pill.w / 2,
          y: box.y + PAD + 13,
          w: pill.w,
          anchor: 'middle' as const,
          rect: { x: at, y: box.y + PAD, w: pill.w, h: 18 },
        };
      });
      const titleRoom =
        box.w - 2 * PAD - draft.pills.reduce((s, p) => s + p.w + 8, 0);
      const titleText = fit(draft.title, titleRoom, CHAR.title);
      return {
        id: `state:${id}`,
        state,
        rect: box,
        row: r,
        title: {
          text: titleText,
          full: draft.title,
          x: box.x + PAD,
          y: box.y + PAD + 14,
          w: estimate(titleText, CHAR.title),
          anchor: 'start' as const,
        },
        pills: pills.reverse(),
        lines: draft.lines.map((line, i) => {
          const text = fit(line.text, box.w - 2 * PAD, CHAR.line);
          return {
            text,
            full: line.text,
            x: box.x + PAD,
            y: box.y + PAD + TITLE_H + 13 + i * LINE_H,
            w: estimate(text, CHAR.line),
            anchor: 'start' as const,
            muted: line.muted,
            statement: line.statement,
          };
        }),
        statements: [
          state.statement,
          ...state.holds.map((hold) => hold.statement),
          ...state.stays.map((step) => step.statement),
        ].filter((st, i, all) => all.indexOf(st) === i),
      };
    })
  );
  return { width, height, boxes, pieces: laidPieces };
}

/** A text's box, from its estimate. */
export function textRect(text: LaidText, size = 12): Rect {
  const left = text.anchor === 'middle' ? text.x - text.w / 2 : text.x;
  return { x: left, y: text.y - size + 1, w: text.w, h: size + 3 };
}

const meet = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Every pair that overlaps: box with box, and any arrow label or bracket
 * caption with a box or with another label or caption. Empty for a sound
 * layout. */
export function overlapsOf(layout: MachineLayout): [string, string][] {
  const out: [string, string][] = [];
  const boxes = layout.boxes.map((b) => ({ name: b.id, rect: b.rect }));
  const texts = layout.pieces.flatMap((p) => [
    { name: `${p.id} label`, rect: textRect(p.label) },
    ...(p.caption
      ? [{ name: `${p.id} caption`, rect: textRect(p.caption, 11) }]
      : []),
  ]);
  const inside = (r: Rect): boolean =>
    r.x >= 0 &&
    r.y >= 0 &&
    r.x + r.w <= layout.width &&
    r.y + r.h <= layout.height;
  for (const t of [...boxes, ...texts])
    if (!inside(t.rect)) out.push([t.name, 'the drawing']);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      if (meet(boxes[i]!.rect, boxes[j]!.rect))
        out.push([boxes[i]!.name, boxes[j]!.name]);
  for (let i = 0; i < texts.length; i++) {
    for (const box of boxes)
      if (meet(texts[i]!.rect, box.rect)) out.push([texts[i]!.name, box.name]);
    for (let j = i + 1; j < texts.length; j++)
      if (meet(texts[i]!.rect, texts[j]!.rect))
        out.push([texts[i]!.name, texts[j]!.name]);
  }
  return out;
}

/** Which mark stands for a statement: its box, or the piece of the arrow
 * it is a step of. */
export function markOfStatement(
  layout: MachineLayout
): Map<ReadBackStatement, string> {
  const out = new Map<ReadBackStatement, string>();
  for (const piece of layout.pieces)
    for (const step of piece.steps)
      if (!out.has(step.statement)) out.set(step.statement, piece.id);
  for (const box of layout.boxes)
    for (const statement of box.statements)
      if (!out.has(statement)) out.set(statement, box.id);
  return out;
}

/** The statements a mark stands for, in the engine's order. */
export function statementsOfMark(
  layout: MachineLayout,
  id: string
): ReadBackStatement[] {
  const box = layout.boxes.find((b) => b.id === id);
  if (box) return box.statements;
  return (
    layout.pieces.find((p) => p.id === id)?.steps.map((s) => s.statement) ?? []
  );
}

/** The mark's accessible name: its state and its marks, in ids. */
export function boxName(box: LaidBox): string {
  const marks = box.pills.map((pill) => pill.text);
  return `State ${box.state.id}${marks.length ? ` (${marks.join(', ')})` : ''}`;
}

export function pieceName(piece: LaidPiece): string {
  const from =
    piece.from.length > 1
      ? `${piece.from.slice(0, -1).join(', ')} or ${piece.from.at(-1)}`
      : piece.from[0];
  return `Step from ${from} to ${piece.to}, ${piece.label.full}`;
}
