import type { RollFlashOutcome } from '@/components/session/combat-experience/rollFlash';
import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';

export interface RollFlashDieProps {
  /** The most recent roll flash, or `undefined` when there is nothing to
   * show — only the LATEST ever renders here (unlike `RollFlashToasts`'
   * stack): the die overlay is anchored at a single position that only
   * changes when a new throw settles there, so there is never more than
   * one meaningfully on screen at once. */
  readonly flash: RollFlashOutcome | undefined;
  /** The die's actual rest position — `LocalWorldDieLayer.tsx`'s own
   * `onSettledAt`. `undefined` before any throw has settled. */
  readonly position: readonly [number, number, number] | undefined;
}

/** Kirk's own spec: "fading over ~1.5s" — matches ROLL_FLASH_TTL_MS
 * (rollFlash.ts), which governs how long `flash` stays truthy upstream; this
 * local duration only drives the CSS fade curve, not the flash's lifetime. */
const FADE_MS = 1500;

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
 * Fixed-pixel `<Html>` (not drei's `distanceFactor`) — same reasoning
 * `AssetAnchorLabPreview.tsx` gives for its own label: distance-scaling a
 * flash meant to read as "one consistent size on screen" would work against
 * the point.
 */
export function RollFlashDie({ flash, position }: RollFlashDieProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!flash) return undefined;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [flash]);

  if (!flash || !position || !visible) return null;

  const color =
    flash.natural === 'nat20'
      ? NATURAL_20_COLOR
      : flash.natural === 'nat1'
        ? NATURAL_1_COLOR
        : NORMAL_COLOR;

  return (
    <Html position={position} center zIndexRange={[30, 20]} occlude={false}>
      <div
        data-testid={`roll-flash-die-${flash.id}`}
        style={{
          color,
          fontSize: '2.75rem',
          fontWeight: 800,
          lineHeight: 1,
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
          pointerEvents: 'none',
          userSelect: 'none',
          animation: `roll-flash-die-fade ${FADE_MS}ms ease-out forwards`,
        }}
      >
        {flash.d20}
      </div>
      <style>{`
        @keyframes roll-flash-die-fade {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          65% { opacity: 1; transform: translateY(-4px) scale(1.05); }
          100% { opacity: 0; transform: translateY(-28px) scale(1.2); }
        }
      `}</style>
    </Html>
  );
}
