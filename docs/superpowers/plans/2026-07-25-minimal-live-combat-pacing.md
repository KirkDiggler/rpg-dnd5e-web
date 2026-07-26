# Minimal Live Combat Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the accepted d20 pacing surface on each real `EncounterView` `AttackResolved` callback without delaying authoritative combat behavior.

**Architecture:** Move the accepted fixture-neutral sequencer, stage, and verdict types to `src/components/game/combatPresentation/`; the concept remains their full multi-group fixture bench through a small fixture-to-generic-input adapter. A production `CombatPresentation` adapts one `CombatPresentationAttack` to the same generic sequencer with a fixed Cinematic input, while `EncounterView` owns a FIFO of those items and renders its head above the map.

**Tech Stack:** React 19, TypeScript, Vitest, React Testing Library, generated Connect proto types, existing shared `DiceTray`.

## Global Constraints

- Consume only each bare `AttackResolved` callback payload. Never consume envelope correlation, sequence, timestamp, action, damage, or completion metadata.
- `EncounterView` enqueues exactly `{ id: number; attack: AttackResolved; isViewerAttack: boolean }` per callback arrival. `id` is local queue/React identity only.
- The live adapter always supplies Cinematic timing. It has no NPC tier, role/ref/ID/HP heuristic, repeat compression, or pace setting.
- The local attacker (`attack.attackerEntityId === entityId`) receives tap-to-throw plus `AUTO_THROW_TIMEOUT_MS`; every other attack autoplays.
- Live theater reads only `hit`, `critical`, `attackRoll`, `attackBonus`, and `targetAc`; it shows no damage, impact tier, delayed log, or grouped events.
- State reducers, combat-log recording, targeting, movement, menus, and End Turn remain synchronous and enabled while theater runs.
- Use system `prefers-reduced-motion`; preserve settled face and one readable `role="status"` verdict while removing nonessential motion.
- Flush theater only on `SnapshotDelivered`, mode leaving `TURN_BASED`, encounter end, and component unmount. Never flush on `TurnStarted` or `TurnEnded`.
- The map overlay is absolute, centered, and `pointer-events: none`; only the armed throw control restores pointer input.
- Preserve the accepted `/concepts` scenario buttons, pace override, reduced-motion toggle, replay, viewport frames, tuning dials, delayed concept log, and event inspector. The concept must import the promoted production components.
- Do not change proto/API/toolkit contracts or `DiceTray`.

---

## File Structure

- Create: `src/components/game/combatPresentation/beatStageTypes.ts` — fixture-neutral attack view, presentation sequence, and verdict helper.
- Create: `src/components/game/combatPresentation/useBeatSequencer.ts` — existing generic multi-group timing behavior, moved from concepts.
- Create: `src/components/game/combatPresentation/BeatStage.tsx` — moved fixture-neutral verdict surface.
- Create: `src/components/game/combatPresentation/CombatPresentation.tsx` — one-item live adapter, system reduced motion, shared tray, and throw button.
- Create: `src/components/game/combatPresentation/*.test.ts[x]` — moved existing meaningful tests plus live-adapter coverage.
- Modify: `src/concepts/combat-pacing/CombatPacingConcept.tsx` — preserve controls; adapt fixtures into production generic interfaces.
- Modify: `src/concepts/combat-pacing/CombatPacingConcept.test.tsx` — preserve accepted assertions and prove production imports are used.
- Modify: `src/components/game/EncounterView.tsx` and `.test.tsx` — FIFO, overlay, immediate callback behavior, and permitted flushes.

### Task 1: Promote The Generic Sequencer And Stage

**Files:**

