/**
 * CombatPanelConcept (rpg-dnd5e-web#525) — the design-review bench for the
 * combat panel's information architecture.
 *
 * Round 5: D (HUD-skinned) is Kirk's pick, and the viewport assumption is
 * corrected — the real floor is 1024×768, typical play larger ("our
 * current concept feels like 800×600"). D scales up for the floor and
 * breathes upward; verbs render INLINE by default with class features as
 * a labeled inline group, the drop-down reduced to genuine width-pressure
 * overflow. Frames: 1024×768 (floor) / 1440×900 (typical) / 1920×1080.
 * C and E remain as references, as do A/B.
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
    id: 'hud-skinned',
    label: 'D — HUD-skinned (primary)',
    blurb:
      "Kirk's pick, tuned for the real viewport floor (1024×768): full-step-up sizes, stone-framed dock, sprite-tinted through theme tokens. Verbs inline — features as a labeled inline group; drop-down only under genuine width pressure. Round 6: no standing strip — teaching is a floating pill that appears only for non-obvious states; plain your-turn shows NOTHING.",
  },
  {
    id: 'comfort',
    label: 'C — Comfortable bar (ref)',
    blurb:
      'Round-4 token-only reference: same layout one size step down, no sprites.',
  },
  {
    id: 'cluster',
    label: 'E — Command cluster (ref)',
    blurb:
      'Round-4 alternate shape: identity card bottom-left, verb GRID bottom-center under a floating teaching pill, End Turn anchored bottom-right — floating over the map.',
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

/** Round-5 review frames — the corrected viewport reality (Kirk): the
 * floor is 1024×768, typical play is larger. Design FOR the floor, let it
 * breathe upward. (The 840×472 Discord frame is retired — it drove the
 * "feels like 800×600" over-compaction.) */
const FRAMES = {
  floor: { label: '1024×768 (floor)', width: 1024, height: 768 },
  typical: { label: '1440×900 (typical)', width: 1440, height: 900 },
  full: { label: '1920×1080', width: 1920, height: 1080 },
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
  const [composition, setComposition] = useState<CompositionId>('hud-skinned');
  const [frame, setFrame] = useState<FrameId>('floor');
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
      <ComfortBar {...panelProps} skin="hud" strip="pill" />
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
        Round-6 concepts for the combat panel (web#525). D (HUD-skinned) is
        Kirk's pick, tuned for the corrected viewport reality (floor 1024×768,
        typical larger) with verbs inline by default — features as a labeled
        inline group, drop-down only under genuine width pressure. Round 6
        removes the standing teaching strip from D: the plain your-turn state
        shows NO message (enabled verbs + the green initiative highlight already
        say it); contextual guidance appears as a floating pill above the dock
        only for the non-obvious states — armed, spectator, free-roam, ended,
        nothing-left, connecting — and vanishes when the state returns to plain
        your-turn. The freed row goes to the map. A hidden aria-live region
        keeps announcing every state for screen readers. Acceptance: fresh
        fixture = no pill; armed / spectator / free-roam = pill. Pool + cost
        badges unchanged (server economy_slot).
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
