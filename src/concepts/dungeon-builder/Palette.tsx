/**
 * Palette — prop/monster refs drawn from showcase.yaml's own vocabulary
 * via `paletteData.ts` (sourced from the real `propManifest.ts`), grouped
 * into five categorized dropdowns: Monsters / Obstacles & Props / Lighting
 * (Kirk's 2026-08-01 ask, CONTRACT.md's "Palette taxonomy" section) /
 * Structural / Markers (Kirk's 2026-08-02 target-dialect reframe —
 * TARGET-YAML.md). Rows show a pre-baked thumbnail when one exists
 * (`paletteData.ts`'s `thumbForRef`), falling back to the original
 * colored-swatch+short-label rendering otherwise — never a broken image.
 *
 * Structural (Wall/Door/Hole) and Markers' Start/End are TOOLS, not
 * draggable placement items — selecting one arms a `BoardTool` (see
 * `types.ts`) that governs what a board click does, distinct from
 * `PaletteSelection`'s "place this ref" model. All five are target-dialect,
 * proposed — not yet compiled server-side, see TARGET-YAML.md. Markers' Door entry
 * moved OUT to Structural (Kirk: "they were Markers-adjacent before") —
 * the real, v1 connector door (position derived, `locked:` the only
 * authorable field) is edited via `ConnectorInspector`, reached by
 * clicking the board's own door cell directly, not through the palette.
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
import type { BoardTool, PaletteSelection } from './types';

interface PaletteProps {
  selected: PaletteSelection | null;
  onSelect: (sel: PaletteSelection | null) => void;
  usageCounts: Record<string, number>;
  selectedTool: BoardTool | null;
  onSelectTool: (tool: BoardTool | null) => void;
  wallCount: number;
  holeCount: number;
  /** Region tool (rpg-project#180) — creation-mode-only this round
   * (TARGET-YAML.md's "regions:" section: "creation-mode is the author
   * surface this round"). `false`/omitted hides the row entirely rather
   * than showing an inert tool — edit mode still RENDERS any authored
   * regions read-only (`Board.tsx`), it just doesn't offer a way to
   * create/edit them yet. */
  showRegionTool?: boolean;
  regionCount?: number;
}

const CATEGORY_LABELS: Record<PaletteCategory, string> = {
  monsters: 'Monsters',
  'obstacles-props': 'Obstacles & Props',
  lighting: 'Lighting',
  structural: 'Structural',
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
  notCompiled,
  deferred,
}: {
  thumb?: string;
  color: string;
  short: string;
  label: string;
  sub: string;
  isSelected: boolean;
  onClick: () => void;
  /** target-dialect-only tool/construct — shows the same "not yet
   * compiled server-side" badge language TARGET-YAML.md standardizes on. */
  notCompiled?: boolean;
  /** Stronger disclaimer than `notCompiled` — the Hole tool specifically
   * (TARGET-YAML.md's "Settled early model" section, rpg-project#175,
   * Kirk's own verbatim text): not merely "proposed, not yet compiled"
   * like Wall/Door, but deliberately deferred from the early dialect
   * entirely, an exploration artifact rather than a commitment. Renders
   * INSTEAD of the `notCompiled` badge when both would apply — the
   * deferred status already implies "not yet compiled," a stronger claim
   * subsumes a weaker one, no reason to show both. Tool stays usable
   * either way (Kirk: "tool stays usable") — this is a status badge, not
   * a disabled state. */
  deferred?: boolean;
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
      {deferred ? (
        <span
          title={
            'Deliberately deferred from this early dialect. A collapsed-' +
            'looking blocked cell is authored and rendered as an ' +
            'obstacle/prop until falling, bridging, or vertical ' +
            'visibility/traversal establishes a real no-floor primitive. ' +
            'The concept’s existing Hole prototype remains visible as ' +
            'an exploration artifact; it is not a commitment for the ' +
            'early dialect. — Kirk, rpg-project#175, TARGET-YAML.md'
          }
          style={{
            fontSize: 9,
            color: '#b8a888',
            background: '#2a2521',
            border: '1px solid #4a4238',
            borderRadius: 3,
            padding: '2px 5px',
            whiteSpace: 'nowrap',
          }}
        >
          exploration
        </span>
      ) : (
        notCompiled && (
          <span
            title="target dialect, proposed — not yet compiled server-side (TARGET-YAML.md)"
            style={{
              fontSize: 9,
              color: '#c9aeff',
              background: '#241a33',
              border: '1px solid #4a3a63',
              borderRadius: 3,
              padding: '2px 5px',
              whiteSpace: 'nowrap',
            }}
          >
            dialect
          </span>
        )
      )}
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

export function Palette({
  selected,
  onSelect,
  usageCounts,
  selectedTool,
  onSelectTool,
  wallCount,
  holeCount,
  showRegionTool = false,
  regionCount = 0,
}: PaletteProps) {
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

  const toggleTool = (tool: BoardTool) =>
    onSelectTool(selectedTool === tool ? null : tool);

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
        category="structural"
        count={showRegionTool ? 4 : 3}
        open={openCategories.has('structural')}
        onToggle={() => toggle('structural')}
      >
        <Row
          color="#6a6255"
          short="W"
          label="Wall"
          sub={`${wallCount}× drawn — click a wall cell to add/remove`}
          isSelected={selectedTool === 'wall'}
          onClick={() => toggleTool('wall')}
          notCompiled
        />
        <Row
          color="#9b7fd6"
          short="D"
          label="Door (on a drawn wall)"
          sub="click an existing wall to flip solid ↔ door"
          isSelected={selectedTool === 'door'}
          onClick={() => toggleTool('door')}
          notCompiled
        />
        <Row
          color="#14110f"
          short="H"
          label="Hole"
          sub={`${holeCount}× marked — impassable void, no floor`}
          isSelected={selectedTool === 'hole'}
          onClick={() => toggleTool('hole')}
          deferred
        />
        {showRegionTool && (
          <Row
            color="#3a9b6a"
            short="R"
            label="Region"
            sub={`${regionCount}× drawn — paint cells, then name + connect (rpg-project#180)`}
            isSelected={selectedTool === 'region'}
            onClick={() => toggleTool('region')}
            notCompiled
          />
        )}
        <p
          style={{
            fontSize: 11,
            color: '#8a7a5a',
            padding: '4px 8px 2px',
            lineHeight: 1.4,
          }}
        >
          Structural is target dialect, proposed — TARGET-YAML.md. The real
          connector door (locked/DC) lives on the board's own door cell, not
          here — this "Door" is a door on a drawn wall, a different thing.
        </p>
      </CategorySection>

      <CategorySection
        category="markers"
        count={2}
        open={openCategories.has('markers')}
        onToggle={() => toggle('markers')}
      >
        <Row
          color="#5fd1c9"
          short="ST"
          label="Start / spawn"
          sub="author-placed — in tension with FloorPlan.entrance, see TARGET-YAML.md"
          isSelected={selectedTool === 'start'}
          onClick={() => toggleTool('start')}
          notCompiled
        />
        <Row
          color="#c9a227"
          short="EN"
          label="End / goal"
          sub="no analog anywhere in the compiled FloorPlan today"
          isSelected={selectedTool === 'end'}
          onClick={() => toggleTool('end')}
          notCompiled
        />
        <p
          style={{
            fontSize: 11,
            color: '#8a7a5a',
            padding: '4px 8px 2px',
            lineHeight: 1.4,
          }}
        >
          Select a tool, then click a cell to place/clear it. Click again on the
          same cell to clear.
        </p>
      </CategorySection>
    </aside>
  );
}