- Create: `src/components/game/combatPresentation/beatStageTypes.ts`
- Create: `src/components/game/combatPresentation/useBeatSequencer.ts`
- Create: `src/components/game/combatPresentation/BeatStage.tsx`
- Create: `src/components/game/combatPresentation/useBeatSequencer.test.ts`
- Create: `src/components/game/combatPresentation/BeatStage.test.tsx`
- Modify: `src/concepts/combat-pacing/CombatPacingConcept.tsx`
- Delete: `src/concepts/combat-pacing/beatStageTypes.ts`
- Delete: `src/concepts/combat-pacing/useBeatSequencer.ts`
- Delete: `src/concepts/combat-pacing/useBeatSequencer.test.ts`
- Delete: `src/concepts/combat-pacing/BeatStage.tsx`
- Delete: `src/concepts/combat-pacing/BeatStage.test.tsx`

**Interfaces:**

- Consumes: `AttackResolvedLike`, `groupByCorrelation`, and concept-only `ImpactTier` only in `CombatPacingConcept.tsx`.
- Produces: `BeatAttackView`, `PresentationGroup<T>`, `BeatSequence<T>`, `useBeatSequencer<T>(sequence, options)`, and `BeatStage` from the production directory.

- [ ] **Step 1: Move the existing sequencer and stage tests before changing behavior**

Move the two test files without weakening or deleting assertions:

```bash
mkdir -p src/components/game/combatPresentation
git mv src/concepts/combat-pacing/useBeatSequencer.test.ts src/components/game/combatPresentation/useBeatSequencer.test.ts
git mv src/concepts/combat-pacing/BeatStage.test.tsx src/components/game/combatPresentation/BeatStage.test.tsx
```

Change only their imports to the moved production modules:

```ts
import { SCENARIOS } from '../../../concepts/combat-pacing/fixtures';
import {
  groupByCorrelation,
  type AttackResolvedLike,
} from '../../../concepts/combat-pacing/fixtures';
import type { BeatSequence } from './beatStageTypes';
import {
  AUTO_THROW_TIMEOUT_MS,
  REDUCED_MOTION_THROW_MS,
  useBeatSequencer,
} from './useBeatSequencer';

const sequence = (id: string): BeatSequence<AttackResolvedLike> => {
  const fixture = SCENARIOS.find((scenario) => scenario.id === id)!;
  return {
    identity: fixture,
    pace: fixture.pace,
    groups: groupByCorrelation(fixture.events).map((group) => ({
      id: group.correlationId,
      attack: group.attack,
      isViewerAttack: group.attack?.attackerEntityId === fixture.viewerEntityId,
    })),
  };
};
```

Replace every existing `useBeatSequencer(scenario('...'))` test call with `useBeatSequencer(sequence('...'))`; for the existing Instant and reduced-motion rerender tests, wrap each derived fixture in the same `BeatSequence` shape with `identity` set to that derived fixture object. Keep every existing assertion and fake-timer duration unchanged.

```tsx
import { BeatStage } from './BeatStage';
import type { BeatAttackView } from './beatStageTypes';
```

- [ ] **Step 2: Run moved tests to verify the import failure**

Run: `npx vitest run src/components/game/combatPresentation/useBeatSequencer.test.ts src/components/game/combatPresentation/BeatStage.test.tsx`

Expected: FAIL with unresolved `./useBeatSequencer` and `./BeatStage` imports because production modules have not been created.

- [ ] **Step 3: Move the reusable files and make their interfaces fixture-neutral**

Move the three implementation files, then replace `beatStageTypes.ts` with:

```ts
export interface BeatAttackView {
  attackerEntityId: string;
  hit: boolean;
  critical: boolean;
  attackRoll: number;
  attackBonus: number;
  targetAc: number;
}

export type Pace = 'cinematic' | 'brisk' | 'instant';
export interface PresentationGroup<T extends BeatAttackView> {
  id: string;
  attack?: T;
  isViewerAttack: boolean;
}
export interface BeatSequence<T extends BeatAttackView> {
  identity: object;
  pace: Pace;
  groups: readonly PresentationGroup<T>[];
}
export type VerdictLabel = 'HIT' | 'MISS' | 'CRIT' | 'NAT-1' | '';

export function verdictLabel(attack?: BeatAttackView): VerdictLabel {
  if (!attack) return '';
  if (attack.critical) return 'CRIT';
  if (attack.attackRoll === 1 && !attack.hit) return 'NAT-1';
  return attack.hit ? 'HIT' : 'MISS';
}
```

