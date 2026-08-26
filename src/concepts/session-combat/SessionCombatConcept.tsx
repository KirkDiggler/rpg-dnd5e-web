import { CombatExperience } from '@/components/session/combat-experience/CombatExperience';
import styles from '@/components/session/combat-experience/CombatExperience.module.css';
import { selectCombatExperience } from '@/components/session/combat-experience/selection';
import type {
  CombatExperienceLogMode,
  CombatExperiencePhase,
  CombatExperiencePresentationState,
} from '@/components/session/combat-experience/types';
import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import {
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useEffect, useState } from 'react';
import { ContractInspector } from './ContractInspector';
import {
  appendSessionCombatDiceEvent,
  createSessionCombatDiceRequest,
  createSessionCombatNeutralRelease,
} from './diceFixture';
import { SESSION_COMBAT_FIXTURES } from './fixtures';
import { SessionCombatMap } from './SessionCombatMap';

const EMPTY_PRESENTATION_STATE: CombatExperiencePresentationState = {
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
};

export function SessionCombatConcept() {
  const [fixtureId, setFixtureId] = useState('fresh-turn');
  const fixture =
    SESSION_COMBAT_FIXTURES.find((candidate) => candidate.id === fixtureId) ??
    SESSION_COMBAT_FIXTURES[0]!;
  const [phase, setPhase] = useState<CombatExperiencePhase>('fresh');
  const [presentationState, setPresentationState] =
    useState<CombatExperiencePresentationState>(EMPTY_PRESENTATION_STATE);
  const [showTurnNotice, setShowTurnNotice] = useState(true);
  const [logMode, setLogMode] = useState<CombatExperienceLogMode>('story');
  const [contractOpen, setContractOpen] = useState(false);
  const [diceEvents, setDiceEvents] = useState<
    readonly DicePresentationEvent[]
  >([]);

  useEffect(() => {
    if (!showTurnNotice) return;
    const timer = window.setTimeout(() => setShowTurnNotice(false), 1800);
    return () => window.clearTimeout(timer);
  }, [showTurnNotice]);

  const selectScenario = (nextFixtureId: string) => {
    const next = SESSION_COMBAT_FIXTURES.find(
      (candidate) => candidate.id === nextFixtureId
    );
    if (!next) return;
    setFixtureId(next.id);
    setPresentationState(EMPTY_PRESENTATION_STATE);
    setDiceEvents([]);
    setPhase('fresh');
    setShowTurnNotice(next.id === 'fresh-turn');
    setLogMode('story');
  };

  const freshDiceEvents = () =>
    createSessionCombatDiceRequest(
      fixture.attackOutcome.attackId,
      fixture.attackOutcome.d20
    );

  const armDeclaration = (declaration: Declaration) => {
    const nextState: CombatExperiencePresentationState = {
      armedDeclarationId: declaration.id,
      selectedCandidateMember: null,
      changedOptionNotice: null,
    };
    const selected = selectCombatExperience(fixture.declarations, nextState);
    if (!selected?.declaration) return;
    setShowTurnNotice(false);
    setDiceEvents([]);
    setPresentationState(nextState);
    setPhase(
      declaration.verb === Verb.ATTACK &&
        declaration.targetKind === TargetKind.MEMBER
        ? 'targeting'
        : 'fresh'
    );
  };

  const chooseTarget = (targetId: string) => {
    const nextState = {
      ...presentationState,
      selectedCandidateMember: targetId,
    };
    const selected = selectCombatExperience(fixture.declarations, nextState);
    if (!selected?.candidate) return;
    setPresentationState(nextState);
    setDiceEvents(freshDiceEvents());
    setPhase('awaiting-roll');
  };

  const showReviewPhase = (nextPhase: CombatExperiencePhase) => {
    if (nextPhase === 'fresh') {
      setPresentationState(EMPTY_PRESENTATION_STATE);
      setDiceEvents([]);
      setShowTurnNotice(true);
      setPhase('fresh');
      return;
    }
    const attack = fixture.declarations.find(
      (declaration) => declaration.verb === Verb.ATTACK && declaration.available
    );
    if (!attack) return;
    const armedState: CombatExperiencePresentationState = {
      armedDeclarationId: attack.id,
      selectedCandidateMember: null,
      changedOptionNotice: null,
    };
    setShowTurnNotice(false);
    if (nextPhase === 'targeting') {
      setDiceEvents([]);
      setPresentationState(armedState);
      setPhase('targeting');
      return;
    }
    const target = attack.candidates.find((candidate) => candidate.available);
    if (!target) return;
    const targetedState = {
      ...armedState,
      selectedCandidateMember: target.member,
    };
    const request = freshDiceEvents();
    setPresentationState(targetedState);
    if (nextPhase === 'awaiting-roll') {
      setDiceEvents(request);
      setPhase('awaiting-roll');
      return;
    }
    setDiceEvents([...request, createSessionCombatNeutralRelease(request)]);
    setPhase('settled');
  };

  const handleDiceRelease = (event: DicePresentationReleasedEvent) => {
    const next = appendSessionCombatDiceEvent(diceEvents, event);
    if (next === diceEvents) return;
    setDiceEvents(next);
    setPhase('settled');
  };

  return (
    <section className={styles.concept} aria-labelledby="session-combat-title">
      <header className={styles.reviewHeader}>
        <div>
          <span className={styles.eyebrow}>
            Session encounter · shared production shell
          </span>
          <h2 id="session-combat-title">The turn, all in one place</h2>
          <p>{fixture.description}</p>
        </div>
        <div className={styles.reviewDeck}>
          <div className={styles.reviewControls} aria-label="State matrix">
            {SESSION_COMBAT_FIXTURES.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className={
                  fixture.id === candidate.id ? styles.reviewControlActive : ''
                }
                onClick={() => selectScenario(candidate.id)}
              >
                {candidate.label}
              </button>
            ))}
          </div>
          <div className={styles.reviewControls} aria-label="Interaction phase">
            {fixture.id === 'fresh-turn' && (
              <>
                {(
                  [
                    ['fresh', 'Idle'],
                    ['targeting', 'Targeting'],
                    ['awaiting-roll', 'Awaiting roll'],
                    ['settled', 'Settled'],
                  ] as const
                ).map(([reviewPhase, label]) => (
                  <button
                    key={reviewPhase}
                    type="button"
                    className={
                      phase === reviewPhase ? styles.reviewControlActive : ''
                    }
                    onClick={() => showReviewPhase(reviewPhase)}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            <button
              type="button"
              className={contractOpen ? styles.reviewControlActive : ''}
              onClick={() => setContractOpen((open) => !open)}
            >
              {contractOpen ? 'Hide contract' : 'Show contract'}
            </button>
          </div>
        </div>
      </header>

      {contractOpen && (
        <ContractInspector
          fields={fixture.fieldSources}
          onClose={() => setContractOpen(false)}
        />
      )}

      <CombatExperience
        viewerMember={fixture.viewerMember}
        viewerName={fixture.viewerName}
        viewerClassRefId={fixture.viewerClassRefId}
        memberNames={
          new Map(
            fixture.participants.map((participant) => [
              participant.member,
              participant.name,
            ])
          )
        }
        clock={fixture.clock}
        round={fixture.round}
        participants={fixture.participants}
        declarations={fixture.declarations}
        characterData={fixture.characterData}
        privateStatus="ready"
        authorityFresh
        presentationState={presentationState}
        phase={phase}
        showTurnNotice={showTurnNotice}
        logMode={logMode}
        streamState={fixture.streamState}
        story={fixture.story}
        debug={fixture.debug}
        result={
          fixture.resultVisible || phase === 'settled'
            ? fixture.attackOutcome
            : undefined
        }
        diceEvents={diceEvents}
        location={{ name: 'Reference Tomb', area: 'South reliquary' }}
        renderMap={({ attackableTargets, onTargetClick }) => (
          <SessionCombatMap
            attackableTargets={attackableTargets}
            onTargetClick={onTargetClick}
          />
        )}
        onSelectDeclaration={armDeclaration}
        onTargetClick={chooseTarget}
        onEndTurn={armDeclaration}
        onLogModeChange={setLogMode}
        diceWitnessRole="roller"
        onDiceReleaseRequest={handleDiceRelease}
        onDiceSemanticReleaseRequest={() => setPhase('settled')}
        diagnosticsEnabled
      />
    </section>
  );
}
