/**
 * OverlayPanel — a summonable floating panel that costs ZERO layout height
 * when closed (the rpg-dnd5e-web#519 combat-log pattern, generalized).
 * Renders a compact toggle chip inline; the panel itself floats above the
 * dock, anchored to the DockShell's outer div (pass the panel through
 * DockShell's `overlay` prop, or render inside any position:relative,
 * non-clipping ancestor — see DockShell's header on the clipping trap).
 *
 * Controlled component: open state lives with the caller so compositions
 * can coordinate (e.g. close the log when an overflow menu opens).
 */

import type { ReactNode } from 'react';
import { cn } from '../../../utils/cn';

export interface OverlayToggleProps {
  /** Chip content, e.g. "📜 12". */
  label: ReactNode;
  open: boolean;
  onToggle: () => void;
  'aria-label': string;
  className?: string;
}

export function OverlayToggle({
  label,
  open,
  onToggle,
  'aria-label': ariaLabel,
  className,
}: OverlayToggleProps) {
  return (
    <button
      type="button"
      className={cn('verb-btn', className)}
      onClick={onToggle}
      aria-expanded={open}
      aria-label={ariaLabel}
      style={
        // backgroundColor, NOT the `background` shorthand — the shorthand
        // resets background-image and silently strips any sprite skin
        // (.hud-skin) applied to these chips via CSS (Copilot catch on
        // #555).
        open
          ? {
              borderColor: 'var(--accent-primary)',
              backgroundColor: 'var(--bg-secondary)',
            }
          : { backgroundColor: 'transparent', color: 'var(--text-muted)' }
      }
    >
      {label}
    </button>
  );
}

export interface OverlayPanelProps {
  open: boolean;
  children: ReactNode;
  /** Horizontal anchor within the dock. */
  align?: 'left' | 'right';
  width?: number;
  maxHeight?: number;
  'data-testid'?: string;
}

export function OverlayPanel({
  open,
  children,
  align = 'right',
  width = 320,
  maxHeight = 280,
  'data-testid': testId = 'overlay-panel',
}: OverlayPanelProps) {
  if (!open) return null;

  return (
    <div
      data-testid={testId}
      style={{
        position: 'absolute',
        bottom: '100%',
        [align]: 12,
        marginBottom: 8,
        width,
        maxWidth: 'calc(100vw - 24px)',
        maxHeight,
        overflowY: 'auto',
        zIndex: 50,
        borderRadius: 8,
        background: 'var(--modal-bg)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 -4px 20px -2px rgba(0, 0, 0, 0.5)',
      }}
    >
      {children}
    </div>
  );
}
