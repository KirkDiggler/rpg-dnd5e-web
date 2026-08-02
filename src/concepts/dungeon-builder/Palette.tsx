/**
 * Palette — prop/monster refs drawn from showcase.yaml's own vocabulary
 * via `paletteData.ts` (sourced from the real `propManifest.ts`), grouped
 * into four categorized dropdowns per Kirk's 2026-08-01 ask (see
 * CONTRACT.md's "Palette taxonomy" section): Monsters / Obstacles & Props
 * / Lighting / Markers. Rows show a pre-baked thumbnail when one exists
 * (`paletteData.ts`'s `thumbForRef`), falling back to the original
 * colored-swatch+short-label rendering otherwise — never a broken image.
 * Markers (door/start/end) stay read-only: connectors are `{from, to}`,
 * doors sit at the derived door_row, and the entrance is generator-chosen
 * — none of which is an authorable coordinate (design.md's
 * palette-honesty note).
 */
import { useState } from 'react';
import {
  BOSS_COLOR,
  categoryForProp,
  MONSTER_COLOR,
  MONSTER_REF,
  PALETTE_PROPS,
  ROLE_COLOR,
  thumbForRef,
  type PaletteCategory,
} from './paletteData';
import type { PaletteSelection } from './types';

interface PaletteProps {
  selected: PaletteSelection | null;
  onSelect: (sel: PaletteSelection | null) => void;
  usageCounts: Record<string, number>;
}

const CATEGORY_LABELS: Record<PaletteCategory, string> = {
  monsters: 'Monsters',
  'obstacles-props': 'Obstacles & Props',
  lighting: 'Lighting',
  markers: 'Markers',
};

function Row({
  thumb,
  color,
  short,
  label,
  sub,
  isSelected,
  onClick,
}: {
  thumb?: string;
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
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="shrink-0"
          style={{
            width: 28,
            height: 28,
            objectFit: 'cover',
            borderRadius: 4,
            background: '#14110f',
            border: '1px solid #2a2521',
          }}
        />
      ) : (
        <span
          className="flex items-center justify-center rounded font-bold shrink-0"
          style={{
            width: 28,
            height: 28,
            background: color,
            color: '#14110f',
            fontSize: 9,
          }}
        >
          {short}
        </span>
      )}
      <span className="flex-1">
        {label}
        <div style={{ fontSize: 10, color: 'var(--text-secondary, #8a7a5a)' }}>
          {sub}
        </div>
      </span>
    </div>
  );
}

/**
 * CategorySection — an expandable/collapsible section, not a dropdown.
 * Kirk's 2026-08-02 feedback: the first pass (an isolated fully-rounded
 * pill header with a tiny far-right ▸/▾) read as a select-style dropdown
 * trigger rather than a section that expands in place. Fixed by making
 * header+content share ONE bordered container (so opening it visibly
 * grows that same box downward, instead of revealing an unrelated list
 * below an isolated button) and moving a bigger, rotating chevron to the
 * LEFT of the label — the conventional expand/collapse position (file
 * trees, most accordions) — instead of a trailing symbol easy to miss.
 * Independent per-section `open` state (a `Set` in the parent, not a
 * single-select index) means multiple sections can be open at once.
 */
function CategorySection({
  category,
  count,
  open,
  onToggle,
  children,
}: {
  category: PaletteCategory;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        marginBottom: 6,
        border: '1px solid var(--border-primary)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-xs uppercase tracking-wide"
        style={{
          padding: '7px 10px',
          background: open ? '#241d14' : 'var(--bg-secondary)',
          border: 'none',
          borderBottom: open ? '1px solid var(--border-primary)' : 'none',
          cursor: 'pointer',
          color: 'var(--text-primary)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            fontSize: 9,
            color: '#c9a227',
            transition: 'transform 120ms ease',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          }}
        >
          ▶
        </span>
        <span>{CATEGORY_LABELS[category]}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8a7a5a' }}>
          {count}
        </span>
      </button>
      {open && <div style={{ padding: '7px 7px 9px' }}>{children}</div>}
    </div>
  );
}

export function Palette({ selected, onSelect, usageCounts }: PaletteProps) {
  const [openCategories, setOpenCategories] = useState<Set<PaletteCategory>>(
    new Set<PaletteCategory>(['obstacles-props'])
  );
  const toggle = (category: PaletteCategory) =>
    setOpenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });

  const isSel = (kind: PaletteSelection['kind'], ref: string) =>
    !!selected && selected.kind === kind && selected.ref === ref;

  const obstaclesProps = PALETTE_PROPS.filter(
    (p) => categoryForProp(p.ref) === 'obstacles-props'
  );
  const lightingProps = PALETTE_PROPS.filter(
    (p) => categoryForProp(p.ref) === 'lighting'
  );
  const monsterThumb = thumbForRef(MONSTER_REF);

  return (
    <aside
      style={{ width: 250, flex: '0 0 250px', overflowY: 'auto', padding: 10 }}
    >
      <h2
        className="text-xs uppercase tracking-wide mb-2 pb-1"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        Palette
      </h2>

      <CategorySection
        category="monsters"
        count={2}
        open={openCategories.has('monsters')}
        onToggle={() => toggle('monsters')}
      >
        <Row
          thumb={monsterThumb}
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
        <Row
          thumb={monsterThumb}
          color={BOSS_COLOR}
          short="BOSS"
          label="skeleton-captain (boss pin)"
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
      </CategorySection>

      <CategorySection
        category="obstacles-props"
        count={obstaclesProps.length}
        open={openCategories.has('obstacles-props')}
        onToggle={() => toggle('obstacles-props')}
      >
        {obstaclesProps.map((p) => (
          <Row
            key={p.ref}
            thumb={thumbForRef(p.ref)}
            color={ROLE_COLOR[p.role]}
            short={p.short}
            label={p.ref.split(':').pop() ?? p.ref}
            sub={`${usageCounts[p.ref] ?? 0}× used · ${p.role}`}
            isSelected={isSel('prop', p.ref)}
            onClick={() =>
              onSelect(
                isSel('prop', p.ref) ? null : { kind: 'prop', ref: p.ref }
              )
            }
          />
        ))}
      </CategorySection>

      <CategorySection
        category="lighting"
        count={lightingProps.length}
        open={openCategories.has('lighting')}
        onToggle={() => toggle('lighting')}
      >
        {lightingProps.map((p) => (
          <Row
            key={p.ref}
            thumb={thumbForRef(p.ref)}
            color={ROLE_COLOR[p.role]}
            short={p.short}
            label={p.ref.split(':').pop() ?? p.ref}
            sub={`${usageCounts[p.ref] ?? 0}× used · light-emitting`}
            isSelected={isSel('prop', p.ref)}
            onClick={() =>
              onSelect(
                isSel('prop', p.ref) ? null : { kind: 'prop', ref: p.ref }
              )
            }
          />
        ))}
      </CategorySection>

      <CategorySection
        category="markers"
        count={3}
        open={openCategories.has('markers')}
        onToggle={() => toggle('markers')}
      >
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
            padding: '4px 8px 2px',
            lineHeight: 1.4,
          }}
        >
          Door/start/end have no authorable coordinate in dungeonspec today —
          legend only, never placeable.
        </p>
      </CategorySection>
    </aside>
  );
}
