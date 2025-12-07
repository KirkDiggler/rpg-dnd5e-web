import type { TurnState } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/encounter_pb';
import styles from '../styles/combat.module.css';

export interface ActionEconomyIndicatorsProps {
  turnState: TurnState | null | undefined;
}

/**
 * ActionEconomyIndicators - Displays character's action economy during combat
 *
 * This component shows:
 * 1. Movement remaining - progress bar with "X/Y ft" label (e.g., "25/30 ft")
 * 2. Action available - filled/empty dot indicator
 * 3. Bonus Action available - filled/empty dot indicator
 * 4. Reaction available - filled/empty dot indicator
 *
 * Data source: TurnState from CombatState.currentTurn
 * - turnState.movementUsed - feet of movement used
 * - turnState.movementMax - maximum movement (typically 30)
 * - turnState.actionUsed - boolean
 * - turnState.bonusActionUsed - boolean
 * - turnState.reactionAvailable - boolean (note: this is available, not used)
 *
 * If no turnState provided, shows default values (full resources)
 */
export function ActionEconomyIndicators({
  turnState,
}: ActionEconomyIndicatorsProps) {
  // Extract values with defaults
  const movementUsed = turnState?.movementUsed || 0;
  const movementMax = turnState?.movementMax || 30;
  const movementRemaining = movementMax - movementUsed;
  const actionAvailable = turnState ? !turnState.actionUsed : true;
  const bonusActionAvailable = turnState ? !turnState.bonusActionUsed : true;
  const reactionAvailable = turnState ? turnState.reactionAvailable : true;

  // Calculate movement percentage for progress bar
  const movementPercentage = (movementRemaining / movementMax) * 100;

  return (
    <div className={styles.actionEconomySection}>
      {/* Movement */}
      <div className={styles.actionEconomyItem}>
        <span className={styles.actionEconomyLabel}>Movement</span>
        <div className={styles.movementDisplay}>
          <div className={styles.movementBarContainer}>
            <div
              className={styles.movementBarFill}
              style={{
                width: `${Math.max(0, Math.min(100, movementPercentage))}%`,
                backgroundColor: movementRemaining > 0 ? '#10b981' : '#6b7280', // emerald-500 / gray-500
              }}
            />
          </div>
          <span className={styles.movementText}>
            {movementRemaining}/{movementMax} ft
          </span>
        </div>
      </div>

      {/* Action */}
      <div className={styles.actionEconomyItem}>
        <span className={styles.actionEconomyLabel}>Action</span>
        <div
          className={`${styles.actionDot} ${actionAvailable ? styles.actionDotAvailable : styles.actionDotUsed}`}
          title={actionAvailable ? 'Action available' : 'Action used'}
        >
          <span className={styles.actionDotIcon}>
            {actionAvailable ? '●' : '○'}
          </span>
        </div>
      </div>

      {/* Bonus Action */}
      <div className={styles.actionEconomyItem}>
        <span className={styles.actionEconomyLabel}>Bonus</span>
        <div
          className={`${styles.actionDot} ${bonusActionAvailable ? styles.actionDotAvailable : styles.actionDotUsed}`}
          title={
            bonusActionAvailable
              ? 'Bonus action available'
              : 'Bonus action used'
          }
        >
          <span className={styles.actionDotIcon}>
            {bonusActionAvailable ? '●' : '○'}
          </span>
        </div>
      </div>

      {/* Reaction */}
      <div className={styles.actionEconomyItem}>
        <span className={styles.actionEconomyLabel}>Reaction</span>
        <div
          className={`${styles.actionDot} ${reactionAvailable ? styles.actionDotAvailable : styles.actionDotUsed}`}
          title={reactionAvailable ? 'Reaction available' : 'Reaction used'}
        >
          <span className={styles.actionDotIcon}>
            {reactionAvailable ? '●' : '○'}
          </span>
        </div>
      </div>
    </div>
  );
}
