/**
 * The cut and the arrest (rpg-project#925), from fixtures shaped as the wire
 * sends them (rpg-api-protos v0.1.276): a `RelocateAct` per recipient, with
 * only the end that recipient perceived, and an `ArrestAct` naming who was
 * taken as they perceived it.
 */
import { create } from '@bufbuild/protobuf';
import {
  ActSchema,
  Family,
  PartyKind,
  PartySchema,
  PerceivedSchema,
  RelocateEnd,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cubeToWorld } from '../../hex-grid/hexMath';
import { driftAt, driftToward } from '../../hex-grid/presentationDrift';
import { refreshKeysForAct } from '../actRefreshKeys';
import { buildActStory } from './actStory';
import {
  CUT_HOLD_MS,
  CUT_IN_MS,
  CUT_MAX_MS,
  CUT_OUT_MS,
  ownRelocation,
  useRelocateCut,
  walkOffFor,
} from './relocateCut';
import { RelocateCutOverlay } from './RelocateCutOverlay';
import { toastFor } from './toastPolicy';

const viewer = 'bard';
const names = { bard: 'Bard', barbarian: 'Barbarian', bea: 'Bea' };
const context = { viewerMember: viewer, memberNames: names };
const member = (id: string) =>
  create(PartySchema, { kind: PartyKind.MEMBER, id });
const ARREST = 'dnd5e:consequences:arrest';
const WORDS = 'You are taken to the cells.';

function relocate(
  value: Record<string, unknown>,
  { via = [] as string[], id = 'r1' } = {}
): Act {
  return create(ActSchema, {
    session: 's',
    id,
    act: 'speak:1',
    verb: 'speak',
    family: Family.ACT,
    perceived: via.length
      ? create(PerceivedSchema, { via: via.map(member) })
      : undefined,
    body: { case: 'relocate', value: { cause: ARREST, ...value } },
  } as never);
}

function arrest(taken: string[]): Act {
  return create(ActSchema, {
    session: 's',
    id: 'a1',
    family: Family.STATE,
    body: {
      case: 'arrest',
      value: {
        interaction: 'front-gate',
        taken: taken.map(member),
        cell: 'cells',
      },
    },
  } as never);
}

const row = (a: Act) =>
  buildActStory(
    [{ act: a, index: 0, seq: 1n, source: 'live', visible: true }],
    context
  )[0]!;

/** Everything a row says, in any of its parts. */
const said = (a: Act) => {
  const r = row(a);
  return `${r.eyebrow} ${r.headline} ${r.detail} ${r.toastText ?? ''}`;
};

