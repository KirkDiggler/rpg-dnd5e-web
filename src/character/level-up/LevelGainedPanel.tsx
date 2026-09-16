import type { LevelGained } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Card } from '../../components/ui/Card';

export interface LevelGainedPanelProps {
  gained: LevelGained;
}

/**
 * What the level brought, as the engine reported it.
 *
 * EVERY NUMBER HERE IS THE ENGINE'S. Hit points, features and pool maximums
 * are read off the LevelGained the level-up returned and never recomputed:
 * the spell slots a level added have no persistent representation on any wire
 * — v1alpha1 Character.spell_slots is deprecated and unread, and the
 * encounter's ResourceView excludes slots by design — so this response is the
 * only place a "2 to 3" can honestly come from.
 */
export function LevelGainedPanel({ gained }: LevelGainedPanelProps) {
  return (
    <Card className="p-6 space-y-4" data-testid="level-gained">
      <h2
        className="text-2xl font-bold"
        style={{ fontFamily: 'Cinzel, serif', color: 'var(--text-primary)' }}
      >
        Level {gained.level}
      </h2>

      <div style={{ color: 'var(--text-primary)' }}>
        <span className="font-medium">Hit points gained</span>{' '}
        <span data-testid="hit-points-gained">{gained.hitPointsGained}</span>
      </div>

      {gained.features.length > 0 && (
        <div className="space-y-2">
          <div
            className="text-sm font-medium"
            style={{ color: 'var(--accent-primary)' }}
          >
            Features gained
          </div>
          {gained.features.map((feature) => (
            <div
              key={feature.id || feature.name}
              data-testid="gained-feature"
              style={{ color: 'var(--text-primary)' }}
            >
              {feature.name}
            </div>
          ))}
        </div>
      )}

      {gained.resourceChanges.length > 0 && (
        <div className="space-y-2">
          <div
            className="text-sm font-medium"
            style={{ color: 'var(--accent-primary)' }}
          >
            Resources
          </div>
          {gained.resourceChanges.map((change) => (
            <div
              key={change.key}
              data-testid="resource-change"
              style={{ color: 'var(--text-primary)' }}
            >
              {change.name} {change.previousMaximum} → {change.newMaximum}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
