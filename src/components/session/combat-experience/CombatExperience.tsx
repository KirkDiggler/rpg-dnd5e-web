import {
  ClockKind,
  Standing,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { ActionDock } from './ActionDock';
import { presentCharacterData } from './characterPresentation';
import styles from './CombatExperience.module.css';
import { DamageToasts } from './DamageToasts';
import { DiceDrawer } from './DiceDrawer';
import { movementBudgetFeet, selectCombatExperience } from './selection';
import { StoryLog } from './StoryLog';
import { TargetSurface } from './TargetSurface';
import type { CombatExperienceProps } from './types';
import { useDamageToasts } from './useDamageToasts';

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
  diceRollerName,
  location,
  pacingNotice,
  renderMap,
  onSelectDeclaration,
  onTargetClick,
  onEndTurn,
  onLogModeChange,
  onOpenEquipment,
  equipmentOpen,
  onDiceReleaseRequest,
  onDiceSemanticReleaseRequest,
  diagnosticsEnabled,
}: CombatExperienceProps) {
  // Fed the REVEALED outcome, so a hit announces itself when the roll lands
  // rather than when the event arrived — see damageToasts.ts.
  const damageToasts = useDamageToasts(result);
  const activeParticipant = participants.find(
    (participant) => participant.active
  );
  const isViewerTurn = activeParticipant?.member === viewerMember;
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

        <StoryLog
          story={story}
          debug={debug}
          mode={logMode}
          streamState={streamState}
          onModeChange={onLogModeChange}
          result={result}
          diagnosticsEnabled={diagnosticsEnabled}
        />

        {diceWitnessRole === 'roller' ? (
          <DiceDrawer
            phase={phase}
            events={diceEvents}
            rollerName={diceRollerName ?? viewerName}
            semanticFallback={diceSemanticFallback}
            witnessRole="roller"
            onReleaseRequest={onDiceReleaseRequest}
            onSemanticReleaseRequest={onDiceSemanticReleaseRequest}
          />
        ) : (
          <DiceDrawer
            phase={phase}
            events={diceEvents}
            rollerName={diceRollerName ?? viewerName}
            semanticFallback={diceSemanticFallback}
            witnessRole="spectator"
          />
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
            armedDeclarationId={
              presentationState.armedDeclarationId ?? undefined
            }
            onSelectDeclaration={onSelectDeclaration}
            onEndTurn={onEndTurn}
          />
        </div>
      </div>
    </div>
  );
}