```bash
git mv src/concepts/combat-pacing/beatStageTypes.ts src/components/game/combatPresentation/beatStageTypes.ts
git mv src/concepts/combat-pacing/useBeatSequencer.ts src/components/game/combatPresentation/useBeatSequencer.ts
git mv src/concepts/combat-pacing/BeatStage.tsx src/components/game/combatPresentation/BeatStage.tsx
```

In the moved sequencer, replace the fixture imports and scenario signature with the exact generic interface below. Keep all existing `beatRef`, `groupIndexRef`, timer cleanup, `releasedGroupCount`, `throwDie`, `skip`, Cinematic/Brisk/Instant, crit stretch, and reduced-motion behavior unchanged.

```ts
import type {
  BeatAttackView,
  BeatSequence,
  PresentationGroup,
} from './beatStageTypes';

export interface BeatSequencerState<T extends BeatAttackView> {
  beat: BeatName;
  groupIndex: number;
  groupCount: number;
  group?: PresentationGroup<T>;
  releasedGroupCount: number;
  throwDie: () => void;
  skip: () => void;
}

export function useBeatSequencer<T extends BeatAttackView>(
  sequence: BeatSequence<T>,
  options: UseBeatSequencerOptions = {}
): BeatSequencerState<T> {
```

Replace the fixture grouping initialization and reset with the generic groups:

```ts
const [groups, setGroupsState] = useState<PresentationGroup<T>[]>(() => [
  ...sequence.groups,
]);
const groupsRef = useRef<PresentationGroup<T>[]>(groups);
const prevIdentityRef = useRef<object | undefined>(undefined);

const setGroups = (next: PresentationGroup<T>[]) => {
  groupsRef.current = next;
  setGroupsState(next);
};

useEffect(() => {
  const sequenceChanged = prevIdentityRef.current !== sequence.identity;
  prevIdentityRef.current = sequence.identity;
  if (sequenceChanged) {
    const nextGroups = [...sequence.groups];
    setGroups(nextGroups);
    setGroupIndex(0);
    setReleasedGroupCount(0);
    startGroup(0);
  } else {
    clearTimer();
    startGroup(groupIndexRef.current);
  }
  return clearTimer;
}, [sequence.identity, reducedMotion]);
```

Use `sequence.pace` everywhere the old hook read `scenario.pace`; use `group.isViewerAttack` where it read `scenario.role === 'self'`; use `group.id` wherever it exposed a correlation identifier. `BeatSequencerState<T>` must be the existing state interface with `group?: PresentationGroup<T>` and no fixture imports.

In `BeatStage.tsx`, replace imports with production-local imports and replace the fixture-only prop type:

```tsx
import type { BeatAttackView } from './beatStageTypes';
import { verdictLabel } from './beatStageTypes';
import type { BeatName } from './useBeatSequencer';

export interface BeatStageProps {
  beat: BeatName;
  placement: Placement;
  attack?: BeatAttackView;
  reducedMotion: boolean;
  announce?: boolean;
  persistResult?: boolean;
  impactTier?: string;
  presentationOutcome?: VerdictLabel;
}
```

No production file may import `fixtures.ts`, `ImpactTier`, a proto event envelope, or concept controls.

- [ ] **Step 4: Adapt the concept without reducing it**

Keep every existing state variable, control, rendered dial, inspector, and test-facing identifier in `CombatPacingConcept.tsx`. Replace only its three local imports and the sequencer input:

```tsx
import { BeatStage } from '../../components/game/combatPresentation/BeatStage';
import {
  verdictLabel,
  type BeatSequence,
  type VerdictLabel,
} from '../../components/game/combatPresentation/beatStageTypes';
import { useBeatSequencer } from '../../components/game/combatPresentation/useBeatSequencer';
```

Add `type AttackResolvedLike` to the existing fixtures import, then replace `useBeatSequencer(effectiveScenario, { reducedMotion })` with this memoized adapter and call:

