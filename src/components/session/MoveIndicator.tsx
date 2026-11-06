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
import { Html } from '@react-three/drei';
import { PathPreview } from '../hex-grid/PathPreview';
import { cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import type { HoverActTone, MoveIndicatorSelection } from './moveIndicator';

// Kept explicit here (rather than relying on PathPreview's own default)
// so a reviewer can read what 'path' renders without opening that file.
const PATH_COLOR = '#3b82f6'; // blue — a walkable route.
const INVALID_COLOR = '#ef4444'; // red — unreachable (wall/off-atlas/self).
const LOCKED_COLOR = '#a855f7'; // purple — fight-locked, distinct from both.
const TARGET_COLOR = '#f97316'; // orange — an in-reach, hovered Attack target (rpg-project#249).
const OVERBUDGET_COLOR = '#ef4444'; // red — route beyond this turn's movement.
const OVERBUDGET_OPACITY = 0.22; // quieter than a walkable route: still a route, just not this turn's.

export interface MoveIndicatorProps {
  selection: MoveIndicatorSelection | null;
  hexSize: number;
  /** The hovered cell itself. Needed for the single-hex cases
   * ('invalid'/'locked'/'target'), where `selection` carries no
   * coordinate of its own — the hovered cell IS what's being decorated. A
   * 'path' selection always includes at least the start cell, so this
   * isn't consulted there. */
  hovered: CubeCoord | null;
  /** The words over a body a click walks into ('bump'), e.g. "Walk up to
   * Gate Guard" (rpg-project#835 R8). */
  bumpHint?: string;
}

const TAG_BORDER: Record<HoverActTone, string> = {
  attack: TARGET_COLOR,
  verb: PATH_COLOR,
  refused: INVALID_COLOR,
};

/** The words over a creature: "Walk up to Gate Guard", "Attack Guard",
 * "Out of reach". One look for every verb, so they read the same way. */
function HoverTag({
  at,
  border,
  children,
  data,
}: {
  at: { x: number; z: number };
  border: string;
  children: string;
  data: Record<string, string>;
}) {
  return (
    <Html
      center
      position={[at.x, 1.9, at.z]}
      style={{ pointerEvents: 'none', whiteSpace: 'nowrap' }}
      zIndexRange={[5, 0]}
    >
      <span
        {...data}
        style={{
          color: '#d6eff0',
          background: '#0b1720e8',
          border: `1px solid ${border}`,
          borderRadius: 4,
          padding: '3px 6px',
          fontSize: 11,
        }}
      >
        {children}
      </span>
    </Html>
  );
}

export function MoveIndicator({
  selection,
  hexSize,
  hovered,
  bumpHint,
}: MoveIndicatorProps) {
  if (!selection || !hovered) return null;

  switch (selection.kind) {
    case 'path': {
      // Two overlays, one route. The affordable prefix keeps the walkable
      // blue, and because PathPreview brightens whatever cell ends the array
      // it is handed, the last cell the budget pays for gets a "this far"
      // marker for free. The remainder draws red and quiet: still the real
      // route the click sends, shown as out of reach this turn rather than
      // hidden — hiding it would leave the player hovering a cell with no
      // feedback at all.
      const affordable = selection.path.slice(0, selection.affordable);
      const overBudget = selection.path.slice(selection.affordable);
      return (
        <>
          {affordable.length > 0 && (
            <PathPreview
              path={affordable}
              hexSize={hexSize}
              color={PATH_COLOR}
            />
          )}
          {overBudget.length > 0 && (
            <PathPreview
              path={overBudget}
              hexSize={hexSize}
              color={OVERBUDGET_COLOR}
              opacity={OVERBUDGET_OPACITY}
            />
          )}
        </>
      );
    }
    case 'bump': {
      // The walk up to him, drawn as any route, and the hint over him: the
      // last cell is his, where the server stops the walk.
      const at = cubeToWorld(hovered, hexSize);
      return (
        <>
          <PathPreview
            path={selection.path.slice(0, selection.affordable)}
            hexSize={hexSize}
            color={PATH_COLOR}
          />
          {bumpHint && (
            <HoverTag
              at={at}
              border={PATH_COLOR}
              data={{ 'data-bump-hint': selection.entityId }}
            >
              {bumpHint}
            </HoverTag>
          )}
        </>
      );
    }
    case 'act': {
      // Click a creature to act (rpg-project#872): the walk to the server's
      // approach cell when the act walks first, and the words over him.
      const at = cubeToWorld(hovered, hexSize);
      return (
        <>
          {selection.path.length > 0 && (
            <PathPreview
              path={selection.path}
              hexSize={hexSize}
              color={PATH_COLOR}
            />
          )}
          <PathPreview
            path={[hovered]}
            hexSize={hexSize}
            color={TAG_BORDER[selection.tone]}
            opacity={selection.tone === 'refused' ? 0.35 : 0.55}
          />
          <HoverTag
            at={at}
            border={TAG_BORDER[selection.tone]}
            data={{
              'data-act-hint': selection.entityId,
              'data-act-tone': selection.tone,
            }}
          >
            {selection.hint}
          </HoverTag>
        </>
      );
    }
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
