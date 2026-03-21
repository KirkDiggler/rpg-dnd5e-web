import type { AbilityGuidance } from './data';

interface AbilityScoreGuidanceProps {
  guidance: AbilityGuidance[];
}

const PRIORITY_STYLES: Record<
  AbilityGuidance['priority'],
  { label: string; color: string }
> = {
  primary: { label: 'PRIMARY', color: 'var(--legendary)' },
  secondary: { label: 'SECONDARY', color: 'var(--rare)' },
  tertiary: { label: 'IMPORTANT', color: 'var(--uncommon)' },
};

export function AbilityScoreGuidance({ guidance }: AbilityScoreGuidanceProps) {
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
        Ability Score Priority
      </h3>
      <div className="space-y-3">
        {guidance.map((g) => {
          const style = PRIORITY_STYLES[g.priority];
          return (
            <div key={g.ability} className="flex gap-3 items-start">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded shrink-0 mt-0.5"
                style={{
                  color: style.color,
                  border: `1px solid ${style.color}`,
                }}
              >
                {style.label}
              </span>
              <div>
                <span
                  className="font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {g.ability}
                </span>
                <span className="mx-1.5" style={{ color: 'var(--text-muted)' }}>
                  —
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  {g.explanation}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
