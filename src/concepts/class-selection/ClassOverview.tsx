import type { EnrichedClassInfo } from './data';

interface ClassOverviewProps {
  classInfo: EnrichedClassInfo;
}

export function ClassOverview({ classInfo }: ClassOverviewProps) {
  return (
    <div
      className="rounded-lg p-6"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      {/* Class identity */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-4xl">{classInfo.emoji}</span>
        <div>
          <h2
            className="text-2xl font-bold"
            style={{
              fontFamily: 'Cinzel, serif',
              color: 'var(--text-primary)',
            }}
          >
            {classInfo.name}
          </h2>
          <div
            className="flex gap-4 mt-1 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Hit Die: d{classInfo.hitDie}</span>
            <span>Primary: {classInfo.primaryAbility}</span>
          </div>
        </div>
      </div>

      {/* Rich description */}
      <p
        className="text-base leading-relaxed"
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'Crimson Text, serif',
        }}
      >
        {classInfo.description}
      </p>
    </div>
  );
}
