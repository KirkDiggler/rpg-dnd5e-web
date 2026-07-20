/**
 * Composition B: "Verbs + context zone" — Composition A plus a slim strip
 * that TEACHES (prototypes the rpg-dnd5e-web#533 direction). The strip's
 * one job: answer "what is the game waiting for?" in words, driven purely
 * by the same server-given state the bar renders — armed guidance, whose
 * turn it is, free-roam status. It is one line, ~22px, and never grows.
 */

import type { CSSProperties } from 'react';
import { CommandBar, type CommandBarProps } from './CommandBar';

function contextMessage(
  fixture: CommandBarProps['fixture'],
  armedKey: string | undefined,
  armedLabel: string | undefined
): { text: string; tone: 'action' | 'info' | 'quiet' } {
  if (armedKey) {
    return {
      text: `${armedLabel ?? 'Action'} armed — click a target on the map. Esc or click again to cancel.`,
      tone: 'action',
    };
  }
  if (fixture.mode === 'FREE_ROAM') {
    return {
      text: 'Exploring — click the map to move. Combat will start when enemies appear.',
      tone: 'quiet',
    };
  }
  if (!fixture.isMyTurn) {
    return {
      text: `${fixture.activeName}'s turn — watch the map.`,
      tone: 'info',
    };
  }
  return { text: 'Your turn — pick an action.', tone: 'action' };
}

const TONE_STYLE: Record<'action' | 'info' | 'quiet', CSSProperties> = {
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

export function CommandBarWithContext(props: CommandBarProps) {
  const { fixture, armedKey } = props;
  const armedLabel = armedKey
    ? fixture.actions.find((a) => a.ref?.id === armedKey)?.displayName
    : undefined;
  const ctx = contextMessage(fixture, armedKey, armedLabel);

  return (
    <div>
      <div
        data-testid="context-strip"
        role="status"
        style={{
          fontSize: 12,
          lineHeight: '22px',
          height: 22,
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
      <CommandBar {...props} />
    </div>
  );
}