```tsx
const sequence = useMemo<BeatSequence<AttackResolvedLike>>(
  () => ({
    identity: effectiveScenario,
    pace: effectiveScenario.pace,
    groups: groupByCorrelation(effectiveScenario.events).map((group) => ({
      id: group.correlationId,
      attack: group.attack,
      isViewerAttack:
        group.attack?.attackerEntityId === effectiveScenario.viewerEntityId,
    })),
  }),
  [effectiveScenario]
);
const seq = useBeatSequencer(sequence, { reducedMotion });
```

This preserves pace override, replay identity, multi-group repeat compression, fixture-only impact lookup by `seq.group?.id`, inspector correlation display, and all existing controls. Do not change the component JSX outside imports and this adapter.

Replace the existing fixture-shaped impact lookup with the generic group id:

```tsx
const impactTier = group
  ? effectiveScenario.presentationByCorrelation?.[group.id]?.impactTier
  : undefined;
```

- [ ] **Step 5: Run promoted and concept regression tests**

Run: `npx vitest run src/components/game/combatPresentation/useBeatSequencer.test.ts src/components/game/combatPresentation/BeatStage.test.tsx src/concepts/combat-pacing/CombatPacingConcept.test.tsx src/concepts/combat-pacing/fixtures.test.ts`

Expected: PASS. Existing scenario/pacing/replay/tuning/inspector assertions remain meaningful; moved tests also prove identical sequencing, identity reset, and reduced-motion restart behavior.

- [ ] **Step 6: Commit the independently reviewable promotion**

```bash
git add src/components/game/combatPresentation src/concepts/combat-pacing
git commit -m "refactor(combat): promote pacing sequencer and stage (#581)"
```

### Task 2: Add The One-Attack Live Adapter

**Files:**

- Create: `src/components/game/combatPresentation/CombatPresentation.tsx`
- Create: `src/components/game/combatPresentation/CombatPresentation.test.tsx`

**Interfaces:**

- Consumes: `AttackResolved`, `BeatSequence<AttackResolved>`, `useBeatSequencer`, `BeatStage`, and shared `DiceTray`.
- Produces: `CombatPresentationAttack` and `<CombatPresentation item={item} onComplete={onComplete} />`.

- [ ] **Step 1: Write failing one-item adapter tests**

