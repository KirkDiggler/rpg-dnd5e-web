import type {
  DicePresentationReleasedEvent,
  DicePresentationRequestedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { createDicePresentationRelease } from '@/components/ui/dice/dicePresentationRelease';
import { createNeutralVisualThrowProfile } from '@/components/ui/dice/visualThrowProfile';
import { create } from '@bufbuild/protobuf';
import {
  MemberKind,
  ParticipantSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { isCombatDebugEnabled } from './diagnostics';
import { DiceDrawer } from './DiceDrawer';
import { createAttackAuthorityFixture } from './presentation.test-fixtures';
import { StoryLog } from './StoryLog';
import { useCombatPresentation } from './useCombatPresentation';

const participants = [
  create(ParticipantSchema, {
    member: 'aldric',
    name: 'Aldric',
    kind: MemberKind.PLAYER,
    standing: Standing.UP,
    active: true,
  }),
  create(ParticipantSchema, {
    member: 'skeleton-guard',
    name: 'Skeleton Guard',
    kind: MemberKind.MONSTER,
    standing: Standing.UP,
  }),
];

function StrictWrapper({ children }: PropsWithChildren) {
  return <StrictMode>{children}</StrictMode>;
}

function releaseFor(
  events: readonly (
    | DicePresentationRequestedEvent
    | DicePresentationReleasedEvent
  )[]
): DicePresentationReleasedEvent {
  const request = events.find(
    (event): event is DicePresentationRequestedEvent =>
      event.type === 'dice-presentation-requested'
  );
  if (!request) throw new Error('expected request');
  return {
    schemaVersion: 1,
    type: 'dice-presentation-released',
    eventId: `${request.presentationId}:release`,
    presentationId: request.presentationId,
    release: createDicePresentationRelease({
      presentationId: request.presentationId,
      presetId: request.die.presetId,
      throwProfile: createNeutralVisualThrowProfile(303),
    }),
  };
}

describe('useCombatPresentation', () => {
  it('ingests game truth and raw Debug immediately while withholding actor semantics until release', () => {
    const facts = createAttackAuthorityFixture();
    const { result } = renderHook(() =>
      useCombatPresentation({
        session: 'crypt-run',
        viewerMember: 'aldric',
        participants,
      })
    );

    act(() => result.current.acceptAttackResponse(facts.responseFact));
    act(() =>
      result.current.acceptStreamEvent(facts.event, { source: 'live' })
    );

    expect(result.current.state.presentations[0]?.eventAccepted).toBe(true);
    expect(result.current.debug[0]).toContain('roll=12');
    expect(result.current.story).toEqual([]);
    expect(result.current.result).toBeUndefined();
    expect(result.current.liveAnnouncement).toBeNull();
    expect(result.current.phase).toBe('awaiting-roll');

    act(() =>
      result.current.onDiceReleaseRequest(releaseFor(result.current.diceEvents))
    );

    expect(result.current.story).toHaveLength(1);
    expect(result.current.result?.d20).toBe(12);
    expect(result.current.liveAnnouncement).toContain('Aldric');
    expect(result.current.phase).toBe('settled');
  });

  it('allows release delivery before the stream event without using the response as Story', () => {
    const facts = createAttackAuthorityFixture();
    const { result } = renderHook(() =>
      useCombatPresentation({
        session: 'crypt-run',
        viewerMember: 'aldric',
        participants,
      })
    );

    act(() => result.current.acceptAttackResponse(facts.responseFact));
    act(() =>
      result.current.onDiceReleaseRequest(releaseFor(result.current.diceEvents))
    );
    expect(result.current.story).toEqual([]);

    act(() =>
      result.current.acceptStreamEvent(facts.event, { source: 'live' })
    );
    expect(result.current.story).toHaveLength(1);
  });

  it('surfaces an unsafe-ID semantic fallback only after the typed event exists', () => {
    const facts = createAttackAuthorityFixture({
      session: `unsafe-${'x'.repeat(140)}`,
    });
    const { result } = renderHook(() =>
      useCombatPresentation({
        session: facts.event.session,
        viewerMember: 'aldric',
        participants,
      })
    );

    act(() => result.current.acceptAttackResponse(facts.responseFact));
    expect(result.current.semanticFallback).toBe(true);
    expect(result.current.story).toEqual([]);

    act(() =>
      result.current.acceptStreamEvent(facts.event, { source: 'live' })
    );
    expect(result.current.story).toEqual([]);
    expect(result.current.phase).toBe('awaiting-roll');

    act(() => result.current.onSemanticReleaseRequest());
    expect(result.current.story).toHaveLength(1);
    expect(result.current.phase).toBe('settled');
  });

  it('uses the latest provider participant roles when they load after the hook mounts', () => {
    const facts = createAttackAuthorityFixture({
      attacker: 'skeleton-guard',
      recipient: 'aldric',
    });
    const { result, rerender } = renderHook(
      ({ roster }) =>
        useCombatPresentation({
          session: 'crypt-run',
          viewerMember: 'aldric',
          participants: roster,
        }),
      { initialProps: { roster: participants.slice(0, 1) } }
    );

    rerender({ roster: participants });
    act(() =>
      result.current.acceptStreamEvent(facts.event, { source: 'live' })
    );

    expect(result.current.diceEvents[0]).toMatchObject({
      type: 'dice-presentation-requested',
      roller: { entityId: 'skeleton-guard', role: 'monster' },
    });
    expect(result.current.semanticFallback).toBe(false);
  });

  it('offers a result-free semantic release control only to an authoritative roller', () => {
    const onSemanticReleaseRequest = vi.fn();
    const { rerender } = render(
      <DiceDrawer
        phase="awaiting-roll"
        events={[]}
        rollerName="Aldric"
        semanticFallback
        witnessRole="roller"
        onReleaseRequest={vi.fn()}
        onSemanticReleaseRequest={onSemanticReleaseRequest}
      />
    );

    expect(screen.queryByText(/d20 12|total 17|Hit/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reveal result' }));
    expect(onSemanticReleaseRequest).toHaveBeenCalledOnce();

    rerender(
      <DiceDrawer
        phase="awaiting-roll"
        events={[]}
        rollerName="Aldric"
        semanticFallback
        witnessRole="spectator"
      />
    );
    expect(screen.queryByRole('button', { name: 'Reveal result' })).toBeNull();
    expect(screen.getByText(/presentation unavailable/)).toBeTruthy();
  });

  it('makes a missing provider role spectator-only with no request or reveal control', () => {
    const facts = createAttackAuthorityFixture();
    const { result } = renderHook(() =>
      useCombatPresentation({
        session: 'crypt-run',
        viewerMember: 'aldric',
        participants: [],
      })
    );

    act(() => result.current.acceptAttackResponse(facts.responseFact));
    act(() =>
      result.current.acceptStreamEvent(facts.event, { source: 'live' })
    );

    expect(result.current.diceWitnessRole).toBe('spectator');
    expect(result.current.diceEvents).toEqual([]);
    expect(result.current.semanticFallback).toBe(false);
    expect(result.current.phase).toBe('settled');
    expect(result.current.story).toHaveLength(1);
  });

  it('creates and removes a pending response presentation as authoritative role facts change', () => {
    const facts = createAttackAuthorityFixture();
    const { result, rerender } = renderHook(
      ({ roster }) =>
        useCombatPresentation({
          session: 'crypt-run',
          viewerMember: 'aldric',
          participants: roster,
        }),
      { initialProps: { roster: participants.slice(1) } }
    );

    act(() => result.current.acceptAttackResponse(facts.responseFact));
    expect(result.current.diceWitnessRole).toBe('spectator');
    expect(result.current.diceEvents).toEqual([]);

    rerender({ roster: participants });
    expect(result.current.diceWitnessRole).toBe('roller');
    expect(result.current.diceEvents).toHaveLength(1);
    expect(result.current.phase).toBe('awaiting-roll');

    rerender({ roster: participants.slice(1) });
    expect(result.current.diceWitnessRole).toBe('spectator');
    expect(result.current.diceEvents).toEqual([]);
    expect(result.current.phase).toBe('settled');
  });

  it('fences stale state and callbacks synchronously across StrictMode session and viewer scope changes', () => {
    const oldFacts = createAttackAuthorityFixture();
    const nextFacts = createAttackAuthorityFixture({ session: 'next-run' });
    const { result, rerender } = renderHook(
      ({ session, viewerMember }) =>
        useCombatPresentation({ session, viewerMember, participants }),
      {
        initialProps: {
          session: 'crypt-run',
          viewerMember: 'aldric',
        },
        wrapper: StrictWrapper,
      }
    );

    act(() => result.current.acceptAttackResponse(oldFacts.responseFact));
    act(() =>
      result.current.acceptStreamEvent(oldFacts.event, { source: 'live' })
    );
    const staleAccept = result.current.acceptStreamEvent;
    expect(result.current.debug).not.toEqual([]);
    expect(result.current.diceEvents).not.toEqual([]);

    rerender({ session: 'next-run', viewerMember: 'aldric' });
    expect(result.current.state.session).toBe('next-run');
    expect(result.current.story).toEqual([]);
    expect(result.current.debug).toEqual([]);
    expect(result.current.diceEvents).toEqual([]);
    expect(result.current.result).toBeUndefined();

    act(() => staleAccept(oldFacts.event, { source: 'live' }));
    expect(result.current.debug).toEqual([]);
    expect(result.current.state.presentations).toEqual([]);

    act(() =>
      result.current.acceptStreamEvent(nextFacts.event, { source: 'catchup' })
    );
    expect(result.current.story).toHaveLength(1);
    const staleNextAccept = result.current.acceptStreamEvent;

    rerender({ session: 'next-run', viewerMember: 'skeleton-guard' });
    expect(result.current.state.viewerMember).toBe('skeleton-guard');
    expect(result.current.story).toEqual([]);
    expect(result.current.debug).toEqual([]);
    expect(result.current.diceEvents).toEqual([]);

    act(() => staleNextAccept(nextFacts.event, { source: 'catchup' }));
    expect(result.current.state.presentations).toEqual([]);
  });
});

describe('StoryLog developer diagnostics gate', () => {
  it('permits raw Debug only in development or on an explicit diagnostic surface', () => {
    expect(isCombatDebugEnabled(false, false)).toBe(false);
    expect(isCombatDebugEnabled(false, true)).toBe(true);
    expect(isCombatDebugEnabled(true, false)).toBe(true);
  });

  it('forces a stale Debug mode back to Story when production diagnostics are disabled', () => {
    vi.stubEnv('DEV', false);
    try {
      render(
        <StoryLog
          story={[
            {
              id: 'typed-story',
              eyebrow: 'Combat',
              headline: 'Typed Story remains',
              detail: 'Story sequence 23.',
              tone: 'neutral',
            },
          ]}
          debug={['RAW RESULT MUST NOT RENDER']}
          mode="debug"
          streamState="live"
          onModeChange={vi.fn()}
        />
      );

      expect(screen.queryByRole('button', { name: 'Debug' })).toBeNull();
      expect(screen.queryByText('RAW RESULT MUST NOT RENDER')).toBeNull();
      expect(screen.getByText('Typed Story remains')).toBeTruthy();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders an explicitly enabled closed Debug control without putting raw text in a live region', () => {
    render(
      <StoryLog
        story={[
          {
            id: 'typed-story',
            round: 2,
            eyebrow: 'Aldric · Longsword',
            headline: 'Skeleton Guard evades Aldric',
            detail: 'd20 3 · total 8 against AC 13 · Miss',
            tone: 'neutral',
          },
        ]}
        debug={['RAW EARLY RESULT roll=3 total=8']}
        mode="story"
        streamState="live"
        diagnosticsEnabled
        onModeChange={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Debug' })).toBeTruthy();
    expect(screen.queryByText('RAW EARLY RESULT roll=3 total=8')).toBeNull();
    expect(screen.getByRole('log').textContent).not.toContain('RAW EARLY');
  });

  it('renders one exchange when typed Story and visible verdict share an attack sequence', () => {
    const { container } = render(
      <StoryLog
        story={[
          {
            id: '9:crypt-run:23',
            eyebrow: 'Aldric · Longsword',
            headline: 'Aldric strikes Skeleton Guard',
            detail: 'typed detail',
            tone: 'success',
          },
        ]}
        debug={[]}
        mode="story"
        streamState="live"
        diagnosticsEnabled
        onModeChange={vi.fn()}
        result={{
          attackId: '9:crypt-run:23',
          actor: 'Aldric',
          target: 'Skeleton Guard',
          action: 'Longsword',
          d20: 12,
          total: 17,
          against: 13,
          hit: true,
          critical: false,
          damage: 8,
          damageType: 'slashing',
        }}
      />
    );

    expect(container.querySelectorAll('article')).toHaveLength(1);
  });

  it('keeps an open raw Debug feed out of live announcements', () => {
    const onModeChange = vi.fn();
    const { rerender } = render(
      <StoryLog
        story={[]}
        debug={['seq=23 struck roll=12']}
        mode="story"
        streamState="live"
        diagnosticsEnabled
        onModeChange={onModeChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Debug' }));
    expect(onModeChange).toHaveBeenCalledWith('debug');

    rerender(
      <StoryLog
        story={[]}
        debug={['seq=23 struck roll=12']}
        mode="debug"
        streamState="live"
        diagnosticsEnabled
        onModeChange={onModeChange}
      />
    );
    expect(
      screen.getByLabelText('Raw debug feed').getAttribute('aria-live')
    ).toBe('off');
    expect(screen.queryByRole('log')).toBeNull();
  });
});