describe('the log line, by end', () => {
  it('the viewer’s own reads the authored words, mover-keyed, never words-keyed', () => {
    const own = relocate({
      mover: member(viewer),
      from: { x: 1, y: 1 },
      to: { x: 9, y: 9 },
      words: WORDS,
      end: RelocateEnd.BOTH,
    });
    expect(row(own).headline).toBe(WORDS);
    expect(
      row(
        relocate({
          mover: member(viewer),
          to: { x: 9, y: 9 },
          end: RelocateEnd.BOTH,
        })
      ).headline
    ).toBe('You are led away.');
  });

  it('BOTH, LEFT and ARRIVED word the cause for someone else', () => {
    expect(
      row(
        relocate({
          mover: member('barbarian'),
          from: { x: 1, y: 1 },
          to: { x: 9, y: 9 },
          end: RelocateEnd.BOTH,
        })
      ).headline
    ).toBe('Barbarian is led away under arrest.');
    expect(
      row(
        relocate({
          mover: member('barbarian'),
          from: { x: 1, y: 1 },
          end: RelocateEnd.LEFT,
        })
      ).headline
    ).toBe('Barbarian is led away under arrest.');
    expect(
      row(
        relocate({
          mover: member('barbarian'),
          to: { x: 9, y: 9 },
          end: RelocateEnd.ARRIVED,
        })
      ).headline
    ).toBe('Barbarian is brought in under arrest.');
  });

  it('an unknown cause falls back to the generic words', () => {
    expect(
      row(
        relocate({
          mover: member('barbarian'),
          cause: 'dnd5e:consequences:banished',
          end: RelocateEnd.LEFT,
        })
      ).headline
    ).toBe('Barbarian is led away.');
    expect(
      row(
        relocate({
          mover: member('barbarian'),
          cause: 'dnd5e:consequences:banished',
          end: RelocateEnd.ARRIVED,
        })
      ).headline
    ).toBe('Barbarian is brought in.');
  });

  it('LEFT never shows a destination, even when a server sends one', () => {
    // A misbehaving server: LEFT, but with `to` and words set. Nothing of
    // either may reach this viewer's log, toast or cut.
    const left = relocate({
      mover: member('barbarian'),
      from: { x: 1, y: 1 },
      to: { x: 31, y: 47 },
      words: WORDS,
      end: RelocateEnd.LEFT,
    });
    const text = said(left);
    expect(text).not.toMatch(/31|47/);
    expect(text).not.toMatch(/cells/i);
    expect(text).not.toContain(WORDS);
    expect(ownRelocation([left], viewer)).toBeUndefined();
  });

  it('through a friend at shared view, marked like speech', () => {
    const seen = relocate(
      {
        mover: member('barbarian'),
        from: { x: 1, y: 1 },
        to: { x: 9, y: 9 },
        end: RelocateEnd.BOTH,
      },
      { via: ['bea'] }
    );
    expect(row(seen).eyebrow).toBe('Taken · through Bea');
  });

  it('refreshes: the mover re-reads where they are; anyone else the view', () => {
    expect(
      refreshKeysForAct(
        relocate({ mover: member(viewer), end: RelocateEnd.BOTH }),
        viewer
      )
    ).toEqual(['where', 'afford', 'turn', 'view', 'roster']);
    expect(
      refreshKeysForAct(
        relocate({ mover: member('barbarian'), end: RelocateEnd.LEFT }),
        viewer
      )
    ).toEqual(['view', 'roster']);
  });
});

describe('the arrest', () => {
  it('reads to the taken and to others, and names nobody wanted', () => {
    expect(row(arrest([viewer])).headline).toBe('You are under arrest.');
    expect(row(arrest([viewer, 'barbarian'])).headline).toBe(
      'You and Barbarian are under arrest.'
    );
    expect(row(arrest(['barbarian'])).headline).toBe('Barbarian is arrested.');
    expect(row(arrest(['barbarian', 'bea'])).headline).toBe(
      'Barbarian and Bea are arrested.'
    );
  });

  it('toasts for the taken; another’s arrest stays in the log', () => {
    expect(toastFor(arrest([viewer]), viewer, false)?.case).toBe('done-to-you');
    expect(toastFor(arrest(['barbarian']), viewer, false)).toBeNull();
  });
});

describe('the cut', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    vi.unstubAllGlobals();
  });

  const own = relocate({
    mover: member(viewer),
    from: { x: 1, y: 1 },
    to: { x: 9, y: 9 },
    words: WORDS,
    end: RelocateEnd.BOTH,
  });

  it('starts only for the viewer’s own character', () => {
    expect(ownRelocation([own], viewer)).toEqual({
      key: 's:r1',
      words: WORDS,
      to: { x: 9, y: 9 },
    });
    const others = relocate({
      mover: member('barbarian'),
      to: { x: 9, y: 9 },
      words: WORDS,
      end: RelocateEnd.BOTH,
    });
    expect(ownRelocation([others], viewer)).toBeUndefined();
  });

  it('fades out, holds the words, fades in, and always ends', () => {
    const { result } = renderHook(() => useRelocateCut());
    act(() => result.current.start(ownRelocation([own], viewer)!));
    expect(result.current.cut?.phase).toBe('out');
    act(() => vi.advanceTimersByTime(CUT_OUT_MS));
    expect(result.current.cut?.phase).toBe('hold');
    act(() => vi.advanceTimersByTime(CUT_HOLD_MS));
    expect(result.current.cut?.phase).toBe('in');
    act(() => vi.advanceTimersByTime(CUT_IN_MS));
    expect(result.current.cut).toBeNull();
    act(() => vi.advanceTimersByTime(CUT_MAX_MS));
    expect(result.current.cut).toBeNull();
  });

  it('reduced motion cuts without the fade', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }))
    );
    const { result } = renderHook(() => useRelocateCut());
    act(() => result.current.start(ownRelocation([own], viewer)!));
    expect(result.current.cut).toMatchObject({ phase: 'hold', reduced: true });
    render(<RelocateCutOverlay cut={result.current.cut} />);
    const veil = screen.getByTestId('relocate-cut');
    expect(veil.style.animation).toBe('');
    expect(veil).toHaveTextContent(WORDS);
    act(() => vi.advanceTimersByTime(CUT_HOLD_MS));
    expect(result.current.cut).toBeNull();
  });

  it('the veil shows the words while dark and takes every pointer', () => {
    const behind = vi.fn();
    render(
      <div onClick={behind} onPointerDown={behind}>
        <RelocateCutOverlay
          cut={{ key: 'k', words: WORDS, phase: 'hold', reduced: false }}
        />
      </div>
    );
    const veil = screen.getByTestId('relocate-cut');
    expect(veil).toHaveTextContent(WORDS);
    fireEvent.pointerDown(veil);
    fireEvent.click(veil);
    expect(behind).not.toHaveBeenCalled();
  });
});

