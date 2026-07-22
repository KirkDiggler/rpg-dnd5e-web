/**
 * D20Die (rpg-dnd5e-web#561, Kirk iteration 1) — a focused, reusable
 * inline-SVG d20 for `BeatStage`'s die beats (armed/throw/verdict/
 * impact/release/persisted-done). Replaces the round-one generic 🎲
 * emoji glyph, which review feedback flagged as reading as "a random
 * dice pictograph, not a d20" — this component's outer silhouette (a
 * flat-top hexagon) plus six center-to-vertex facet lines is an
 * unmistakable faceted-polygon shape, not text. Plain inline SVG, drawn
 * by hand below — no icon library or static asset added, matching the
 * task's "no dependency" fence.
 *
 * Presentation-owned, like `beatStageTypes.ts`'s views: this component
 * knows nothing about `useBeatSequencer`'s beat names, only two
 * independent booleans a caller (`BeatStage.tsx`) derives from its own
 * beat:
 *   - `revealed`: false hides the authoritative face behind a `?` glyph
 *     (armed/throw) so the server's already-resolved roll is never
 *     leaked before the verdict beat; true shows the real `face`
 *     (verdict/impact/release, or a persisted Instant `done`).
 *   - `tumbling`: true adds the tumble class (throw only) — a no-op
 *     under `reducedMotion`, which forces the settled class instead so
 *     the die stays still while every other beat semantic (face,
 *     verdict, impact) is unchanged (design.md §4's "nothing about what
 *     happened is lost, only the motion").
 *
 * `face` is the AUTHORITATIVE `attackRoll` the sequencer already
 * resolved before Cue ever started (`BeatAttackView.attackRoll`,
 * `beatStageTypes.ts`) — this component never generates, randomizes, or
 * reads a timestamp/tap-time of its own, so a player tapping "Roll d20"
 * a moment sooner or later can never change what number appears once
 * `revealed` flips true (the die never lies about *when* it decides the
 * outcome — it decided long before this component ever mounted).
 *
 * Decorative for assistive tech (`aria-hidden`, same contract the emoji
 * glyph it replaces already had) — the verdict text remains the single
 * announced signal (`BeatStage.tsx`'s header).
 */

export interface D20DieProps {
  /** The authoritative attackRoll to show once `revealed`. Ignored (and
   * may be omitted) while hidden — never rendered pre-reveal. */
  face?: number;
  /** False renders a hidden-result `?` face; true renders `face`. */
  revealed: boolean;
  /** True adds the tumble class. Suppressed (settled instead) when
   * `reducedMotion` is true, regardless of this value. */
  tumbling: boolean;
  reducedMotion?: boolean;
  className?: string;
}

/** Flat-top hexagon vertices (viewBox 0 0 100 100, center 50,50,
 * radius ~45) — the die's outer silhouette. Six points is enough to
 * read unambiguously as a many-sided die rather than a d6 square or a
 * d4 triangle, without needing a true 3D icosahedron projection. */
const CENTER = 50;
const VERTICES: ReadonlyArray<readonly [number, number]> = [
  [50, 4],
  [88.97, 27.5],
  [88.97, 72.5],
  [50, 96],
  [11.03, 72.5],
  [11.03, 27.5],
];
const SILHOUETTE_POINTS = VERTICES.map(([x, y]) => `${x},${y}`).join(' ');

export function D20Die({
  face,
  revealed,
  tumbling,
  reducedMotion = false,
  className = '',
}: D20DieProps) {
  const shouldTumble = tumbling && !reducedMotion;
  // Never read `face` unless revealed — the hidden state doesn't just
  // style over the real value, it never renders it into the DOM at all.
  const label = revealed ? String(face ?? '') : '?';

  return (
    <svg
      data-testid="d20-die"
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={[
        'd20-die',
        shouldTumble ? 'd20-die--tumbling' : 'd20-die--settled',
        revealed ? 'd20-die--revealed' : 'd20-die--hidden',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <polygon
        data-testid="d20-silhouette"
        points={SILHOUETTE_POINTS}
        className="d20-die__silhouette"
        fill="currentColor"
        fillOpacity={0.08}
        stroke="currentColor"
        strokeWidth={4}
        strokeLinejoin="round"
      />
      {VERTICES.map(([x, y], i) => (
        <line
          key={i}
          data-testid="d20-facet"
          x1={CENTER}
          y1={CENTER}
          x2={x}
          y2={y}
          className="d20-die__facet"
          stroke="currentColor"
          strokeWidth={2}
          strokeOpacity={0.55}
        />
      ))}
      <text
        data-testid="d20-face"
        x="50"
        y="60"
        textAnchor="middle"
        fontSize={label === '?' ? 30 : 26}
        fontWeight={700}
        fontFamily="'Cinzel', serif"
        className="d20-die__face"
        fill="currentColor"
      >
        {label}
      </text>
    </svg>
  );
}
