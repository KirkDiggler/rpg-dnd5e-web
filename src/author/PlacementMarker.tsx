/**
 * PlacementMarker — the circle+label a placed prop/monster gets on the
 * 2D board, extracted from Board.tsx (edit mode) and
 * `creation/CreationBoard.tsx` (creation mode) where it was written
 * byte-identically twice (graduation audit item). Does NOT own the
 * `<g>` interaction wrapper (pointer handlers, cursor style, per-mode
 * extras like CreationBoard's facing-direction arrow) — those differ
 * meaningfully per board and stay owned by each caller; this component
 * is purely the visual (fill, selection stroke, short label).
 *
 * Not used for the boss pin (Board.tsx-only, no creation-mode analog —
 * creation mode's freeform canvas has no boss/room concept, see
 * TARGET-YAML.md) or the 3D preview's marker (a Three.js
 * `<ringGeometry>` mesh, not an SVG element — genuinely different
 * rendering technology, not mechanically shareable with this).
 */
import type { CellPos } from './hexLayout';

export interface PlacementMarkerProps {
  center: CellPos;
  color: string;
  short: string;
  selected: boolean;
  radius?: number;
  fontSize?: number;
}

export function PlacementMarker({
  center,
  color,
  short,
  selected,
  radius = 12,
  fontSize = 9,
}: PlacementMarkerProps) {
  return (
    <>
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill={color}
        stroke={selected ? '#ffd76a' : '#000'}
        strokeWidth={selected ? 2.5 : 1}
      />
      <text
        x={center.x}
        y={center.y + 3.5}
        textAnchor="middle"
        fill="#fff"
        fontSize={fontSize}
      >
        {short}
      </text>
    </>
  );
}
