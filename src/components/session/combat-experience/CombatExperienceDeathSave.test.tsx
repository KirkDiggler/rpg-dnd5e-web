import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  DeathSaveProgressSchema,
  LifeState,
  MemberKind,
  ParticipantSchema,
  Standing,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CombatExperience } from './CombatExperience';
import type { CombatExperienceProps } from './types';

const emptyInteraction = {
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
};

function renderExperience(participants: CombatExperienceProps['participants']) {
  render(
    <CombatExperience
      viewerMember="fighter-1"
      viewerName="Aldric"
      memberNames={
        new Map([
          ['fighter-1', 'Aldric'],
          ['wizard-1', 'Lyra'],
        ])
      }
      clock={ClockKind.TURN}
      round={4}
      participants={participants}
      declarations={[]}
      privateStatus="ready"
      authorityFresh
      presentationState={emptyInteraction}
      phase="fresh"
      showTurnNotice={false}
      logMode="story"
      streamState="live"
      story={[]}
      debug={[]}
      diceEvents={[]}
      location={{ name: 'Crypt', area: 'Table' }}
      renderMap={() => <div />}
      onSelectDeclaration={vi.fn()}
      onTargetClick={vi.fn()}
      onEndTurn={vi.fn()}
      onLogModeChange={vi.fn()}
      diceWitnessRole="spectator"
    />
  );
}

describe('CombatExperience public Death Save progress', () => {
  it('renders whole-party pips and provider remaining counts verbatim', () => {
    renderExperience([
      create(ParticipantSchema, {
        member: 'fighter-1',
        name: 'Aldric',
        kind: MemberKind.PLAYER,
        standing: Standing.DOWNED,
        active: true,
        lifeState: LifeState.DYING,
        deathSaves: create(DeathSaveProgressSchema, {
          successes: 2,
          failures: 1,
          successesNeeded: 7,
          failuresRemaining: 9,
        }),
      }),
      create(ParticipantSchema, {
        member: 'wizard-1',
        name: 'Lyra',
        kind: MemberKind.PLAYER,
        standing: Standing.UP,
        active: false,
        lifeState: LifeState.CONSCIOUS,
      }),
    ]);

    expect(screen.getByText('2 successes · 7 to stabilize')).toBeTruthy();
    expect(screen.getByText('1 failures · 9 remaining')).toBeTruthy();
    expect(screen.getAllByTestId('death-save-success-pip')).toHaveLength(2);
    expect(screen.getAllByTestId('death-save-failure-pip')).toHaveLength(1);
  });

  it('does not synthesize progress from Downed or Dying when progress is absent', () => {
    renderExperience([
      create(ParticipantSchema, {
        member: 'fighter-1',
        name: 'Aldric',
        kind: MemberKind.PLAYER,
        standing: Standing.DOWNED,
        active: true,
        lifeState: LifeState.DYING,
      }),
    ]);

    expect(screen.queryByTestId('death-save-progress')).toBeNull();
  });
});
