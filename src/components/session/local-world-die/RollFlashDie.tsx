import { Html } from '@react-three/drei';

export interface RollFlashDieProps {
  /** The die's rest position at the moment it settles — `undefined` when
   * there is nothing to show right now. Fully parent-controlled: this
   * component mounts/unmounts on `position` alone and owns no timers of
   * its own (`LocalWorldDieLayer.tsx`'s `DieBody` owns the whole
   * lifecycle — see its own `DIE_FLASH_TOTAL_MS` doc comment for why). */
  readonly position: readonly [number, number, number] | undefined;
  /** The server's authoritative natural d20 — always already known before
   * the throw starts (`LocalWorldDieLayerProps.authoritativeFace`), so
   * there is no separate outcome object to plumb through here. */
  readonly naturalRoll: number;
  /** Total time (ms) the flash stays mounted for — spans the correction
   * spin plus the settle hold (`DIE_FLASH_TOTAL_MS`). */
  readonly totalMs: number;
  /** How long (ms), at the END of `totalMs`, the flash fades out
   * (`DIE_FLASH_FADE_MS`). */
  readonly fadeMs: number;
}

const NATURAL_20_COLOR = '#f5c542'; // gold
const NATURAL_1_COLOR = '#e0433d'; // red
const NORMAL_COLOR = '#f5f0e6';

/**
 * The natural d20, screen-sized, anchored at the die's actual rest position
 * in world space — Kirk, 2026-09-03: "the flash carries the truth, the die
 * carries the feel: the result number is shown from server facts, so the
 * physics face never has to match." Gold on a natural 20, red on a natural
 * 1, neutral otherwise (`?rollFlash=die`/`both`, diceDials.ts).
 *
 * Round 3, Kirk's design adopted exactly: "we spin to correct the die and
 * we could cover that with a simple animation showing the number rolled;
 * while that is over it we flip the die like we do." So this stays up for
 * the WHOLE correction-spin-plus-hold window (`totalMs`), fading only in
 * the last `fadeMs` — it never reveals the physics face disagreeing with
 * the server's answer while the spin is still covering that up.
 *
 * Fixed-pixel `<Html>` (not drei's `distanceFactor`) — same reasoning
 * `AssetAnchorLabPreview.tsx` gives for its own label: distance-scaling a
 * flash meant to read as "one consistent size on screen" would work against
 * the point.
 */
export function RollFlashDie({
  position,
  naturalRoll,
  totalMs,
  fadeMs,
}: RollFlashDieProps) {
  if (!position) return null;

  const color =
    naturalRoll === 20
      ? NATURAL_20_COLOR
      : naturalRoll === 1
        ? NATURAL_1_COLOR
        : NORMAL_COLOR;

  // Opaque until the fade window starts, then fades to the end of `totalMs`
  // — e.g. totalMs=1070, fadeMs=300 holds opaque through ~72% then fades.
  const fadeStartPercent = Math.max(
    0,
    Math.min(100, ((totalMs - fadeMs) / totalMs) * 100)
  );

  return (
    <Html position={position} center zIndexRange={[30, 20]} occlude={false}>
      <div
        data-testid="roll-flash-die"
        style={{
          color,
          fontSize: '2.75rem',
          fontWeight: 800,
          lineHeight: 1,
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
          userSelect: 'none',
          animation: `roll-flash-die-fade ${totalMs}ms ease-out forwards`,
        }}
      >
        {naturalRoll}
      </div>
      <style>{`
        @keyframes roll-flash-die-fade {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          ${fadeStartPercent}% { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-28px) scale(1.2); }
        }
      `}</style>
    </Html>
  );
}
