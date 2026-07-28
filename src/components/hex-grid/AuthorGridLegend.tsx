/**
 * AuthorGridLegend — `?authorGrid=1`'s facing compass rose: a small,
 * fixed HUD element (DOM, sibling to the Canvas — same pattern as
 * TurnOrderOverlay.tsx) giving Kirk the vocabulary to dictate a facing
 * verbally ("facing 4") while walking a room, before a real rotation
 * field exists on `place:` entries to capture it mechanically.
 *
 * Purely a legend — it renders the SAME six labels in the SAME order
 * every time (authorGridHelpers.HEX_FACING_LABELS), independent of
 * region/hex data, so it needs no props. Positioned bottom-left to stay
 * clear of TurnOrderOverlay (top-center) and EncounterDock (bottom
 * strip, but this sits above it via a modest bottom offset).
 */

import type { CSSProperties } from 'react';
import { HEX_FACING_LABELS } from './authorGridHelpers';

// Angular position for each facing index around the rose, degrees
// clockwise from "up" on screen — purely a legend layout, not a claim
// about how these directions map onto the isometric camera's actual
// view. 0 (E) placed at the right (90deg) so the ring reads like an
// ordinary compass rather than starting at the top.
const ANGLE_DEG = [90, 150, 210, 270, 330, 30];
const RING_RADIUS_PX = 34;

const containerStyle: CSSProperties = {
  position: 'absolute',
  left: 12,
  bottom: 84,
  padding: '10px 12px',
  backgroundColor: 'rgba(0, 0, 0, 0.55)',
  backdropFilter: 'blur(8px)',
  borderRadius: 10,
  color: '#e8ecff',
  fontSize: 11,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 6,
};

const roseStyle: CSSProperties = {
  position: 'relative',
  width: RING_RADIUS_PX * 2 + 24,
  height: RING_RADIUS_PX * 2 + 24,
};

const centerDotStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  width: 6,
  height: 6,
  marginLeft: -3,
  marginTop: -3,
  borderRadius: '50%',
  backgroundColor: '#7fd9ff',
};

function labelStyle(angleDeg: number): CSSProperties {
  const radians = (angleDeg * Math.PI) / 180;
  const x = Math.cos(radians) * RING_RADIUS_PX;
  // Screen Y grows downward; "up" on the rose should be angle 90 by our
  // own convention above, so subtract to flip.
  const y = -Math.sin(radians) * RING_RADIUS_PX;
  return {
    position: 'absolute',
    left: `calc(50% + ${x}px)`,
    top: `calc(50% + ${y}px)`,
    transform: 'translate(-50%, -50%)',
    fontWeight: 700,
    color: '#fff',
  };
}

export function AuthorGridLegend() {
  return (
    <div style={containerStyle} data-testid="author-grid-legend">
      <div style={{ opacity: 0.75, letterSpacing: '0.5px' }}>FACING</div>
      <div style={roseStyle}>
        <div style={centerDotStyle} />
        {HEX_FACING_LABELS.map((label, index) => (
          <div key={label} style={labelStyle(ANGLE_DEG[index]!)}>
            {index}
          </div>
        ))}
      </div>
      <div style={{ opacity: 0.75 }}>
        {HEX_FACING_LABELS.map((label, index) => `${index}=${label}`).join(
          '  '
        )}
      </div>
    </div>
  );
}
