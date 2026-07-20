/**
 * CombatPanelConcept (rpg-dnd5e-web#525 round 1) — the design-review bench
 * for the combat panel's information architecture.
 *
 * Two compositions built from the ui/combat primitives, a fixture-state
 * switcher covering the states that are hard to reach live, and a
 * Discord-viewport frame so review happens at true activity size. The
 * interactions are real: clicking a verb arms it (Esc cancels — the #514
 * flow), the reaction chip toggles, End Turn hands the turn to the goblin
 * (switches to the spectator fixture).
 */

import { useEffect, useState } from 'react';
import { CommandBar } from './CommandBar';
import { CommandBarWithContext } from './CommandBarWithContext';
import { COMBAT_PANEL_FIXTURES, type CombatPanelFixture } from './fixtures';

type CompositionId = 'command-bar' | 'with-context';

const COMPOSITIONS: { id: CompositionId; label: string; blurb: string }[] = [
  {
    id: 'with-context',
    label: 'B — Verbs + context strip',
    blurb:
      'Command bar plus a one-line teaching strip: what is the game waiting for, in words (#533 direction).',
  },
  {
    id: 'command-bar',
    label: 'A — Command bar only',
    blurb:
      'Verb-first single row: verbs loudest, economy as pips, End Turn as a real commit button, overflow summonable.',
  },
];

/** Discord activity viewport approximation for at-size review (#519). */
const DISCORD_FRAME = { width: 840, height: 472 };

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 13,
    cursor: 'pointer',
    background: active ? 'var(--accent-primary)' : 'var(--bg-secondary)',
    color: 'var(--text-primary)',
    border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
  };
}

export function CombatPanelConcept() {
  const [fixtureId, setFixtureId] = useState(COMBAT_PANEL_FIXTURES[0].id);
  const [composition, setComposition] = useState<CompositionId>('with-context');
  const [framed, setFramed] = useState(true);
  const [armedKey, setArmedKey] = useState<string | undefined>();
  const [reactionOverride, setReactionOverride] = useState<
    'ready' | 'armed' | undefined
  >();

  const baseFixture =
    COMBAT_PANEL_FIXTURES.find((f) => f.id === fixtureId) ??
    COMBAT_PANEL_FIXTURES[0];
  const fixture: CombatPanelFixture =
    reactionOverride && baseFixture.reaction !== 'spent'
      ? { ...baseFixture, reaction: reactionOverride }
      : baseFixture;

  // Selecting a fixture resets interaction state to the fixture's own.
  const selectFixture = (id: string) => {
    setFixtureId(id);
    setArmedKey(COMBAT_PANEL_FIXTURES.find((f) => f.id === id)?.armedActionKey);
    setReactionOverride(undefined);
  };

  // Esc cancels an armed action — the #514 keyboard path, live in the bench.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setArmedKey(undefined);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleVerb = (refId: string) =>
    setArmedKey((k) => (k === refId ? undefined : refId));
  const handleEndTurn = () => selectFixture('spectator');
  const handleToggleReaction = () =>
    setReactionOverride((r) => (r === 'armed' ? 'ready' : 'armed'));

  const panel =
    composition === 'command-bar' ? (
      <CommandBar
        fixture={fixture}
        armedKey={armedKey}
        onVerb={handleVerb}
        onEndTurn={handleEndTurn}
        onToggleReaction={handleToggleReaction}
      />
    ) : (
      <CommandBarWithContext
        fixture={fixture}
        armedKey={armedKey}
        onVerb={handleVerb}
        onEndTurn={handleEndTurn}
        onToggleReaction={handleToggleReaction}
      />
    );

  const activeComposition = COMPOSITIONS.find((c) => c.id === composition);

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        Round-1 IA concepts for the combat panel (web#525), composed from the
        ui/combat primitives on real proto types. Interactions are live: click a
        verb to arm it (Esc cancels), toggle the reaction chip, End Turn hands
        the turn over. The frame below is Discord-activity-sized — review at
        true size.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
          alignItems: 'center',
        }}
      >
        {COMPOSITIONS.map((c) => (
          <button
            key={c.id}
            style={chipStyle(composition === c.id)}
            onClick={() => setComposition(c.id)}
          >
            {c.label}
          </button>
        ))}
        <button style={chipStyle(framed)} onClick={() => setFramed((f) => !f)}>
          Discord frame {framed ? 'on' : 'off'}
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        {COMBAT_PANEL_FIXTURES.map((f) => (
          <button
            key={f.id}
            style={chipStyle(fixtureId === f.id)}
            onClick={() => selectFixture(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 13 }}>
        <strong style={{ color: 'var(--text-secondary)' }}>
          {activeComposition?.label}:
        </strong>{' '}
        {activeComposition?.blurb} · <em>{fixture.description}</em>
      </p>

      {framed ? (
        <div
          style={{
            width: DISCORD_FRAME.width,
            height: DISCORD_FRAME.height,
            maxWidth: '100%',
            border: '2px solid var(--border-primary)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-primary)',
          }}
        >
          {/* Stand-in for the maximized map — the panel is judged against
              how little room it takes from this. */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background:
                'radial-gradient(ellipse at center, var(--bg-secondary), var(--bg-primary))',
              color: 'var(--text-subtle)',
              fontFamily: 'Cinzel, serif',
              fontSize: 18,
            }}
          >
            — the map —
          </div>
          {panel}
        </div>
      ) : (
        panel
      )}
    </div>
  );
}
