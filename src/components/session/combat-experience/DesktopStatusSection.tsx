import type { CharacterData } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import styles from './DesktopStatusSection.module.css';
import type { CombatExperienceProps } from './types';

export interface DesktopStatusSectionProps {
  hitPoints?: CharacterData['hitPoints'];
  hpPercent: number;
  armor?: CharacterData['armorClassDetail'];
  movementLabel: 'Move' | 'Speed';
  movementFeet?: number;
  movementStale: boolean;
  privateStatus: CombatExperienceProps['privateStatus'];
  privateStatusMessage?: string;
  onRetry?: () => void;
}

/** Fixed read-only facts. This section never enters an action/order/page list. */
export function DesktopStatusSection({
  hitPoints,
  hpPercent,
  armor,
  movementLabel,
  movementFeet,
  movementStale,
  privateStatus,
  privateStatusMessage,
  onRetry,
}: DesktopStatusSectionProps) {
  return (
    <section
      className={styles.status}
      aria-label="Character status"
      data-testid="desktop-status-section"
    >
      <h3>Status</h3>
      <div className={styles.health}>
        <div>
          <span>HP</span>
          <strong>
            {hitPoints ? `${hitPoints.current}/${hitPoints.max}` : '—'}
          </strong>
        </div>
        {hitPoints && (
          <div className={styles.track} aria-hidden="true">
            <span style={{ width: `${hpPercent}%` }} />
          </div>
        )}
      </div>
      <dl>
        <div>
          <dt>AC</dt>
          <dd title={armor?.note}>{armor?.total ?? '—'}</dd>
        </div>
        <div data-stale={movementStale}>
          <dt>{movementLabel}</dt>
          <dd>{movementFeet === undefined ? '—' : `${movementFeet} ft`}</dd>
        </div>
      </dl>
      {movementStale && (
        <p className={styles.warning}>Movement may be out of date</p>
      )}
      {privateStatus !== 'ready' && (
        <div className={styles.feedback} role="status">
          <strong>
            {privateStatus === 'loading'
              ? 'Loading private status'
              : privateStatus === 'stale'
                ? 'Private status may be out of date'
                : 'Private status unavailable'}
          </strong>
          {privateStatusMessage && (
            <small className={styles.message} title={privateStatusMessage}>
              {privateStatusMessage}
            </small>
          )}
          {onRetry && (
            <button type="button" onClick={onRetry}>
              Retry status
            </button>
          )}
        </div>
      )}
    </section>
  );
}
