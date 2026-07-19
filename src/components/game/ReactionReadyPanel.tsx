/**
 * ReactionReadyPanel — GameView's real-HUD version of PlaytestHarness's
 * dev-panel reaction-readiness rows (Wave 2.11d). Lets the local player arm
 * or disarm the two reactions the toolkit ships today — Opportunity Attack
 * (free, default-on for melee combatants) and Shield (spell slot,
 * default-off) — mirroring the harness's `ready-reactions-panel` (rpg-dnd5e-web
 * #432 harness-parity: the real game view had NO surface for this at all,
 * so a player could never arm a reaction outside the harness).
 *
 * Same tri-state semantics as the harness: `state.reactionReadiness` carries
 * no UNKNOWN sentinel on the wire (the snapshot proto doesn't carry
 * reaction_readiness today, rpg-api-protos#158) — `undefined` means
 * "server-seeded state we haven't observed yet" and MUST render as
 * "unknown", never silently default to unready (which would lie about
 * server-seeded ready state and send a stale ready=true on the first click
 * to a server that already considered it ready).
 */

const REACTION_ROWS: Array<{
  refStr: string;
  refTriple: { module: string; type: string; id: string };
  label: string;
  hint: string;
}> = [
  {
    refStr: 'dnd5e:conditions:opportunity_attack',
    refTriple: {
      module: 'dnd5e',
      type: 'conditions',
      id: 'opportunity_attack',
    },
    label: 'Opportunity Attack',
    hint: 'Free — react when an enemy leaves your reach',
  },
  {
    refStr: 'dnd5e:spells:shield',
    refTriple: { module: 'dnd5e', type: 'spells', id: 'shield' },
    label: 'Shield',
    hint: 'Spell slot — react to add +5 AC when hit',
  },
];

export interface ReactionReadyPanelProps {
  /** This player's per-reaction readiness map (state.reactionReadiness.get(entityId)). */
  readiness: Map<string, boolean> | undefined;
  /** Whether a SetReactionReady RPC is currently in flight. */
  loading: boolean;
  /** Disables every toggle — passed true once the encounter has ended. */
  disabled: boolean;
  onToggle: (
    reactionRef: { module: string; type: string; id: string },
    ready: boolean
  ) => void;
}

export function ReactionReadyPanel({
  readiness,
  loading,
  disabled,
  onToggle,
}: ReactionReadyPanelProps) {
  return (
    <div data-testid="reaction-ready-panel" style={{ marginBottom: 8 }}>
      <div
        style={{
          fontSize: 11,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginBottom: 4,
        }}
      >
        Ready reactions
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {REACTION_ROWS.map((row) => {
          const ready = readiness?.get(row.refStr);
          // Tri-state label + next-action, same computation as the harness:
          // UNKNOWN clicks attempt ready=true (the opt-in action); KNOWN
          // clicks flip.
          const stateLabel =
            ready === undefined ? 'unknown' : ready ? 'READY' : 'unready';
          const nextReady = ready === undefined ? true : !ready;
          const ariaAction =
            ready === undefined ? 'ready' : ready ? 'unready' : 'ready';
          const background =
            ready === true
              ? '#2a3a2a'
              : ready === false
                ? '#2a2a2a'
                : '#1f1f1f';
          const color =
            ready === true ? '#9c9' : ready === false ? '#666' : '#888';
          const borderColor =
            ready === true ? '#4a6a4a' : ready === false ? '#444' : '#555';
          const borderStyle = ready === undefined ? 'dashed' : 'solid';

          return (
            <button
              key={row.refStr}
              type="button"
              data-testid={`reaction-toggle-${row.refStr}`}
              onClick={() => onToggle(row.refTriple, nextReady)}
              disabled={disabled || loading}
              aria-pressed={ready === true}
              aria-label={`${row.label}: ${stateLabel} (click to ${ariaAction})`}
              title={row.hint}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '4px 10px',
                background,
                color,
                border: `1px ${borderStyle} ${borderColor}`,
                borderRadius: 4,
                cursor: disabled || loading ? 'not-allowed' : 'pointer',
                fontFamily: 'monospace',
                fontSize: 12,
              }}
            >
              <span>{row.label}</span>
              <span style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>
                {stateLabel}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
