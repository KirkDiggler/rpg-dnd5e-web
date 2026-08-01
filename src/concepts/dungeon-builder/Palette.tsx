/**
 * Palette — prop/monster refs drawn from showcase.yaml's own vocabulary
 * via `paletteData.ts` (sourced from the real `propManifest.ts`), plus a
 * read-only door/start/end legend. Door/start/end are not placeable:
 * connectors are `{from, to}`, doors sit at the derived door_row, and the
 * entrance is generator-chosen — none of which is an authorable
 * coordinate (design.md's palette-honesty note).
 */
import {
  BOSS_COLOR,
  MONSTER_COLOR,
  MONSTER_REF,
  PALETTE_PROPS,
  ROLE_COLOR,
} from './paletteData';
import type { PaletteSelection } from './types';

interface PaletteProps {
  selected: PaletteSelection | null;
  onSelect: (sel: PaletteSelection | null) => void;
  usageCounts: Record<string, number>;
}

function Row({
  color,
  short,
  label,
  sub,
  isSelected,
  onClick,
}: {
  color: string;
  short: string;
  label: string;
  sub: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
      className="flex items-center gap-2 px-2 py-1.5 mb-0.5 rounded cursor-pointer text-xs"
      style={{
        backgroundColor: isSelected ? '#3a2f18' : undefined,
        border: isSelected ? '1px solid #c9a227' : '1px solid transparent',
        color: isSelected ? '#ffd76a' : 'var(--text-primary)',
      }}
    >
      <span
        className="flex items-center justify-center rounded font-bold shrink-0"
        style={{
          width: 22,
          height: 22,
          background: color,
          color: '#14110f',
          fontSize: 9,
        }}
      >
        {short}
      </span>
      <span className="flex-1">
        {label}
        <div style={{ fontSize: 10, color: 'var(--text-secondary, #8a7a5a)' }}>
          {sub}
        </div>
      </span>
    </div>
  );
}

export function Palette({ selected, onSelect, usageCounts }: PaletteProps) {
  const isSel = (kind: PaletteSelection['kind'], ref: string) =>
    !!selected && selected.kind === kind && selected.ref === ref;

  return (
    <aside
      style={{ width: 250, flex: '0 0 250px', overflowY: 'auto', padding: 10 }}
    >
      <h2
        className="text-xs uppercase tracking-wide mb-2 pb-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        Props (from showcase.yaml)
      </h2>
      {PALETTE_PROPS.map((p) => (
        <Row
          key={p.ref}
          color={ROLE_COLOR[p.role]}
          short={p.short}
          label={p.ref.split(':').pop() ?? p.ref}
          sub={`${usageCounts[p.ref] ?? 0}× used · ${p.role}`}
          isSelected={isSel('prop', p.ref)}
          onClick={() =>
            onSelect(isSel('prop', p.ref) ? null : { kind: 'prop', ref: p.ref })
          }
        />
      ))}

      <h2
        className="text-xs uppercase tracking-wide mb-2 mt-4 pb-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        Monsters
      </h2>
      <Row
        color={MONSTER_COLOR}
        short="Sc"
        label="skeleton-captain"
        sub="flags forced off — dungeonspec rejects blocks_* on monster place: entries"
        isSelected={isSel('monster', MONSTER_REF)}
        onClick={() =>
          onSelect(
            isSel('monster', MONSTER_REF)
              ? null
              : { kind: 'monster', ref: MONSTER_REF }
          )
        }
      />

      <h2
        className="text-xs uppercase tracking-wide mb-2 mt-4 pb-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        Boss pin (the one exception)
      </h2>
      <Row
        color={BOSS_COLOR}
        short="BOSS"
        label="skeleton-captain"
        sub="boss.at — real schema, boss-room only"
        isSelected={isSel('boss', MONSTER_REF)}
        onClick={() =>
          onSelect(
            isSel('boss', MONSTER_REF)
              ? null
              : { kind: 'boss', ref: MONSTER_REF }
          )
        }
      />

      <h2
        className="text-xs uppercase tracking-wide mb-2 mt-4 pb-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        Read-only overlays
      </h2>
      {[
        {
          label: 'Door',
          border: '#ffb347',
          note: 'connector column @ door_row',
        },
        {
          label: 'Start / spawn',
          border: '#5fd1c9',
          note: 'FloorPlan.entrance',
        },
        {
          label: 'End / goal',
          border: '#c9a227',
          note: 'NOT schema-real — see CONTRACT.md',
        },
      ].map((o) => (
        <div
          key={o.label}
          className="flex items-center gap-2 px-2 py-1 text-xs"
          style={{ opacity: 0.9 }}
        >
          <span
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              border: `1.5px solid ${o.border}`,
              background: '#14110f',
            }}
          />
          <span>
            {o.label} <span style={{ color: '#6a6255' }}>— {o.note}</span>
          </span>
        </div>
      ))}
      <p
        style={{
          fontSize: 11,
          color: '#8a7a5a',
          padding: '4px 8px 10px',
          lineHeight: 1.4,
        }}
      >
        Door/start/end have no authorable coordinate in dungeonspec today —
        legend only, never placeable.
      </p>
    </aside>
  );
}