```tsx
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useReducedMotion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CombatPresentation,
  type CombatPresentationAttack,
} from './CombatPresentation';
import { AUTO_THROW_TIMEOUT_MS, CINEMATIC } from './useBeatSequencer';

vi.mock('framer-motion', () => ({ useReducedMotion: vi.fn() }));

const item = (
  overrides: Partial<CombatPresentationAttack['attack']> = {}
): CombatPresentationAttack => ({
  id: 7,
  isViewerAttack: true,
  attack: {
    attackerEntityId: 'char-alice',
    targetEntityId: 'goblin-1',
    attackRoll: 14,
    attackBonus: 5,
    targetAc: 16,
    hit: true,
    critical: false,
    ...overrides,
  } as CombatPresentationAttack['attack'],
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(useReducedMotion).mockReturnValue(false);
});
afterEach(() => vi.useRealTimers());

describe('CombatPresentation', () => {
  it('arms a viewer attack, throws on tap, and completes its stable item id', () => {
    const complete = vi.fn();
    render(<CombatPresentation item={item()} onComplete={complete} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() =>
      vi.advanceTimersByTime(
        CINEMATIC.throw +
          CINEMATIC.verdict +
          CINEMATIC.impact +
          CINEMATIC.release
      )
    );
    expect(complete).toHaveBeenCalledWith(7);
  });
  it('auto-throws after the existing timeout', () => {
    render(<CombatPresentation item={item()} onComplete={() => {}} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue + AUTO_THROW_TIMEOUT_MS));
    expect(screen.getByTestId('combat-presentation')).toHaveAttribute(
      'data-beat',
      'throw'
    );
  });
  it('autoplays and completes a non-viewer miss with no throw control and one MISS status', () => {
    const complete = vi.fn();
    render(
      <CombatPresentation
        item={{
          ...item({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 }),
          isViewerAttack: false,
        }}
        onComplete={complete}
      />
    );
    act(() => vi.advanceTimersByTime(CINEMATIC.cue + CINEMATIC.throw));
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('MISS');
    act(() => vi.advanceTimersByTime(CINEMATIC.verdict + CINEMATIC.release));
    expect(complete).toHaveBeenCalledWith(7);
  });
  it.each([
    [{ critical: true, attackRoll: 20 }, 'CRIT'],
    [{ hit: false, critical: false, attackRoll: 1 }, 'NAT-1'],
  ])(
    'renders the existing resolved %s outcome without new metadata',
    (overrides, label) => {
      render(
        <CombatPresentation item={item(overrides)} onComplete={() => {}} />
      );
      act(() => vi.advanceTimersByTime(CINEMATIC.cue));
      fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
      act(() => vi.advanceTimersByTime(CINEMATIC.throw));
      expect(screen.getByRole('status')).toHaveTextContent(label);
    }
  );
  it('uses the system reduced-motion preference for the live tray and throw', () => {
    vi.mocked(useReducedMotion).mockReturnValue(true);
    render(<CombatPresentation item={item()} onComplete={() => {}} />);
    act(() => vi.advanceTimersByTime(CINEMATIC.cue));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    expect(screen.getByTestId('dice-tray')).toHaveClass(
      'dice-tray--reduced-motion'
    );
    act(() => vi.advanceTimersByTime(80));
    expect(screen.getByRole('status')).toHaveTextContent('HIT');
  });
});
```

- [ ] **Step 2: Run the adapter test to verify it fails**

Run: `npx vitest run src/components/game/combatPresentation/CombatPresentation.test.tsx`

Expected: FAIL with unresolved `./CombatPresentation`.

- [ ] **Step 3: Implement the adapter with a stable generic identity**

Create `CombatPresentation.tsx`:

```tsx
import type { AttackResolved } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/events_pb';
import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import { DiceTray, type DiceTrayPhase } from '../../ui/dice/DiceTray';
import { BeatStage } from './BeatStage';
import { type BeatSequence, verdictLabel } from './beatStageTypes';
import { useBeatSequencer } from './useBeatSequencer';

export interface CombatPresentationAttack {
  id: number;
  attack: AttackResolved;
  isViewerAttack: boolean;
}
function trayPhase(beat: string): DiceTrayPhase {
  if (beat === 'cue') return 'entering';
  if (beat === 'armed') return 'ready';
  if (beat === 'throw') return 'rolling';
  if (beat === 'release') return 'exiting';
  return 'settled';
}

export function CombatPresentation({
  item,
  onComplete,
}: {
  item: CombatPresentationAttack;
  onComplete: (id: number) => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const sequence = useMemo<BeatSequence<AttackResolved>>(
    () => ({
      identity: item,
      pace: 'cinematic',
      groups: [
        {
          id: String(item.id),
          attack: item.attack,
          isViewerAttack: item.isViewerAttack,
        },
      ],
    }),
    [item]
  );
  const seq = useBeatSequencer(sequence, { reducedMotion });
  useEffect(() => {
    if (seq.beat === 'done') onComplete(item.id);
  }, [item.id, onComplete, seq.beat]);
  const outcome = ['verdict', 'impact', 'release'].includes(seq.beat)
    ? verdictLabel(item.attack)
    : '';
  return (
    <div
      data-testid="combat-presentation"
      data-beat={seq.beat}
      style={{ pointerEvents: 'none' }}
    >
      <DiceTray
        phase={trayPhase(seq.beat)}
        finalFace={item.attack.attackRoll}
        outcome={outcome}
        reducedMotion={reducedMotion}
      >
        <BeatStage
          beat={seq.beat}
          placement="center-stage"
          attack={item.attack}
          reducedMotion={reducedMotion}
        />
      </DiceTray>
      {seq.beat === 'armed' && (
        <button
          type="button"
          aria-label="Roll d20"
          onClick={seq.throwDie}
          style={{ pointerEvents: 'auto' }}
        >
          Roll d20
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run adapter tests to verify they pass**

Run: `npx vitest run src/components/game/combatPresentation/CombatPresentation.test.tsx src/components/ui/dice/DiceTray.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit the adapter**

