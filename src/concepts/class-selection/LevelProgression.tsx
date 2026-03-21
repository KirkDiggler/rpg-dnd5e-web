import type {
  LevelFeature,
  LevelProgression as LevelProgressionType,
} from './data';

interface LevelProgressionProps {
  progression: LevelProgressionType[];
}

const TYPE_STYLES: Record<
  LevelFeature['type'],
  { label: string; color: string }
> = {
  feature: { label: 'ACTION', color: 'var(--rare)' },
  condition: { label: 'PASSIVE', color: 'var(--uncommon)' },
  resource: { label: 'RESOURCE', color: 'var(--legendary)' },
  subclass: { label: 'SUBCLASS', color: 'var(--epic)' },
};

export function LevelProgression({ progression }: LevelProgressionProps) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <h3
        className="text-lg font-bold mb-4"
        style={{ fontFamily: 'Cinzel, serif', color: 'var(--text-primary)' }}
      >
        Level Progression (1–3)
      </h3>

      <div className="space-y-5">
        {progression.map((level) => (
          <div key={level.level}>
            <h4
              className="text-base font-bold mb-3"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
              }}
            >
              Level {level.level}
            </h4>
            <div
              className="space-y-3 ml-4"
              style={{
                borderLeft: '2px solid var(--border-primary)',
                paddingLeft: '16px',
              }}
            >
              {level.features.map((feature) => {
                const typeStyle = TYPE_STYLES[feature.type];
                return (
                  <div key={feature.name}>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-bold px-1.5 py-0.5 rounded"
                        style={{
                          color: typeStyle.color,
                          border: `1px solid ${typeStyle.color}`,
                        }}
                      >
                        {typeStyle.label}
                      </span>
                      <span
                        className="font-semibold"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {feature.name}
                      </span>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{
                        color: 'var(--text-muted)',
                        fontFamily: 'Crimson Text, serif',
                      }}
                    >
                      {feature.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
