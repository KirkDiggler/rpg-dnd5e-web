import type { EquipmentOption } from './data';

interface EquipmentGuidanceProps {
  equipment: EquipmentOption[];
}

export function EquipmentGuidance({ equipment }: EquipmentGuidanceProps) {
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
        Starting Equipment Options
      </h3>

      <div className="space-y-3">
        {equipment.map((item) => (
          <div
            key={item.itemName}
            className="rounded p-4"
            style={{
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border-primary)',
            }}
          >
            <div className="flex items-start justify-between mb-2">
              <h4
                className="font-semibold"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.itemName}
              </h4>
              <div className="flex gap-2 text-xs">
                <span
                  className="px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--accent-primary)',
                    border: '1px solid var(--accent-primary)',
                  }}
                >
                  {item.damage} {item.damageType}
                </span>
              </div>
            </div>

            {/* Properties */}
            {item.properties.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {item.properties.map((prop) => (
                  <span
                    key={prop}
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {prop}
                  </span>
                ))}
              </div>
            )}

            {/* Tip */}
            <p
              className="text-sm leading-relaxed"
              style={{
                color: 'var(--text-muted)',
                fontFamily: 'Crimson Text, serif',
              }}
            >
              {item.tip}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