```bash
git add src/components/game/combatPresentation/CombatPresentation.tsx src/components/game/combatPresentation/CombatPresentation.test.tsx
git commit -m "feat(combat): add live attack presentation adapter (#581)"
```

### Task 3: Queue Live Attacks Without Delaying State

**Files:**

- Modify: `src/components/game/EncounterView.tsx`
- Modify: `src/components/game/EncounterView.test.tsx`

**Interfaces:**

- Consumes: `CombatPresentationAttack` and `CombatPresentation` from Task 2.
- Produces: FIFO presentation for bare `onAttackResolved` callback arrivals; no new stream interface.

- [ ] **Step 1: Add failing EncounterView integration tests using current helpers**

Append this describe block. It uses the existing `makeEvent(caseName, value)`, `hoisted.fakeRef.current`, `EncounterMap` stub, and actual attack log kind (`attack`), not invented stream helpers.

```tsx
describe('EncounterView combat pacing', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const attack = (overrides = {}) =>
    makeEvent('attackResolved', {
      attackerEntityId: 'char-alice',
      targetEntityId: 'goblin-1',
      attackRoll: 14,
      attackBonus: 5,
      targetAc: 16,
      hit: true,
      critical: false,
      ...overrides,
    });
  it('queues callback arrivals, records each attack immediately, and advances from viewer to autoplay attack', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
      hoisted.fakeRef.current?.push(attack());
      hoisted.fakeRef.current?.push(
        attack({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 })
      );
      await Promise.resolve();
    });
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-attack-1')).toBeTruthy();
    act(() => vi.advanceTimersByTime(300));
    fireEvent.click(screen.getByRole('button', { name: 'Roll d20' }));
    act(() => vi.advanceTimersByTime(2000 + 1600 + 900 + 300));
    expect(screen.queryByRole('button', { name: 'Roll d20' })).toBeNull();
    expect(screen.getByTestId('combat-presentation')).toHaveAttribute(
      'data-beat',
      'cue'
    );
    act(() => vi.advanceTimersByTime(300));
    expect(screen.getByTestId('combat-presentation')).toHaveAttribute(
      'data-beat',
      'throw'
    );
  });
  it('applies HP and the damage log immediately while theater is active', async () => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    await act(async () => {
      hoisted.fakeRef.current?.push(
        makeEvent('snapshotDelivered', {
          encounter: {
            space: {
              entities: [
                {
                  id: 'char-alice',
                  position: { x: 0, y: 0, z: 0 },
                  type: EntityType.CHARACTER,
                  hp: { current: 20, max: 20, temp: 0 },
                },
              ],
            },
          },
        })
      );
      hoisted.fakeRef.current?.push(attack());
      hoisted.fakeRef.current?.push(
        makeEvent('entityDamaged', {
          entityId: 'char-alice',
          sourceEntityId: 'goblin-1',
          amount: 7,
          damageType: { module: 'dnd5e', type: 'damage', id: 'slashing' },
          damageBreakdown: [],
          hpAfter: { current: 13, max: 20, temp: 0 },
        })
      );
      await Promise.resolve();
    });
    expect(screen.getByText(/HP: 13\/20/)).toBeTruthy();
    expect(screen.getByTestId('combat-log-entry-damage-1')).toBeTruthy();
    expect(screen.getByTestId('combat-presentation').textContent).not.toContain(
      '7'
    );
  });
});
```

- [ ] **Step 2: Run the integration test to verify it fails**

Run: `npx vitest run src/components/game/EncounterView.test.tsx`

