import {
  ClockKind,
  Standing,
  Verb,
  type Participant,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { ActionDock } from './ActionDock';
import styles from './CombatExperience.module.css';
import { DiceDrawer } from './DiceDrawer';
import { selectCombatExperience } from './selection';
import { StoryLog } from './StoryLog';
import { TargetSurface } from './TargetSurface';
import type { CombatExperienceProps } from './types';

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
  tone: 'warm' | 'cool' | 'danger';
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
  viewerMember,
  clock,
  round,
  participants,
  declarations,
  characterData,
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
  renderMap,
  onSelectDeclaration,
  onTargetClick,
  onEndTurn,
  onLogModeChange,
  onDiceReleaseRequest,
  onDiceSemanticReleaseRequest,
  diagnosticsEnabled,
}: CombatExperienceProps) {
  const viewer = participants.find(
    (participant) => participant.member === viewerMember
  );
  const activeParticipant = participants.find(
    (participant) => participant.active
  );
  const isViewerTurn = activeParticipant?.member === viewerMember;
  const selection = selectCombatExperience(declarations, presentationState);
  const moveDeclarations = declarations.filter(
    (declaration) => declaration.verb === Verb.MOVE
  );
  const movementRemainingFeet =
    moveDeclarations.length === 1 ? moveDeclarations[0]?.remaining : undefined;
  const hp = characterData.hitPoints;
  const hpPercent = hp?.max
    ? Math.max(0, Math.min(100, Math.round((hp.current / hp.max) * 100)))
    : 0;
  const statuses: InformationalStatus[] = [
    ...characterData.features.map((feature, index) => ({
      key: `feature:${feature.ref?.module}:${feature.ref?.type}:${feature.ref?.id}:${index}`,
      label: feature.name,
      detail: feature.detail,
      icon: '◆',
      tone: 'warm' as const,
    })),
    ...characterData.conditions.map((condition, index) => ({
      key: `condition:${condition.ref?.module}:${condition.ref?.type}:${condition.ref?.id}:${index}`,
      label: condition.name,
      detail: condition.detail,
      icon: '◈',
      tone: 'cool' as const,
    })),
    ...characterData.resources.map((resource, index) => ({
      key: `resource:${resource.key}:${index}`,
      label: `${resource.name} ${resource.current}/${resource.maximum}`,
      detail: `${resource.current}/${resource.maximum}`,
      icon: '●',
      tone: 'danger' as const,
    })),
  ];

  return (
    <div className={styles.combatExperience}>
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
            participantNames={
              new Map(
                participants.map((participant) => [
                  participant.member,
                  participant.name,
                ])
              )
            }
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
          story={story}
          debug={debug}
          mode={logMode}
          streamState={streamState}
          onModeChange={onLogModeChange}
          result={result}
          diagnosticsEnabled={diagnosticsEnabled}
        />

        <DiceDrawer
          phase={phase}
          events={diceEvents}
          rollerName={diceRollerName ?? viewer?.name ?? 'Your character'}
          onReleaseRequest={onDiceReleaseRequest}
          semanticFallback={diceSemanticFallback}
          onSemanticReleaseRequest={onDiceSemanticReleaseRequest}
          witnessRole={diceWitnessRole}
        />

        <div data-testid="session-combat-dock" className={styles.dock}>
          <div className={styles.identityRow}>
            <div className={styles.viewerPortrait}>
              {portraitOf(viewer?.name ?? 'You')}
            </div>
            <div className={styles.viewerIdentity}>
              <strong>{viewer?.name ?? 'You'}</strong>
              <span>
                Level {characterData.level}{' '}
                {labelOf(characterData.classRef?.id)}
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
            {characterData.armorClassDetail && (
              <div
                className={styles.statBlock}
                title={characterData.armorClassDetail.note}
              >
                <small>Armor</small>
                <strong>{characterData.armorClassDetail.total}</strong>
              </div>
            )}
            <div className={styles.statBlock}>
              <small>{isViewerTurn ? 'Move' : 'Speed'}</small>
              <strong>
                {isViewerTurn && movementRemainingFeet !== undefined
                  ? movementRemainingFeet
                  : characterData.baseSpeedFeet}{' '}
                ft
              </strong>
            </div>
            <div className={styles.effects} aria-label="Character status">
              {statuses.map((status) => (
                <StatusBadge key={status.key} status={status} />
              ))}
            </div>
          </div>

          <ActionDock
            clock={clock}
            viewerMember={viewerMember}
            participants={participants}
            declarations={declarations}
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