describe('the walk-off (for show, never a move)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const own = relocate({
    mover: member(viewer),
    from: { x: 0, y: 0 },
    to: { x: 9, y: 0 },
    words: WORDS,
    end: RelocateEnd.BOTH,
  });

  it('plays only in the fade-out, toward `to`, and never with reduced motion', () => {
    const start = ownRelocation([own], viewer)!;
    expect(walkOffFor({ ...start, phase: 'out', reduced: false })).toEqual({
      key: start.key,
      to: { x: 9, y: 0 },
      durationMs: CUT_OUT_MS,
    });
    expect(
      walkOffFor({ ...start, phase: 'hold', reduced: false })
    ).toBeUndefined();
    expect(
      walkOffFor({ ...start, phase: 'in', reduced: false })
    ).toBeUndefined();
    expect(
      walkOffFor({ ...start, phase: 'out', reduced: true })
    ).toBeUndefined();
    expect(walkOffFor(null)).toBeUndefined();
  });

  it('drifts about two cells in a straight line, never past `to`, eased', () => {
    const from = Object.freeze({ x: 0, y: 0, z: 0 });
    const to = Object.freeze({ x: 9, y: -9, z: 0 });
    const drift = driftToward('k', from, to, 1, CUT_OUT_MS)!;
    const a = cubeToWorld(from, 1);
    const b = cubeToWorld(to, 1);
    const toward = Math.atan2(b.z - a.z, b.x - a.x);
    expect(Math.atan2(drift.z, drift.x)).toBeCloseTo(toward);
    expect(Math.hypot(drift.x, drift.z)).toBeCloseTo(2 * Math.sqrt(3));
    expect(driftAt(drift, 0)).toEqual({ x: 0, z: 0 });
    expect(driftAt(drift, CUT_OUT_MS)).toEqual({ x: drift.x, z: drift.z });
    // One cell away: it stops at `to`, not past it.
    const near = driftToward('n', from, { x: 1, y: -1, z: 0 }, 1, 100)!;
    const end = cubeToWorld({ x: 1, y: -1, z: 0 }, 1);
    expect(Math.hypot(near.x, near.z)).toBeCloseTo(
      Math.hypot(end.x - a.x, end.z - a.z)
    );
    expect(driftToward('z', from, from, 1, 100)).toBeUndefined();
  });

  it('never changes the stored position: the positions it reads stay as they were', () => {
    const position = Object.freeze({ x: 2, y: -3, z: 1 });
    const before = { ...position };
    driftToward('k', position, { x: 9, y: -9, z: 0 }, 1, CUT_OUT_MS);
    expect(position).toEqual(before);
  });

  it('a cut ended by its bound leaves no offset behind', () => {
    const { result } = renderHook(() => useRelocateCut());
    act(() => result.current.start(ownRelocation([own], viewer)!));
    expect(walkOffFor(result.current.cut)).toBeDefined();
    act(() => vi.advanceTimersByTime(CUT_MAX_MS));
    expect(result.current.cut).toBeNull();
    expect(walkOffFor(result.current.cut)).toBeUndefined();
    expect(driftAt(undefined, 1e6)).toEqual({ x: 0, z: 0 });
  });
});