Expected: FAIL because no `combat-presentation` is rendered.

- [ ] **Step 3: Implement FIFO, permitted flushes, and map overlay**

Add these imports and state after `const combatLog = useCombatLog();`:

```tsx
import {
  CombatPresentation,
  type CombatPresentationAttack,
} from './combatPresentation/CombatPresentation';
import { useEffect, useRef, useState } from 'react';

const [presentationQueue, setPresentationQueue] = useState<
  CombatPresentationAttack[]
>([]);
const presentationIdRef = useRef(0);
const flushPresentation = () => setPresentationQueue([]);
const completePresentation = (id: number) =>
  setPresentationQueue((queue) =>
    queue[0]?.id === id ? queue.slice(1) : queue
  );
const activePresentation = presentationQueue[0];
```

Keep one consolidated React import (`useEffect, useRef, useState`), not two imports. Add `flushPresentation()` as the first statement in `onSnapshotDelivered`, after state/log work in `onModeChanged` only when `e.to !== EncounterMode.TURN_BASED`, and after existing work in `onEncounterEnded`. Do not call it in `onTurnStarted` or `onTurnEnded`.

Replace only `onAttackResolved` with:

```tsx
onAttackResolved: (e) => {
  combatLog.recordAttackResolved(e);
  setPresentationQueue((queue) => [...queue, { id: ++presentationIdRef.current, attack: e, isViewerAttack: e.attackerEntityId === entityId }]);
},
```

Insert after `</EncounterMap>` in the existing relative map container:

```tsx
{
  activePresentation && (
    <div
      data-testid="combat-presentation-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <CombatPresentation
        key={activePresentation.id}
        item={activePresentation}
        onComplete={completePresentation}
      />
    </div>
  );
}
```

- [ ] **Step 4: Add and run lifecycle/input regression assertions**

Append these tests inside the Task 3 describe block:

```tsx
it.each([
  ['snapshotDelivered', {}],
  [
    'modeChanged',
    {
      from: EncounterMode.TURN_BASED,
      to: EncounterMode.FREE_ROAM,
      reason: 'leave combat',
    },
  ],
  ['encounterEnded', { reason: 'complete' }],
])(
  'flushes only on %s and retains the immediate attack log',
  async (caseName, value) => {
    render(
      <EncounterView
        encounterId="enc-1"
        characterId="char-alice"
        playerId="alice"
        onBack={() => {}}
      />
    );
    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
      hoisted.fakeRef.current?.push(attack());
      await Promise.resolve();
    });
    await act(async () => {
      hoisted.fakeRef.current?.push(makeEvent(caseName, value));
      await Promise.resolve();
    });
    act(() => vi.runAllTimers());
    expect(screen.queryByTestId('combat-presentation')).toBeNull();
    expect(screen.getByTestId('combat-log-entry-attack-0')).toBeTruthy();
  }
);
it('keeps theater through normal turn boundaries', async () => {
  render(
    <EncounterView
      encounterId="enc-1"
      characterId="char-alice"
      playerId="alice"
      onBack={() => {}}
    />
  );
  await act(async () => {
    hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
    hoisted.fakeRef.current?.push(
      attack({ attackerEntityId: 'npc-1', hit: false, attackRoll: 8 })
    );
    hoisted.fakeRef.current?.push(
      makeEvent('turnEnded', { entityId: 'npc-1', round: 1 })
    );
    hoisted.fakeRef.current?.push(
      makeEvent('turnStarted', { entityId: 'char-alice', round: 2 })
    );
    await Promise.resolve();
  });
  expect(screen.getByTestId('encounter-map-stub')).toHaveAttribute(
    'data-active-entity-id',
    'char-alice'
  );
  expect(screen.getByTestId('combat-presentation')).toHaveAttribute(
    'data-beat',
    'cue'
  );
  act(() => vi.advanceTimersByTime(300 + 2000));
  expect(screen.getByRole('status')).toHaveTextContent('MISS');
});
it('does not intercept the existing map click while theater is armed', async () => {
  hoisted.takeActionFn.mockResolvedValue({} as TakeActionResponse);
  render(
    <EncounterView
      encounterId="enc-1"
      characterId="char-alice"
      playerId="alice"
      onBack={() => {}}
    />
  );
  await act(async () => {
    hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
    hoisted.fakeRef.current?.push(attack());
    await Promise.resolve();
  });
  act(() => vi.advanceTimersByTime(300));
  fireEvent.click(screen.getByTestId('stub-click-goblin'));
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByTestId('combat-presentation-overlay')).toHaveStyle({
    pointerEvents: 'none',
  });
  expect(hoisted.takeActionFn).toHaveBeenCalledOnce();
});
it('cancels timer callbacks on unmount', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const view = render(
    <EncounterView
      encounterId="enc-1"
      characterId="char-alice"
      playerId="alice"
      onBack={() => {}}
    />
  );
  await act(async () => {
    hoisted.fakeRef.current?.push(makeEvent('snapshotDelivered', {}));
    hoisted.fakeRef.current?.push(attack());
    await Promise.resolve();
  });
  view.unmount();
  act(() => vi.runAllTimers());
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});
```

