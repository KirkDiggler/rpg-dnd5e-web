import type {
  DicePresentationEvent,
  DicePresentationReleasedEvent,
} from '@/components/ui/dice/dicePresentationEvent';
import { useEffect, useState } from 'react';
import { ActionDock } from './ActionDock';
import { ContractInspector } from './ContractInspector';
import { DiceDrawer } from './DiceDrawer';
import {
  appendSessionCombatDiceEvent,
  createSessionCombatDiceRequest,
  createSessionCombatNeutralRelease,
} from './diceFixture';
import { SESSION_COMBAT_FIXTURES } from './fixtures';
import styles from './SessionCombatConcept.module.css';
import {
  selectOffer,
  selectTarget,
  type SessionCombatSelection,
} from './sessionCombatSelection';
import type {
  SessionCombatEffect,
  SessionCombatParticipant,
} from './sessionCombatTypes';
import { StoryLog, type SessionCombatLogMode } from './StoryLog';
import { TargetSurface, type SessionCombatPhase } from './TargetSurface';

function InitiativeEntry({
  participant,
}: {
  participant: SessionCombatParticipant;
}) {
  return (
    <div
      className={`${styles.initiativeEntry} ${participant.active ? styles.initiativeEntryActive : ''} ${participant.standing === 'downed' ? styles.initiativeEntryDowned : ''}`}
      title={`${participant.name}${participant.you ? ' (you)' : ''}${participant.standing === 'downed' ? ' · downed' : ''}`}
      data-active={participant.active}
    >
      <span className={styles.initiativePortrait}>{participant.portrait}</span>
      <span className={styles.initiativeName}>
        {participant.you ? 'You' : participant.name}
      </span>
    </div>
  );
}

function EffectBadge({ effect }: { effect: SessionCombatEffect }) {
  return (
    <span
      className={`${styles.effectBadge} ${styles[`effect_${effect.tone}`]}`}
      title={`${effect.label} · ${effect.detail}`}
    >
      <span aria-hidden="true">{effect.icon}</span>
      {effect.label}
    </span>
  );
}

