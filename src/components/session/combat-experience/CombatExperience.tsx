import { useDiceDials } from '@/feel/useFeelDials';
import {
  ClockKind,
  Standing,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { propLabel } from '../holdingAffordances';
import {
  authoredWords as exitWords,
  holdingPhrase as holdingWords,
} from '../holdingBeat';
import { ActionDock } from './ActionDock';
import { presentCharacterData } from './characterPresentation';
import styles from './CombatExperience.module.css';
import { DamageToasts } from './DamageToasts';
import { LocalWorldDieTile } from './LocalWorldDieTile';
import { RollFlashToasts } from './RollFlashToasts';
import { movementBudgetFeet, selectCombatExperience } from './selection';
import type { StandingAction } from './standingActions';
import { StoryLog } from './StoryLog';
import { holdStoryUntilSettled } from './storyReveal';
import { TargetSurface } from './TargetSurface';
import type { CombatExperienceProps } from './types';
import { useDamageToasts } from './useDamageToasts';
import { useDiceSettleGate } from './useDiceSettleGate';
import { useRollFlash } from './useRollFlash';

function portraitOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function labelOf(value?: string): string {
  if (!value) return 'Adventurer';
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function DeathSaveProgress({ participant }: { participant: Participant }) {
  const progress = participant.deathSaves;
  if (!progress) return null;
  return (
    <span
      className={styles.deathSaveProgress}
      data-testid="death-save-progress"
      aria-label={`${participant.name} death saves`}
    >
      <span className={styles.deathSavePips} aria-hidden="true">
        {Array.from({ length: progress.successes }, (_, index) => (
          <i key={`success:${index}`} data-testid="death-save-success-pip" />
        ))}
        {Array.from({ length: progress.failures }, (_, index) => (
          <i
            key={`failure:${index}`}
            data-testid="death-save-failure-pip"
            data-failure="true"
          />
        ))}
      </span>
      <span>
        {progress.successes} successes · {progress.successesNeeded} to stabilize
      </span>
      <span>
        {progress.failures} failures · {progress.failuresRemaining} remaining
      </span>
    </span>
  );
}

function InitiativeEntry({
  participant,
  viewerMember,
}: {
  participant: Participant;
  viewerMember: string;
}) {
  const you = participant.member === viewerMember;
  return (
    <div
      className={`${styles.initiativeEntry} ${participant.active ? styles.initiativeEntryActive : ''} ${participant.standing === Standing.DOWNED ? styles.initiativeEntryDowned : ''}`}
      title={`${participant.name}${you ? ' (you)' : ''}${participant.standing === Standing.DOWNED ? ' · downed' : ''}`}
      data-active={participant.active}
    >
      <span className={styles.initiativePortrait}>
        {portraitOf(participant.name)}
      </span>
      <span className={styles.initiativeName}>
        {you ? 'You' : participant.name}
      </span>
      <DeathSaveProgress participant={participant} />
    </div>
  );
}

interface InformationalStatus {
  key: string;
  label: string;
  detail: string;
  icon: string;
  tone: 'neutral' | 'warm' | 'cool' | 'danger';
}

function StatusBadge({ status }: { status: InformationalStatus }) {
  return (
    <span
      className={`${styles.effectBadge} ${styles[`effect_${status.tone}`]}`}
      title={
        status.detail ? `${status.label} · ${status.detail}` : status.label
      }
      data-informational="true"
    >
      <span aria-hidden="true">{status.icon}</span>
      {status.label}
    </span>
  );
}

export function CombatExperience({
  layout = 'review-frame',
  viewerMember,
  viewerName,
  viewerClassRefId,
  memberNames,
  clock,
  round,
  participants,
  declarations,
  characterData,
  privateStatus,
  privateStatusMessage,
  onRetryPrivateStatus,
  authorityFresh,
  endTurnBlocked = false,
  presentationState,
  phase,
  showTurnNotice,
  logMode,
  streamState,
  story,
  debug,
  result,
  diceEvents,
  diceSemanticFallback,
  diceWitnessRole,
  localWorldDieControl,
  localWorldDieSettled = false,
  location,
  pacingNotice,
  renderMap,
  onSelectDeclaration,
  onTargetClick,
  onEndTurn,
  onLogModeChange,
  onOpenEquipment,
  equipmentOpen,
  onSearch,
  searchPending = false,
  lootTargets = [],
  onLoot,
  lootPending = false,
  holdTargets = [],
  onHold,
  holdPending = false,
  onLeave,
  leavePending = false,
  leaveExitId,
  leaveHolding = [],
  onDiceSemanticReleaseRequest,
  diagnosticsEnabled,
}: CombatExperienceProps) {
  // A die is only worth waiting for when THIS viewer is the one rolling it.
  //
  // Spectating is the case that made the first version of this wrong: an
  // 'auto'-settled record still carries a neutral release in `diceEvents`, so
  // "are there dice events" answered yes for a monster's swing at the player
  // and held a log line nobody was rolling for. There is also no suspense to
  // protect there — the roll is not the viewer's to make, and catch-up history
  // must never be paced at all.
  const diePresented =
    diceWitnessRole === 'roller' &&
    !diceSemanticFallback &&
    !localWorldDieSettled &&
    diceEvents.length > 0;
  // `result` goes visible when the die is THROWN, not when it lands. Hold it
  // until the die is observed at rest — see useDiceSettleGate.ts.
  const { settledResult } = useDiceSettleGate({
    result,
    diePresented,
  });
  const damageToasts = useDamageToasts(settledResult);
  // `?rollFlash=` (diceDials.ts) — LIVE (#906 batch 2). `settledResult` is
  // the SAME signal useDamageToasts uses — see rollFlash.ts's own doc
  // comment for why that already produces "at settle" for the roller and
  // "at result arrival" for a spectator, with no extra logic needed here.
  const rollFlashDial = useDiceDials().rollFlash;
  const rollFlashes = useRollFlash(
    settledResult,
    rollFlashDial === 'toast' || rollFlashDial === 'both'
  );
  // The log narrates the same beat the toast announces, so it waits on the
  // same signal. Withholding the toast alone would have left the strike, its
  // damage, and the downed line that follows still spoiling the roll from the
  // log — see storyReveal.ts.
  const revealedStory = holdStoryUntilSettled(
    story,
    result && !settledResult ? result.attackId : undefined
  );
  const activeParticipant = participants.find(
    (participant) => participant.active
  );
  const isViewerTurn = activeParticipant?.member === viewerMember;

  /**
   * Search, Loot, Hold and Leave, as dock actions (Kirk's second walk:
   * "these should be buttons like the other actions I can take").
   *
   * Built here rather than in the dock because this component is what
   * holds the offers — which bodies are down beside you, which props you
   * can reach — and the dock's job is to draw what it is handed. The
   * ORDER is fixed and not sorted by anything: a list that reordered
   * itself as the party moved would move the button out from under a
   * finger mid-fight.
   */
  const standingActions: StandingAction[] = [];
  if (onSearch) {
    standingActions.push({
      key: 'session-combat-search-button',
      label: searchPending ? 'Searching…' : 'Search',
      icon: '🔍',
      title: "Search the room you're standing in",
      pending: searchPending,
      onSelect: onSearch,
    });
  }
  if (onLoot) {
    // ONE PER DOWNED BODY, all of them, in the order given (design P3):
    // a body with nothing to give offers exactly what the captain does.
    for (const target of lootTargets) {
      standingActions.push({
        key: `session-combat-loot-${target.subject}`,
        label: lootPending ? 'Looting…' : `Loot ${target.name}`,
        icon: '🖐',
        title: `Loot ${target.name}`,
        pending: lootPending,
        onSelect: () => onLoot(target.subject),
      });
    }
  }
  if (onHold) {
    for (const target of holdTargets) {
      standingActions.push({
        key: `session-combat-hold-${target.id}`,
        label: holdPending ? 'Holding…' : `Hold the ${propLabel(target)}`,
        icon: '✋',
        title: `Pick up the ${propLabel(target)}`,
        pending: holdPending,
        onSelect: () => onHold(target.id),
      });
    }
  }
  if (onLeave) {
    standingActions.push({
      key: 'session-combat-leave-button',
      label: leavePending ? 'Leaving…' : leaveLabel(leaveExitId, leaveHolding),
      icon: '🚪',
      title: leaveExitId
        ? `Leave through the ${exitWords(leaveExitId)}. Carrying what the run is about, that ends it`
        : 'Leave the dungeon. Away from a way out, whatever you carry stays where you stood',
      pending: leavePending,
      onSelect: onLeave,
    });
  }
  const selection = authorityFresh
    ? selectCombatExperience(declarations, presentationState)
    : null;
  const movementRemainingFeet = movementBudgetFeet(declarations);
  const hp = characterData?.hitPoints;
  const hpPercent = hp?.max
    ? Math.max(0, Math.min(100, Math.round((hp.current / hp.max) * 100)))
    : 0;
  const presentedCharacter = characterData
    ? presentCharacterData(characterData)
    : undefined;
  const statuses: InformationalStatus[] = presentedCharacter
    ? [
        ...presentedCharacter.features.map((feature, index) => ({
          key: `feature:${feature.ref?.module}:${feature.ref?.type}:${feature.ref?.id}:${index}`,
          label: feature.name,
          detail: feature.detail,
          icon: feature.icon,
          tone: feature.tone,
        })),
        ...presentedCharacter.conditions.map((condition, index) => ({
          key: `condition:${condition.ref?.module}:${condition.ref?.type}:${condition.ref?.id}:${index}`,
          label: condition.name,
          detail: condition.detail,
          icon: condition.icon,
          tone: condition.tone,
        })),
        ...presentedCharacter.resources.map((resource, index) => ({
          key: `resource:${resource.key}:${index}`,
          label: `${resource.name} ${resource.current}/${resource.maximum}`,
          detail: `${resource.current}/${resource.maximum}`,
          icon: resource.icon,
          tone: resource.tone,
        })),
      ]
    : [];

  return (
    <div
      className={`${styles.combatExperience} ${layout === 'fill-parent' ? styles.combatExperienceFillParent : ''}`}
      data-layout={layout}
    >
      <div className={styles.gameFrame} data-testid="combat-experience-shell">
        <div
          data-testid="session-combat-map"
          className={styles.map}
          aria-label="Encounter map"
        >
          <TargetSurface
            phase={phase}
            selection={selection}
            movementRemainingFeet={movementRemainingFeet}
            isViewerTurn={isViewerTurn}
            showTurnNotice={showTurnNotice}
            pacingNotice={pacingNotice}
            changedOptionNotice={presentationState.changedOptionNotice}
            memberNames={memberNames}
            location={location}
            renderMap={renderMap}
            onTargetClick={onTargetClick}
          />
        </div>

        {clock === ClockKind.TURN ? (
          <div
            data-testid="session-combat-initiative"
            className={styles.initiative}
            aria-label={`Round ${round} initiative`}
          >
            <span className={styles.roundMarker}>
              <small>Round</small>
              {round}
            </span>
            <div className={styles.initiativeOrder}>
              {participants.map((participant) => (
                <InitiativeEntry
                  key={participant.member}
                  participant={participant}
                  viewerMember={viewerMember}
                />
              ))}
            </div>
          </div>
        ) : clock === ClockKind.WORLD ? (
          <div
            data-testid="session-combat-free-roam"
            className={styles.freeRoamStatus}
          >
            <span>World clock</span>
            <strong>Free roam</strong>
          </div>
        ) : (
          <div
            data-testid="session-combat-synchronizing"
            className={styles.freeRoamStatus}
          >
            <span>Authority</span>
            <strong>Synchronizing</strong>
          </div>
        )}

        <DamageToasts toasts={damageToasts} />
        <RollFlashToasts flashes={rollFlashes} />

        <StoryLog
          story={revealedStory}
          debug={debug}
          mode={logMode}
          streamState={streamState}
          onModeChange={onLogModeChange}
          result={settledResult}
          diagnosticsEnabled={diagnosticsEnabled}
        />

        {diceWitnessRole === 'roller' &&
          phase === 'awaiting-roll' &&
          localWorldDieControl !== null && (
            <div className={styles.localWorldDieControlLayer}>
              {localWorldDieControl !== undefined ? (
                localWorldDieControl
              ) : (
                <LocalWorldDieTile
                  mode={diceSemanticFallback ? 'fallback' : 'ready'}
                  pickupReady={!diceSemanticFallback}
                  onRevealResult={
                    diceSemanticFallback
                      ? onDiceSemanticReleaseRequest
                      : undefined
                  }
                />
              )}
            </div>
          )}

        <div data-testid="session-combat-dock" className={styles.dock}>
          <div className={styles.identityRow}>
            <div className={styles.viewerPortrait}>
              {portraitOf(viewerName)}
            </div>
            <div className={styles.viewerIdentity}>
              <strong>{viewerName}</strong>
              <span>
                {characterData
                  ? `Level ${characterData.level} ${labelOf(viewerClassRefId)}`
                  : labelOf(viewerClassRefId)}
              </span>
            </div>
            {hp && (
              <div className={styles.hpBlock}>
                <div className={styles.hpLabel}>
                  <span>Hit points</span>
                  <strong>
                    {hp.current}/{hp.max}
                  </strong>
                </div>
                <div className={styles.hpTrack}>
                  <span style={{ width: `${hpPercent}%` }} />
                </div>
              </div>
            )}
            {characterData?.armorClassDetail && (
              <div
                className={styles.statBlock}
                title={characterData.armorClassDetail.note}
              >
                <small>Armor</small>
                <strong>{characterData.armorClassDetail.total}</strong>
              </div>
            )}
            {characterData && (
              <div className={styles.statBlock}>
                <small>{isViewerTurn ? 'Move' : 'Speed'}</small>
                <strong>
                  {isViewerTurn && movementRemainingFeet !== undefined
                    ? movementRemainingFeet
                    : characterData.baseSpeedFeet}{' '}
                  ft
                </strong>
              </div>
            )}
            {statuses.length > 0 && (
              <div className={styles.effects} aria-label="Character status">
                {statuses.map((status) => (
                  <StatusBadge key={status.key} status={status} />
                ))}
              </div>
            )}
            {privateStatus !== 'ready' && (
              <div className={styles.privateStatus} role="status">
                <strong>
                  {privateStatus === 'loading'
                    ? 'Loading private status'
                    : privateStatus === 'stale'
                      ? 'Private status may be out of date'
                      : 'Private status unavailable'}
                </strong>
                {privateStatusMessage && <small>{privateStatusMessage}</small>}
                {onRetryPrivateStatus && (
                  <button type="button" onClick={onRetryPrivateStatus}>
                    Retry private status
                  </button>
                )}
              </div>
            )}
            {characterData && onOpenEquipment && (
              <button
                type="button"
                className={styles.equipmentButton}
                data-testid="session-combat-equipment-button"
                aria-pressed={equipmentOpen}
                title="Equipment"
                onClick={onOpenEquipment}
              >
                <span aria-hidden="true">♜</span>
                Equipment
              </button>
            )}
          </div>

          <ActionDock
            clock={clock}
            viewerMember={viewerMember}
            participants={participants}
            declarations={declarations}
            authorityFresh={authorityFresh}
            endTurnBlocked={endTurnBlocked}
            armedDeclarationId={
              presentationState.armedDeclarationId ?? undefined
            }
            onSelectDeclaration={onSelectDeclaration}
            onEndTurn={onEndTurn}
            standingActions={standingActions}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * What the Leave button says.
 *
 * # It never claims a departure is free
 *
 * Away from every authored way out, the drop is CERTAIN — no exit at all
 * is the scenario's bound exit — so the button names what it costs. That
 * is design R9's price, and the walk that asked for this line is a carrier
 * who paid it without being told.
 *
 * ON an authored way out it says what is true and no more: which way out,
 * and what is being carried through it. IT DOES NOT SAY THE HOLDING IS
 * SAFE, because this client cannot know that. `GetAtlasResponse.exits` is
 * every authored exit — structure, not scenario — and nothing on the wire
 * says which one the scenario BOUND. A dungeon with two ways out, bound to
 * one, would otherwise read "Leave through the sally port" with no warning
 * and drop the artifact anyway: Kirk's walk again, with the button now
 * actively reassuring him. A label that omits a cost is survivable; one
 * that implies its absence is not.
 *
 * Carrying nothing, there is no cost either way and the button says
 * nothing about one.
 */
function leaveLabel(
  exitId: string | undefined,
  holding: readonly string[]
): string {
  // The PHRASE, not the count: an id that renders to nothing (`-`) would
  // otherwise produce "Leave (drops )". `holdingPhrase` documents exactly
  // this distinction for exactly this kind of caller.
  const carried = holdingWords(holding);
  if (exitId) {
    const through = `Leave through the ${exitWords(exitId)}`;
    return carried ? `${through} with ${carried}` : through;
  }
  return carried ? `Leave (drops ${carried})` : 'Leave';
}