Run: `npx vitest run src/components/game/EncounterView.test.tsx src/components/game/combatPresentation/CombatPresentation.test.tsx`

Expected: PASS. The tests prove only permitted flushes, immediate state/log behavior, live FIFO order, unblocked map input, and unmount timer cleanup.

- [ ] **Step 5: Commit the integration**

```bash
git add src/components/game/EncounterView.tsx src/components/game/EncounterView.test.tsx
git commit -m "feat(combat): queue resolved attacks on the encounter map (#581)"
```

### Task 4: Verify The Full Slice

**Files:**

- Modify: none

- [ ] **Step 1: Run targeted tests**

Run: `npx vitest run src/components/game/combatPresentation/useBeatSequencer.test.ts src/components/game/combatPresentation/BeatStage.test.tsx src/components/game/combatPresentation/CombatPresentation.test.tsx src/components/game/EncounterView.test.tsx src/concepts/combat-pacing/CombatPacingConcept.test.tsx src/concepts/combat-pacing/fixtures.test.ts`

Expected: PASS.

- [ ] **Step 2: Run CI**

Run: `npm run ci-check`

Expected: exit status 0.

- [ ] **Step 3: Perform player-route browser verification**

Use the already-running local game stack (Envoy at `http://localhost:8080`). Start only this worktree's web client:

```bash
VITE_API_HOST=http://localhost:8080 npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/?playerId=alice`, select Alice's existing character, and enter the existing encounter through the normal player route. Capture the visible state with:

```bash
node /home/kirk/game-dev/tools/browser/screenshot.mjs 'http://127.0.0.1:5173/?playerId=alice' /tmp/combat-pacing-player-route.png
```

Expected: one local hit and one local miss visibly present; local tap and timeout both work; NPC/player-spectator attacks autoplay; HP/log/input remain immediate; normal turn boundaries do not clear theater; snapshot, turn-based-mode exit, and encounter end clear it; `/concepts` retains every accepted control and uses the promoted components.

- [ ] **Step 4: Inspect without pushing**

Run: `git diff --check && git status --short`

Expected: no whitespace errors. Do not push or open a pull request.

## Plan Self-Review

- Spec coverage: Tasks 1-2 preserve the accepted generic concept behavior while adding a fixed-Cinematic, one-attack live adapter. Task 3 covers FIFO arrival order, immediate authority/logging, pointer behavior, and exactly the approved lifecycle flush set. Task 4 covers targeted tests, CI, and real player-route evidence.
- Placeholder scan: no unresolved implementation markers or unspecified commands remain.
- Type consistency: concept fixtures adapt to `BeatSequence<AttackResolvedLike>`; the live adapter adapts `CombatPresentationAttack` to `BeatSequence<AttackResolved>`; both call the same generic `useBeatSequencer`; `EncounterView` alone assigns numeric queue IDs.
