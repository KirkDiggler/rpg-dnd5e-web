/**
 * CombatPanelConcept (rpg-dnd5e-web#525) — the design-review bench for the
 * combat panel's information architecture.
 *
 * Round 4: Kirk's direction — "the panel should be clear and large enough
 * to read; we can have as much room as feels comfortable; we swung in an
 * extreme direction to compensate for the wasted space from before."
 * Three new approaches join A/B (kept for reference):
 *   C — Comfortable bar: same verb-first IA at a humane scale, two rows.
 *   D — HUD-skinned bar: C's layout skinned with the Synty Fantasy Warrior
 *       sprites (form from sprites, color from theme tokens; token
 *       fallback when sprites are absent — they're gitignored).
 *   E — Command cluster: identity card + centered verb grid + anchored
 *       End Turn, floating over the map instead of a full-width dock.
 * Review at Discord activity size AND a comfortable desktop size — the
 * frame toggle switches between them.
 */

import { useEffect, useState } from 'react';
import { ComfortBar } from './ComfortBar';
import { CommandBar } from './CommandBar';
import { CommandBarWithContext } from './CommandBarWithContext';
import { CommandCluster } from './CommandCluster';
import { COMBAT_PANEL_FIXTURES, type CombatPanelFixture } from './fixtures';

type CompositionId =
  | 'comfort'
  | 'hud-skinned'
  | 'cluster'
  | 'with-context'
  | 'command-bar';

const COMPOSITIONS: { id: CompositionId; label: string; blurb: string }[] = [
  {
    id: 'comfort',
    label: 'C — Comfortable bar',
    blurb:
      'Round 4: the same verb-first IA at a humane scale — two deliberate rows, readable HP/AC numbers, full-size pips, large verbs. Height spent on clarity.',
  },
  {
    id: 'hud-skinned',
    label: 'D — HUD-skinned bar',
    blurb:
      "C's layout wearing the Synty Fantasy Warrior HUD sprites: stone-slab verbs, framed dock, sprite-tinted through theme tokens. Same components, different skin.",
  },
  {
    id: 'cluster',
    label: 'E — Command cluster',
    blurb:
      'A different shape entirely: identity card bottom-left, a GRID of large verbs bottom-center under a floating teaching pill, End Turn anchored bottom-right — all floating over the map.',
  },
  {
    id: 'with-context',
    label: 'B — Verbs + context strip (ref)',
    blurb:
      'Round-3 reference: the compact single-row bar plus the one-line teaching strip. What shipped as slice 1 — and what Kirk called "too far the other direction."',
  },
  {
    id: 'command-bar',
    label: 'A — Command bar only (ref)',
    blurb:
      'Round-2 reference: verb-first single row, no strip. Kept for comparison.',
  },
];

/** Review frames: Discord activity approximation (#519) and a comfortable
 * desktop window — round 4 judges compositions at BOTH. */
const FRAMES = {
  discord: { label: 'Discord (840×472)', width: 840, height: 472 },
  desktop: { label: 'Desktop (1200×675)', width: 1200, height: 675 },
} as const;
type FrameId = keyof typeof FRAMES | 'off';

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
  const [composition, setComposition] = useState<CompositionId>('comfort');
  const [frame, setFrame] = useState<FrameId>('discord');
  const [armedKey, setArmedKey] = useState<string | undefined>();
  const fixture: CombatPanelFixture =
    COMBAT_PANEL_FIXTURES.find((f) => f.id === fixtureId) ??
    COMBAT_PANEL_FIXTURES[0];

  // Selecting a fixture resets interaction state to the fixture's own.
  const selectFixture = (id: string) => {
    setFixtureId(id);
    setArmedKey(COMBAT_PANEL_FIXTURES.find((f) => f.id === id)?.armedActionKey);
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

  const panelProps = {
    fixture,
    armedKey,
    onVerb: handleVerb,
    onEndTurn: handleEndTurn,
  };

  // E floats over the map; the bar family docks below it.
  const isOverlayComposition = composition === 'cluster';

  const panel =
    composition === 'comfort' ? (
      <ComfortBar {...panelProps} skin="tokens" />
    ) : composition === 'hud-skinned' ? (
      <ComfortBar {...panelProps} skin="hud" />
    ) : composition === 'cluster' ? (
      <CommandCluster {...panelProps} />
    ) : composition === 'command-bar' ? (
      <CommandBar {...panelProps} />
    ) : (
      <CommandBarWithContext {...panelProps} />
    );

  const activeComposition = COMPOSITIONS.find((c) => c.id === composition);

  const mapStandIn = (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        position: 'relative',
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
      — the map —{isOverlayComposition && panel}
    </div>
  );

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: 12, fontSize: 14 }}>
        Round-4 concepts for the combat panel (web#525), on Kirk's direction:
        "the panel should be clear and large enough to read — we can have as
        much room as feels comfortable." Three approaches (C comfortable / D
        HUD-skinned / E cluster) join the A/B references. The pool + cost-badge
        model is unchanged throughout: every verb carries its pool-shape cost
        badge straight from the server's economy_slot. Interactions are live:
        click a verb to arm it (Esc cancels), End Turn hands the turn over.
        Review at Discord size AND desktop size — the frame toggle switches.
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
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
          alignItems: 'center',
        }}
      >
        {(Object.keys(FRAMES) as (keyof typeof FRAMES)[]).map((id) => (
          <button
            key={id}
            style={chipStyle(frame === id)}
            onClick={() => setFrame(id)}
          >
            {FRAMES[id].label}
          </button>
        ))}
        <button
          style={chipStyle(frame === 'off')}
          onClick={() => setFrame('off')}
        >
          Frame off
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

      {frame !== 'off' ? (
        <div
          style={{
            width: FRAMES[frame].width,
            height: FRAMES[frame].height,
            maxWidth: '100%',
            border: '2px solid var(--border-primary)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-primary)',
          }}
        >
          {mapStandIn}
          {!isOverlayComposition && panel}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: isOverlayComposition ? 360 : 0,
          }}
        >
          {isOverlayComposition ? mapStandIn : panel}
        </div>
      )}
    </div>
  );
}
