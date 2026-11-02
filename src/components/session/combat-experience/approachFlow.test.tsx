/**
 * INTERACTION IS BY REACH (rpg-project#753 R4, T5). Afford's Speak rows cover
 * only the creatures and props within interaction reach; a far one is reached
 * by walking toward it, and its lines appear on arrival.
 *
 * Driven end to end on the client: the combat hook, the ordinary walk hook
 * that composes every Move, and the surface, wired the way
 * `SessionEncounterView` wires them. The map is a stand-in that routes a
 * click the way `SessionCanvas` does: a listed target to `onTargetClick`,
 * any other live creature to `onApproachClick`.
 */
import type { SpeakTarget } from '@/api/useSessionSpeak';
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeclarationSchema,
  MemberKind,
  ParticipantSchema,
  SpeakOptionSchema,
  Standing,
  TargetKind,
  Verb,
  type Declaration,
  type SpeakOption,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { coordToKey, hexDistance } from '../../hex-grid/hexMath';
import { buildAtlasPathIndex, INTERACTION_REACH } from '../atlasPath';
import { positionToCube } from '../positionBridge';
import { selectCombatExperience } from './selection';
import { TargetSurface } from './TargetSurface';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  moveFn: vi.fn(),
  speakFn: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    move: hoisted.moveFn,
    speak: hoisted.speakFn,
  },
}));

// Import AFTER vi.mock so the mock is applied.
import { useSessionWalk, type MoveOutcome } from '../useSessionWalk';

const pos = (x: number, y: number) => ({ x, y }) as never;
const bard = create(ParticipantSchema, {
  member: 'bard-1',
  name: 'Standre',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
});
const names = new Map([
  ['bard-1', 'Standre'],
  ['cook-3', 'Cook'],
  ['guard-2', 'Guard'],
]);

/** The great hall to the kitchen as a straight run of floor (q, 0), q=0..11:
 * the bard at q=0, the cook at q=9 — nine hexes off, far beyond reach. */
const COOK_AT = positionToCube(pos(9, 0));
const where = { x: 0, y: 0 } as never;
const pathIndex = buildAtlasPathIndex(
  {
    cells: Array.from({ length: 12 }, (_, q) => pos(q, 0)),
    boundaries: [],
    doorways: [],
    props: [],
  },
  undefined,
  new Set([coordToKey(COOK_AT)])
);

function speak(rows: SpeakOption[]): Declaration {
  return create(DeclarationSchema, {
    id: 'v2.speak.castle.1',
    verb: Verb.SPEAK,
    available: true,
    targetKind: TargetKind.MEMBER,
    speakOptions: rows,
  });
}
const cookLine = create(SpeakOptionSchema, {
  target: { case: 'memberId', value: 'cook-3' },
  optionId: 'gossip',
  line: 'Heard anything?',
  available: true,
});

const guardLine = create(SpeakOptionSchema, {
  target: { case: 'memberId', value: 'guard-2' },
  optionId: 'hail',
  line: 'Long night?',
  available: true,
});

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({ declarations }: { declarations: readonly Declaration[] }) {
  // Turn/Afford freshness as the view keeps it: revoked when a Move is
  // accepted, fresh again when the refreshed offer lands.
  const [fresh, setFresh] = useState(true);
  useEffect(() => setFresh(true), [declarations]);
  const approachRef = useRef<
    (target: SpeakTarget, outcome: MoveOutcome) => boolean
  >(() => false);
  latest = useSessionCombatExperience({
    session: 'castle',
    member: 'bard-1',
    clock: ClockKind.WORLD,
    active: '',
    authorityFresh: fresh,
    memberNames: names,
    participants: [bard],
    declarations,
    invalidateAuthoritySnapshots: () => setFresh(false),
    scheduleRefresh: () => {},
    approach: (target, outcome) => approachRef.current(target, outcome),
  });
  const combat = latest;
  const walk = useSessionWalk(
    'castle',
    'bard-1',
    pathIndex,
    where,
    async () => {},
    '',
    undefined,
    () => true,
    () => combat.invalidateAuthority()
  );
  approachRef.current = (target, outcome) =>
    target.case === 'memberId' && target.value === 'cook-3'
      ? walk.approach(COOK_AT, INTERACTION_REACH, outcome)
      : false;
  const state = latest.presentationState;
  return (
    <TargetSurface
      phase={latest.phase}
      selection={selectCombatExperience(declarations, state)}
      isViewerTurn={false}
      showTurnNotice={false}
      memberNames={names}
      location={{ name: 'The Castle', area: 'Great hall' }}
      renderMap={({ attackableTargets, onTargetClick, onApproachClick }) => (
        <button
          type="button"
          onClick={() =>
            attackableTargets.includes('cook-3')
              ? onTargetClick('cook-3')
              : onApproachClick?.({ case: 'memberId', value: 'cook-3' })
          }
        >
          the cook on the map
        </button>
      )}
      onTargetClick={latest.onTargetClick}
      speakTarget={state.speakTarget}
      onChooseSpeakTarget={latest.onChooseSpeakTarget}
      onSpeakOption={latest.onSpeakOption}
      onApproachTarget={latest.onApproachTarget}
      onCancelSelection={latest.onCancelSelection}
    />
  );
}

