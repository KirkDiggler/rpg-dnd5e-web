/**
 * CLICK A THING, DO IT (rpg-project#959). A click on a prop with nothing
 * armed opens its menu when the Speak row lists anything for it: things to do
 * first, its lines under "Say…". Choosing a thing calls the live Interact
 * with the prop, the option id and the revision; a stale one re-opens the
 * menu as a moved-on line does, and a refusal shows its sentence as written.
 *
 * The hook and the surface are driven together, as speakFlow.test.tsx does.
 */
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import {
  ClockKind,
  DeclarationSchema,
  InteractOptionSchema,
  MemberKind,
  ParticipantSchema,
  SpeakOptionSchema,
  Standing,
  TargetCandidateSchema,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TargetSurface } from './TargetSurface';
import { selectCombatExperience } from './selection';
import { useSessionCombatExperience } from './useSessionCombatExperience';

const hoisted = vi.hoisted(() => ({
  speakFn: vi.fn(),
  interactFn: vi.fn(),
  scheduleRefresh: vi.fn(),
}));

vi.mock('@/api/client', () => ({
  sessionClient: {
    speak: hoisted.speakFn,
    interact: hoisted.interactFn,
  },
}));

const bard = create(ParticipantSchema, {
  member: 'bard-1',
  name: 'Standre',
  kind: MemberKind.PLAYER,
  standing: Standing.UP,
  active: false,
});
const names = new Map([
  ['bard-1', 'Standre'],
  ['cook-3', 'Cook'],
]);

const TO_CHAPEL = create(InteractOptionSchema, {
  propId: 'grate',
  optionId: 'to-chapel',
  doWords: 'You lift the grate and take the way up.',
  available: true,
  interactionId: 'kitchen-way',
  revision: 3n,
});
const TO_CELLS = create(InteractOptionSchema, {
  propId: 'grate',
  optionId: 'to-cells',
  doWords: 'You lift the grate and take the way down.',
  available: true,
});
const GATED = create(InteractOptionSchema, {
  propId: 'grate',
  optionId: 'pry',
  doWords: 'You pry at the bars.',
  available: false,
});
const ALTAR_PRAY = create(SpeakOptionSchema, {
  target: { case: 'propId', value: 'altar-1' },
  optionId: 'pray',
  line: 'Grant us passage.',
  available: true,
});
const ALTAR_EXAMINE = create(InteractOptionSchema, {
  propId: 'altar-1',
  optionId: 'examine',
  doWords: 'You run a hand over the altar.',
  available: true,
});

function speakRow(
  interactOptions = [TO_CHAPEL, TO_CELLS, GATED, ALTAR_EXAMINE],
  speakOptions = [ALTAR_PRAY],
  id = 'v2.speak.sealed.1'
): Declaration {
  return create(DeclarationSchema, {
    id,
    verb: Verb.SPEAK,
    available: true,
    targetKind: TargetKind.MEMBER,
    candidates: [
      create(TargetCandidateSchema, { member: 'cook-3', available: true }),
    ],
    speakOptions,
    interactOptions,
  });
}

let latest: ReturnType<typeof useSessionCombatExperience>;

function Harness({
  declarations,
  authorityFresh = true,
  clock = ClockKind.WORLD,
  active = '',
}: {
  declarations: readonly Declaration[];
  authorityFresh?: boolean;
  clock?: ClockKind;
  active?: string;
}) {
  latest = useSessionCombatExperience({
    session: 'kitchen',
    member: 'bard-1',
    clock,
    active,
    authorityFresh,
    memberNames: names,
    participants: [bard],
    declarations,
    invalidateAuthoritySnapshots: () => {},
    scheduleRefresh: hoisted.scheduleRefresh,
  });
  const state = latest.presentationState;
  return (
    <>
      <span data-testid="armed">{state.armedDeclarationId ?? 'none'}</span>
      <span data-testid="notice">{state.changedOptionNotice ?? 'none'}</span>
      <TargetSurface
        phase={latest.phase}
        selection={selectCombatExperience(declarations, state)}
        isViewerTurn={false}
        showTurnNotice={false}
        memberNames={names}
        location={{ name: 'The Castle', area: 'Kitchen' }}
        renderMap={() => <span />}
        onTargetClick={latest.onTargetClick}
        speakTarget={state.speakTarget}
        onChooseSpeakTarget={latest.onChooseSpeakTarget}
        onSpeakOption={latest.onSpeakOption}
        onInteractOption={latest.onInteractOption}
        onCancelSelection={latest.onCancelSelection}
      />
    </>
  );
}