export function SessionCombatConcept() {
  const [fixtureId, setFixtureId] = useState('fresh-turn');
  const fixture =
    SESSION_COMBAT_FIXTURES.find((candidate) => candidate.id === fixtureId) ??
    SESSION_COMBAT_FIXTURES[0];
  const [phase, setPhase] = useState<SessionCombatPhase>('fresh');
  const [selection, setSelection] = useState<SessionCombatSelection | null>(
    null
  );
  const [showTurnNotice, setShowTurnNotice] = useState(true);
  const [logMode, setLogMode] = useState<SessionCombatLogMode>('story');
  const [contractOpen, setContractOpen] = useState(false);
  const [diceEvents, setDiceEvents] = useState<
    readonly DicePresentationEvent[]
  >([]);
  const hpPercent = Math.round(
    (fixture.viewer.hp.current / fixture.viewer.hp.max) * 100
  );

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
    setSelection(null);
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

  const armOffer = (offerId: string) => {
    const next = selectOffer(fixture, offerId);
    if (!next) return;
    setShowTurnNotice(false);
    setDiceEvents([]);
    setSelection(next);
    setPhase(next.offer.targetMode === 'single' ? 'targeting' : 'fresh');
  };

  const chooseTarget = (targetId: string) => {
    if (!selection) return;
    const next = selectTarget(selection, targetId);
    if (!next.target) return;
    setSelection(next);
    setDiceEvents(freshDiceEvents());
    setPhase('awaiting-roll');
  };

  const showReviewPhase = (nextPhase: SessionCombatPhase) => {
    if (nextPhase === 'fresh') {
      setSelection(null);
      setDiceEvents([]);
      setShowTurnNotice(fixture.mode === 'turn' && fixture.isViewerTurn);
      setPhase('fresh');
      return;
    }
    const attack = selectOffer(fixture, 'attack:longsword');
    if (!attack) return;
    setShowTurnNotice(false);
    if (nextPhase === 'targeting') {
      setDiceEvents([]);
      setSelection(attack);
      setPhase('targeting');
      return;
    }
    const targeted = selectTarget(attack, 'skeleton-guard');
    const request = freshDiceEvents();
    setSelection(targeted);
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
            Session encounter · UI/UX proposal
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
                <button
                  type="button"
                  className={
                    phase === 'fresh' ? styles.reviewControlActive : ''
                  }
                  onClick={() => showReviewPhase('fresh')}
                >
                  Idle
                </button>
                <button
                  type="button"
                  className={
                    phase === 'targeting' ? styles.reviewControlActive : ''
                  }
                  onClick={() => showReviewPhase('targeting')}
                >
                  Targeting
                </button>
                <button
                  type="button"
                  className={
                    phase === 'awaiting-roll' ? styles.reviewControlActive : ''
                  }
                  onClick={() => showReviewPhase('awaiting-roll')}
                >
                  Awaiting roll
                </button>
                <button
                  type="button"
                  className={
                    phase === 'settled' ? styles.reviewControlActive : ''
                  }
                  onClick={() => showReviewPhase('settled')}
                >
                  Settled
                </button>
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

      <div className={styles.gameFrame}>
        <div
          data-testid="session-combat-map"
          className={styles.map}
          aria-label="Encounter map"
        >
          <TargetSurface
            phase={phase}
            selection={selection}
            movementRemainingFeet={fixture.viewer.movementRemainingFeet}
            mode={fixture.mode}
            isViewerTurn={fixture.isViewerTurn}
            showTurnNotice={showTurnNotice}
            onTargetClick={chooseTarget}
          />
        </div>

        {fixture.mode === 'turn' ? (
          <div
            data-testid="session-combat-initiative"
            className={styles.initiative}
            aria-label={`Round ${fixture.round} initiative`}
          >
            <span className={styles.roundMarker}>
              <small>Round</small>
              {fixture.round}
            </span>
            <div className={styles.initiativeOrder}>
              {fixture.participants.map((participant) => (
                <InitiativeEntry
                  key={participant.id}
                  participant={participant}
                />
              ))}
            </div>
          </div>
        ) : (
          <div
            data-testid="session-combat-free-roam"
            className={styles.freeRoamStatus}
          >
            <span>World clock</span>
            <strong>Free roam</strong>
          </div>
        )}

        <StoryLog
          story={fixture.story}
          debug={fixture.debug}
          mode={logMode}
          streamState={fixture.streamState}
          onModeChange={setLogMode}
          result={
            fixture.resultVisible || phase === 'settled'
              ? fixture.attackOutcome
              : undefined
          }
        />

        <DiceDrawer
          phase={phase}
          events={diceEvents}
          onReleaseRequest={handleDiceRelease}
        />

        <div data-testid="session-combat-dock" className={styles.dock}>
          <div className={styles.identityRow}>
            <div className={styles.viewerPortrait}>
              {fixture.viewer.portrait}
            </div>
            <div className={styles.viewerIdentity}>
              <strong>{fixture.viewer.name}</strong>
              <span>
                Level {fixture.viewer.level} {fixture.viewer.className}
              </span>
            </div>
            <div className={styles.hpBlock}>
              <div className={styles.hpLabel}>
                <span>Hit points</span>
                <strong>
                  {fixture.viewer.hp.current}/{fixture.viewer.hp.max}
                </strong>
              </div>
              <div className={styles.hpTrack}>
                <span style={{ width: `${hpPercent}%` }} />
              </div>
            </div>
            <div className={styles.statBlock}>
              <small>Armor</small>
              <strong>{fixture.viewer.armorClass}</strong>
            </div>
            <div className={styles.statBlock}>
              <small>{fixture.isViewerTurn ? 'Move' : 'Speed'}</small>
              <strong>{fixture.viewer.movementRemainingFeet} ft</strong>
            </div>
            {fixture.economy && (
              <div className={styles.economy} aria-label="Turn resources">
                <span
                  className={
                    fixture.economy.action
                      ? styles.economyLit
                      : styles.economySpent
                  }
                  title={
                    fixture.economy.action ? 'Action available' : 'Action spent'
                  }
                >
                  <b>A</b> Action
                </span>
                <span
                  className={
                    fixture.economy.bonus
                      ? styles.economyLit
                      : styles.economySpent
                  }
                  title={
                    fixture.economy.bonus
                      ? 'Bonus action available'
                      : 'Bonus action spent'
                  }
                >
                  <b>B</b> Bonus
                </span>
                <span
                  className={
                    fixture.economy.reaction
                      ? styles.economyLit
                      : styles.economySpent
                  }
                  title={
                    fixture.economy.reaction
                      ? 'Reaction available'
                      : 'Reaction spent'
                  }
                >
                  <b>R</b> Reaction
                </span>
              </div>
            )}
            <div className={styles.effects} aria-label="Active effects">
              {fixture.effects.map((effect) => (
                <EffectBadge key={effect.id} effect={effect} />
              ))}
            </div>
          </div>

          <ActionDock
            offers={fixture.offers}
            mode={fixture.mode}
            isViewerTurn={fixture.isViewerTurn}
            activeParticipantName={fixture.activeParticipantName}
            armedOfferId={selection?.offer.id}
            onSelectOffer={armOffer}
          />
        </div>
      </div>
    </section>
  );
}