beforeEach(() => {
  hoisted.moveFn.mockReset();
  // The server walks exactly the path asked for.
  hoisted.moveFn.mockImplementation(
    async (request: { path: { x: number; y: number }[] }) => ({
      steps: request.path.map((position) => ({ position })),
    })
  );
  hoisted.speakFn.mockReset();
});

describe('clicking a creature beyond reach (rpg-project#753 R4)', () => {
  it('composes a Move toward it that stops at the first cell within reach', async () => {
    const far = speak([]);
    render(<Harness declarations={[far]} />);
    act(() => latest.onSelectDeclaration(far));

    await act(async () => {
      fireEvent.click(screen.getByText('the cook on the map'));
    });

    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
    const request = hoisted.moveFn.mock.calls[0]![0] as {
      path: { x: number; y: number }[];
      declarationId: string;
    };
    const cells = request.path.map((position) => positionToCube(position));
    const last = cells[cells.length - 1]!;
    // Within reach of the cook, and never her own cell.
    expect(hexDistance(last, COOK_AT)).toBe(INTERACTION_REACH);
    // The FIRST cell within reach: every earlier step is still out of it.
    for (const cell of cells.slice(0, -1)) {
      expect(hexDistance(cell, COOK_AT)).toBeGreaterThan(INTERACTION_REACH);
    }
    expect(request.path).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
      { x: 6, y: 0 },
    ]);
    // World clock: the empty selector, echoed as every free-roam walk does.
    expect(request.declarationId).toBe('');
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });

  it('opens her lines from Afford once the refreshed offer has her within reach', async () => {
    const far = speak([]);
    const { rerender } = render(<Harness declarations={[far]} />);
    act(() => latest.onSelectDeclaration(far));
    await act(async () => {
      fireEvent.click(screen.getByText('the cook on the map'));
    });

    // The view refresh after the walk: the server now lists her row.
    await act(async () => {
      rerender(<Harness declarations={[speak([cookLine])]} />);
    });

    expect(screen.getByText('What do you say to Cook?')).toBeTruthy();
    const lines = screen.getByRole('list', { name: 'Lines for Cook' });
    expect(
      Array.from(lines.querySelectorAll('button')).map((b) => b.textContent)
    ).toEqual(['“Heard anything?”']);
    expect(hoisted.speakFn).not.toHaveBeenCalled();
  });

  it('a walk that falls short opens the target list and sends no second Move', async () => {
    const far = speak([guardLine]);
    const { rerender } = render(<Harness declarations={[far]} />);
    act(() => latest.onSelectDeclaration(far));
    await act(async () => {
      fireEvent.click(screen.getByText('the cook on the map'));
    });

    // The refreshed offer still does not list her.
    await act(async () => {
      rerender(<Harness declarations={[speak([guardLine])]} />);
    });

    const targets = screen.getByRole('list', { name: 'Speak targets' });
    expect(
      Array.from(targets.querySelectorAll('button')).map((b) => b.textContent)
    ).toEqual(['Guard']);
    expect(screen.queryByText('What do you say to Cook?')).toBeNull();
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);
  });

  it('a REFUSED approach Move leaves Speak closed when a later verb refreshes the offer', async () => {
    hoisted.moveFn.mockRejectedValue(new Error('the hall is barred'));
    hoisted.speakFn.mockResolvedValue({});
    const offer = speak([guardLine]);
    const { rerender } = render(<Harness declarations={[offer]} />);
    act(() => latest.onSelectDeclaration(offer));
    await act(async () => {
      fireEvent.click(screen.getByText('the cook on the map'));
    });
    expect(hoisted.moveFn).toHaveBeenCalledTimes(1);

    // A different verb is accepted: a line to the guard, which revokes
    // authority exactly as the Move would have.
    act(() =>
      latest.onChooseSpeakTarget({ case: 'memberId', value: 'guard-2' })
    );
    await act(async () => {
      latest.onSpeakOption('hail');
    });
    expect(hoisted.speakFn).toHaveBeenCalledTimes(1);

    // The refreshed offer now even lists the cook; nobody asked to speak.
    await act(async () => {
      rerender(<Harness declarations={[speak([guardLine, cookLine])]} />);
    });

    expect(screen.queryByRole('region', { name: 'Conversation' })).toBeNull();
    expect(latest.presentationState.armedDeclarationId).toBeNull();
  });

  it('a creature the offer already lists is chosen, not walked to', async () => {
    const near = speak([cookLine]);
    render(<Harness declarations={[near]} />);
    act(() => latest.onSelectDeclaration(near));

    await act(async () => {
      fireEvent.click(screen.getByText('the cook on the map'));
    });

    expect(hoisted.moveFn).not.toHaveBeenCalled();
    expect(screen.getByText('What do you say to Cook?')).toBeTruthy();
  });
});

describe('the empty menu', () => {
  it('reads "Nobody within reach" when the offer lists no one', () => {
    const empty = speak([]);
    render(<Harness declarations={[empty]} />);
    act(() => latest.onSelectDeclaration(empty));

    expect(screen.getByRole('region', { name: 'Conversation' })).toBeTruthy();
    expect(screen.getByText('Nobody within reach')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Speak targets' })).toBeNull();
  });
});
