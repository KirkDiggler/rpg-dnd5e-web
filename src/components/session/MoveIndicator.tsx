/**
 * MoveIndicator — draws the session route's hover/path indicator
 * (rpg-dnd5e-web#762 slice 4). Pure rendering: `useMoveIndicator`/
 * `moveIndicator.ts` own every decision about WHAT to show; this
 * component only turns a `MoveIndicatorSelection` into geometry.
 *
 * Reuses `PathPreview` — the old `HexGrid` route's own tuned hex-overlay
 * leaf (its Y-offset is calibrated against both floor renderers, see that
 * file's own doc comment on `PATH_Y_OFFSET`) — rather than inventing a
 * second hover-highlight visual language for the new route. `PathPreview`
 * takes any `CubeCoord[]`, so a single hovered cell (`'invalid'`/
 * `'locked'`/`'target'`) is just a one-element path.
 */
import { PathPreview } from '../hex-grid/PathPreview';
import type { CubeCoord } from '../hex-grid/hexMath';
import type { MoveIndicatorSelection } from './moveIndicator';

// Kept explicit here (rather than relying on PathPreview's own default)
// so a reviewer can read what 'path' renders without opening that file.
const PATH_COLOR = '#3b82f6'; // blue — a walkable route.
const INVALID_COLOR = '#ef4444'; // red — unreachable (wall/off-atlas/self).
const LOCKED_COLOR = '#a855f7'; // purple — fight-locked, distinct from both.
const TARGET_COLOR = '#f97316'; // orange — an in-reach, hovered Attack target (rpg-project#249).

export interface MoveIndicatorProps {
  selection: MoveIndicatorSelection | null;
  hexSize: number;
  /** The hovered cell itself. Needed for the single-hex cases
   * ('invalid'/'locked'/'target'), where `selection` carries no
   * coordinate of its own — the hovered cell IS what's being decorated. A
   * 'path' selection always includes at least the start cell, so this
   * isn't consulted there. */
  hovered: CubeCoord | null;
}

export function MoveIndicator({
  selection,
  hexSize,
  hovered,
}: MoveIndicatorProps) {
  if (!selection || !hovered) return null;

  switch (selection.kind) {
    case 'path':
      return (
        <PathPreview
          path={selection.path}
          hexSize={hexSize}
          color={PATH_COLOR}
        />
      );
    case 'invalid':
      return (
        <PathPreview
          path={[hovered]}
          hexSize={hexSize}
          color={INVALID_COLOR}
          opacity={0.35}
        />
      );
    case 'locked':
      return (
        <PathPreview
          path={[hovered]}
          hexSize={hexSize}
          color={LOCKED_COLOR}
          opacity={0.45}
        />
      );
    case 'target':
      return (
        <PathPreview
          path={[hovered]}
          hexSize={hexSize}
          color={TARGET_COLOR}
          opacity={0.55}
        />
      );
    default:
      return null;
  }
}
