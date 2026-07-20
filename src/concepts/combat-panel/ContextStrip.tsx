/**
 * ContextStrip — the one-line teaching strip shared by the bar-family
 * compositions (B/C/D). Message logic lives in contextMessage.ts (also
 * used by the cluster's floating pill).
 */

import type { CSSProperties } from 'react';
import { contextMessage, type StripTone } from './contextMessage';
import type { CombatPanelFixture } from './fixtures';

const TONE_STYLE: Record<StripTone, CSSProperties> = {
  action: {
    color: 'var(--text-primary)',
    borderColor: 'var(--accent-primary)',
  },
  info: {
    color: 'var(--text-secondary)',
    borderColor: 'var(--border-primary)',
  },
  quiet: { color: 'var(--text-muted)', borderColor: 'var(--border-primary)' },
};

export interface ContextStripProps {
  fixture: CombatPanelFixture;
  armedKey?: string;
  /** Comfortable-scale strip (round 4): taller line, larger type. */
  comfortable?: boolean;
  /** Round-5 floor-viewport scale (composition D): larger again. */
  large?: boolean;
}

export function ContextStrip({
  fixture,
  armedKey,
  comfortable = false,
  large = false,
}: ContextStripProps) {
  const armedLabel = armedKey
    ? fixture.actions.find((a) => a.ref?.id === armedKey)?.displayName
    : undefined;
  const ctx = contextMessage(fixture, armedKey, armedLabel);
  const line = large ? 30 : comfortable ? 26 : 22;

  return (
    <div
      data-testid="context-strip"
      role="status"
      style={{
        fontSize: large ? 15 : comfortable ? 13.5 : 12,
        lineHeight: `${line}px`,
        height: line,
        padding: '0 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        ...TONE_STYLE[ctx.tone],
      }}
    >
      {ctx.text}
    </div>
  );
}
