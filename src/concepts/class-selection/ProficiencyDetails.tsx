import type { ProficiencyDetails as ProficiencyDetailsType } from './data';

interface ProficiencyDetailsProps {
  details: ProficiencyDetailsType;
  skillChoices: {
    count: number;
    options: string[];
    tips: string;
  };
}

interface ProficiencySectionProps {
  label: string;
  items: string[];
  notes: string;
  emptyText?: string;
}

function ProficiencySection({
  label,
  items,
  notes,
  emptyText,
}: ProficiencySectionProps) {
  return (
    <div className="mb-4 last:mb-0">
      <h4
        className="text-sm font-bold uppercase tracking-wide mb-1.5"
        style={{ color: 'var(--accent-primary)' }}
      >
        {label}
      </h4>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item) => (
            <span
              key={item}
              className="text-sm px-2 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
          {emptyText || 'None'}
        </p>
      )}
      {notes && (
        <p
          className="text-sm leading-relaxed"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'Crimson Text, serif',
          }}
        >
          {notes}
        </p>
      )}
    </div>
  );
}

export function ProficiencyDetails({
  details,
  skillChoices,
}: ProficiencyDetailsProps) {
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
        Proficiencies
      </h3>

      <ProficiencySection
        label="Weapons"
        items={details.weapons}
        notes={details.weaponNotes}
      />
      <ProficiencySection
        label="Armor"
        items={details.armor}
        notes={details.armorNotes}
        emptyText="None — see Unarmored Defense"
      />
      <ProficiencySection
        label="Tools"
        items={details.tools}
        notes={details.toolNotes}
        emptyText="None"
      />

      {/* Skill choices */}
      <div
        className="mt-4 pt-4"
        style={{ borderTop: '1px solid var(--border-primary)' }}
      >
        <h4
          className="text-sm font-bold uppercase tracking-wide mb-1.5"
          style={{ color: 'var(--accent-primary)' }}
        >
          Skills (Choose {skillChoices.count})
        </h4>
        <div className="flex flex-wrap gap-2 mb-2">
          {skillChoices.options.map((skill) => (
            <span
              key={skill}
              className="text-sm px-2 py-0.5 rounded"
              style={{
                backgroundColor: 'var(--card-bg)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              {skill}
            </span>
          ))}
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{
            color: 'var(--text-muted)',
            fontFamily: 'Crimson Text, serif',
          }}
        >
          {skillChoices.tips}
        </p>
      </div>
    </div>
  );
}