const buttonsIn = (name: RegExp): string[] => {
  const list = screen.queryByRole('list', { name });
  return list
    ? Array.from(list.querySelectorAll('button')).map((b) => b.textContent!)
    : [];
};

beforeEach(() => {
  hoisted.speakFn.mockReset();
  hoisted.speakFn.mockResolvedValue({});
  hoisted.interactFn.mockReset();
  hoisted.interactFn.mockResolvedValue({});
  hoisted.scheduleRefresh.mockReset();
});

describe('click a thing', () => {
  it('a prop with only things to do opens its menu, without Speak armed first', () => {
    render(<Harness declarations={[speakRow()]} />);
    expect(screen.getByTestId('armed').textContent).toBe('none');
    let opened = false;
    act(() => {
      opened = latest.onPropClick('grate');
    });
    expect(opened).toBe(true);
    expect(screen.getByText('What do you do with grate?')).toBeTruthy();
    // The gated thing is not drawn; nothing is said; nothing is sent.
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You lift the grate and take the way up.',
      'You lift the grate and take the way down.',
    ]);
    expect(screen.queryByText('Say…')).toBeNull();
    expect(screen.queryByRole('list', { name: /^Lines for/ })).toBeNull();
    expect(hoisted.interactFn).not.toHaveBeenCalled();
  });

  it('a prop with both: things to do first, its lines under "Say…"', () => {
    render(<Harness declarations={[speakRow()]} />);
    act(() => {
      latest.onPropClick('altar-1');
    });
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You run a hand over the altar.',
    ]);
    expect(screen.getByText('Say…')).toBeTruthy();
    expect(buttonsIn(/^Lines for/)).toEqual(['“Grant us passage.”']);
    const things = screen.getByRole('list', { name: /^Things to do with/ });
    const lines = screen.getByRole('list', { name: /^Lines for/ });
    expect(
      things.compareDocumentPosition(lines) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('a prop with nothing to offer leaves the click to the floor', () => {
    render(<Harness declarations={[speakRow()]} />);
    let opened = true;
    act(() => {
      opened = latest.onPropClick('rug');
    });
    expect(opened).toBe(false);
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('nothing opens while authority is being re-read', () => {
    render(<Harness declarations={[speakRow()]} authorityFresh={false} />);
    let opened = true;
    act(() => {
      opened = latest.onPropClick('grate');
    });
    expect(opened).toBe(false);
  });

  it('beyond reach: the floor walk carries the prop, and its menu opens on arrival when the fresh offer lists it', () => {
    const { rerender } = render(<Harness declarations={[speakRow([], [])]} />);
    act(() => {
      expect(latest.onPropClick('grate')).toBe(false);
      latest.propMenuOnArrival('grate').accepted(null);
    });
    rerender(
      <Harness declarations={[speakRow([], [])]} authorityFresh={false} />
    );
    rerender(
      <Harness
        declarations={[speakRow([TO_CHAPEL], [], 'v2.speak.sealed.2')]}
      />
    );
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.sealed.2');
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You lift the grate and take the way up.',
    ]);
  });

  it('the first fresh offer mid-walk does not list it yet: the carried click waits, and opens on the offer that does', () => {
    const { rerender } = render(<Harness declarations={[speakRow([], [])]} />);
    act(() => {
      latest.propMenuOnArrival('grate').accepted(null);
    });
    // A world-clock walk goes on from the stream: the first fresh offer is
    // read while the walker is still far from the grate.
    rerender(
      <Harness declarations={[speakRow([], [])]} authorityFresh={false} />
    );
    rerender(
      <Harness declarations={[speakRow([], [], 'v2.speak.sealed.2')]} />
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
    // Arrived: the next offer lists the grate, and its menu opens.
    rerender(
      <Harness
        declarations={[speakRow([], [], 'v2.speak.sealed.2')]}
        authorityFresh={false}
      />
    );
    rerender(
      <Harness
        declarations={[speakRow([TO_CHAPEL], [], 'v2.speak.sealed.3')]}
      />
    );
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.sealed.3');
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You lift the grate and take the way up.',
    ]);
  });

  it('a plain walk elsewhere drops the carried click', () => {
    const { rerender } = render(<Harness declarations={[speakRow([], [])]} />);
    act(() => {
      latest.propMenuOnArrival('grate').accepted(null);
      latest.cancelPropArrival();
    });
    rerender(
      <Harness declarations={[speakRow([], [])]} authorityFresh={false} />
    );
    rerender(
      <Harness
        declarations={[speakRow([TO_CHAPEL], [], 'v2.speak.sealed.2')]}
      />
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });

  it('armed Speak lists a prop with only things to do, and picking it shows them first', () => {
    const declaration = speakRow();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'grate' }));
    });
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You lift the grate and take the way up.',
      'You lift the grate and take the way down.',
    ]);
  });

  it('beyond reach, still nothing on arrival: nothing opens (not even the Speak list)', () => {
    const { rerender } = render(<Harness declarations={[speakRow([], [])]} />);
    act(() => {
      latest.propMenuOnArrival('rug').accepted(null);
    });
    rerender(
      <Harness declarations={[speakRow([], [])]} authorityFresh={false} />
    );
    rerender(
      <Harness declarations={[speakRow([], [], 'v2.speak.sealed.2')]} />
    );
    expect(screen.getByTestId('armed').textContent).toBe('none');
  });
});

