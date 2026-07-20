/**
 * DockShell — the thin-bottom-bar layout container for the combat surface.
 * Encodes the two layout lessons from rpg-dnd5e-web#519/#520 so no
 * composition has to relearn them:
 *
 * 1. TWO nested containers, not one. The outer div is the
 *    `position: relative` anchor for floating overlays and has NO overflow
 *    rule; the inner row carries `maxHeight` + `overflowY: auto`. Setting
 *    overflow-y non-visible forces both axes to clip, so an overlay
 *    anchored `bottom: 100%` inside the SAME scrolling element clips itself
 *    into invisibility (caught live during #519 verification).
 * 2. The row wraps under width pressure but never stacks by design; the
 *    maxHeight is a worst-case safety net for Discord's short activity
 *    viewport, not the primary height control.
 *
 * Overlays (combat log, overflow menus) render via the `overlay` prop —
 * a SIBLING of the scrolling row, inside the non-clipping anchor.
 */

import type { CSSProperties, ReactNode } from 'react';

export interface DockShellProps {
  children: ReactNode;
  /** Floating content anchored above the dock (overlays, popovers). */
  overlay?: ReactNode;
  /** Worst-case height cap; content-sized below this. */
  maxHeight?: CSSProperties['maxHeight'];
  'data-testid'?: string;
}

export function DockShell({
  children,
  overlay,
  maxHeight = '16vh',
  'data-testid': testId = 'dock-shell',
}: DockShellProps) {
  return (
    <div data-testid={testId} style={{ position: 'relative', flexShrink: 0 }}>
      <div
        data-testid={`${testId}-row`}
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10,
          maxHeight,
          overflowY: 'auto',
          padding: '6px 12px',
          background: 'var(--bg-secondary)',
          borderTop: '2px solid var(--border-primary)',
          boxShadow: '0 -8px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        {children}
      </div>
      {overlay}
    </div>
  );
}
