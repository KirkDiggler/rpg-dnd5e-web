/**
 * DungeonBuilderHomeButton — Home's real chrome entry point into the
 * Dungeon Builder (`/author` AppView), rpg-project#194 (the graduation
 * unit). Gated by `useAuthoringGate` so the SAME production bundle is
 * correct in both worlds: deployed with authoring off server-side shows
 * nothing here at all; the day the deployed compose flips
 * `RPG_AUTHORING_ENABLED=1` this button lights up with zero client
 * change. Deliberately real chrome — not folded into the bottom-right
 * dev-tools cluster in `App.tsx`, not `isDevelopment`-gated, visible to
 * every player.
 */
import { useAuthoringGate } from './useAuthoringGate';

interface DungeonBuilderHomeButtonProps {
  onOpen: () => void;
}

export function DungeonBuilderHomeButton({
  onOpen,
}: DungeonBuilderHomeButtonProps) {
  const gate = useAuthoringGate();

  // 'probing': render nothing rather than a placeholder — Home's own
  // render is never blocked on this (this component itself mounts
  // instantly; only its content depends on the probe), and a flash of
  // "maybe a button" reads worse than the button quietly appearing once
  // the probe lands. 'gate-off': authoring is off server-side — no way
  // in, by design.
  if (gate.state === 'probing' || gate.state === 'gate-off') return null;

  if (gate.state === 'unreachable') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <button
          disabled
          aria-label="Dungeon Builder — authoring server unreachable"
          title="authoring server unreachable — retry"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-primary)',
            cursor: 'not-allowed',
            opacity: 0.7,
          }}
        >
          🗺️ Dungeon Builder — authoring server unreachable
        </button>
        <button
          onClick={gate.retry}
          className="px-2 py-1 rounded text-xs"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--accent-primary)',
            border: '1px solid var(--border-primary)',
            cursor: 'pointer',
          }}
        >
          retry
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={onOpen}
      aria-label="Open Dungeon Builder"
      className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        backgroundColor: 'var(--accent-primary)',
        color: 'white',
        border: '1px solid var(--accent-primary)',
        cursor: 'pointer',
      }}
    >
      🗺️ Dungeon Builder
    </button>
  );
}