describe('do it', () => {
  it('sends the prop, the option id and the revision, verbatim, and refreshes as a line does', async () => {
    render(<Harness declarations={[speakRow()]} />);
    act(() => {
      latest.onPropClick('grate');
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', {
          name: 'You lift the grate and take the way up.',
        })
      );
    });
    expect(hoisted.interactFn).toHaveBeenCalledTimes(1);
    expect(hoisted.interactFn).toHaveBeenCalledWith({
      session: 'kitchen',
      actor: 'bard-1',
      prop: 'grate',
      optionId: 'to-chapel',
      revision: 3n,
    });
    expect(hoisted.speakFn).not.toHaveBeenCalled();
    expect(hoisted.scheduleRefresh).toHaveBeenCalledWith([
      'characterData',
      'turn',
      'afford',
      'view',
    ]);
  });

  it('a pending thing is drawn and never sent', async () => {
    const held = create(InteractOptionSchema, {
      ...TO_CHAPEL,
      available: false,
      pending: true,
    });
    render(<Harness declarations={[speakRow([held])]} />);
    act(() => {
      latest.onPropClick('grate');
    });
    const button = screen.getByRole('button', {
      name: /You lift the grate and take the way up\./,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    await act(async () => {
      latest.onInteractOption('to-chapel');
    });
    expect(hoisted.interactFn).not.toHaveBeenCalled();
  });

  it('a stale thing (ABORTED) re-opens the menu as a moved-on line does', async () => {
    hoisted.interactFn.mockRejectedValueOnce(
      new ConnectError('stale', Code.Aborted)
    );
    render(<Harness declarations={[speakRow()]} />);
    act(() => {
      latest.onPropClick('grate');
    });
    await act(async () => {
      latest.onInteractOption('to-chapel');
    });
    expect(screen.getByTestId('notice').textContent).toBe(
      'The conversation moved on — pick again.'
    );
    expect(screen.getByTestId('armed').textContent).toBe('v2.speak.sealed.1');
    expect(screen.getByTestId('notice').textContent).not.toContain('stale');
  });

  it('a refusal with a sentence shows it as written', async () => {
    hoisted.interactFn.mockRejectedValueOnce(
      new ConnectError(
        'The guards hold you; you cannot walk away.',
        Code.FailedPrecondition
      )
    );
    render(<Harness declarations={[speakRow()]} />);
    act(() => {
      latest.onPropClick('grate');
    });
    await act(async () => {
      latest.onInteractOption('to-cells');
    });
    expect(screen.getByTestId('notice').textContent).toBe(
      'The guards hold you; you cannot walk away.'
    );
  });

  it('speaking to a prop through armed Speak still sends a line', async () => {
    const declaration = speakRow();
    render(<Harness declarations={[declaration]} />);
    act(() => latest.onSelectDeclaration(declaration));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'altar-1' }));
    });
    // The armed path draws the altar's thing too, above its line.
    expect(buttonsIn(/^Things to do with/)).toEqual([
      'You run a hand over the altar.',
    ]);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Grant us passage/ }));
    });
    expect(hoisted.speakFn).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { case: 'propId', value: 'altar-1' },
        optionId: 'pray',
      })
    );
    expect(hoisted.interactFn).not.toHaveBeenCalled();
  });
});
