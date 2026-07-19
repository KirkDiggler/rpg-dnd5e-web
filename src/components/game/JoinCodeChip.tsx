/**
 * JoinCodeChip — join-ref display with copy-to-clipboard, replacing the
 * plain `Join code: <code>` text row LobbyFlow's roster screen used to
 * render. Visual spec harvested from the pre-clean-slate `JoinCodeDisplay`
 * (deleted at 975f1a4, `src/components/lobby/JoinCodeDisplay.tsx`) — same
 * layout, ported onto today's data (LobbyFlow's `joinRef` state, not the
 * v1alpha1 `code` prop that component took).
 *
 * Inline styles for spacing/radius/typography, not Tailwind utility
 * classNames — see PartyMemberCard's doc comment for why (utility classes
 * confirmed missing project-wide in this dev build).
 */

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

export interface JoinCodeChipProps {
  code: string;
}

export function JoinCodeChip({ code }: JoinCodeChipProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy join code:', err);
    }
  };

  return (
    <div
      data-testid="join-code-display"
      className="flex"
      style={{
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '12px 16px',
        borderRadius: 8,
        backgroundColor: 'var(--bg-secondary, #1a1a1a)',
        border: '1px solid var(--border-primary, #333)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: 2,
            color: 'var(--text-muted, #888)',
          }}
        >
          Join code
        </div>
        <code
          style={{
            fontSize: 18,
            fontFamily: 'monospace',
            fontWeight: 700,
            letterSpacing: '0.03em',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: 'var(--text-primary, #fff)',
          }}
        >
          {code}
        </code>
      </div>
      <button
        onClick={() => void handleCopy()}
        aria-label={copied ? 'Copied join code' : 'Copy join code'}
        className="flex flex-shrink-0"
        style={{
          alignItems: 'center',
          gap: 6,
          padding: '6px 12px',
          borderRadius: 4,
          fontSize: 13,
          fontWeight: 500,
          border: 'none',
          cursor: 'pointer',
          backgroundColor: copied
            ? 'var(--accent-success, #22c55e)'
            : 'var(--accent-primary, #5865F2)',
          color: 'white',
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
