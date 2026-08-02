/**
 * CollapsibleSidePanel — Kirk's 2026-08-02 ask: the palette and the YAML
 * pane should both collapse (chevron/toggle) to give the board maximum
 * room, and the collapsed state should be remembered per mode (edit vs
 * creation don't share one collapse flag).
 *
 * A generic wrapper rather than a change baked into `Palette`/`YamlPane`/
 * `ProposedYamlPane` themselves: those components stay exactly as they
 * were (no new props, no risk of breaking their internal layout), and
 * this owns ONLY the outer width/flex slot in the parent's flex row plus
 * a small always-visible title bar carrying the expand/collapse control —
 * a fixed slot the wrapped content's own header can never overlap, unlike
 * an absolutely-positioned button floating over arbitrary child content.
 * Reused for four slots across the two modes: edit's `Palette`/`YamlPane`,
 * and creation's Tools+Palette sidebar / `ProposedYamlPane` (creation's
 * left column bundles more than just the palette, so there "the palette
 * collapsing" means that whole tool sidebar, not `<Palette>` in
 * isolation — same affordance, same component, wider bundle).
 *
 * State intentionally lives in each mode's OWN composition root
 * (`DungeonBuilderConcept`/passed into `CreationConcept`), not inside this
 * component or inside `Palette`/`YamlPane` — `DungeonBuilderConcept`
 * itself never unmounts when the edit/create tab flips (only the JSX
 * subtree it returns differs), so state kept there survives a tab switch,
 * while state kept inside `CreationConcept` would reset every time that
 * component unmounts on leaving 'create' mode. See
 * `DungeonBuilderConcept.tsx`'s four `useState` calls for the four
 * independent flags this produces.
 */
export interface CollapsibleSidePanelProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Which edge of the board this panel sits on — determines the
   * collapsed strip's chevron direction and which border it draws. */
  side: 'left' | 'right';
  width: number;
  label: string;
  children: React.ReactNode;
}

export function CollapsibleSidePanel({
  collapsed,
  onToggle,
  side,
  width,
  label,
  children,
}: CollapsibleSidePanelProps) {
  if (collapsed) {
    return (
      <div
        style={{
          width: 28,
          flex: '0 0 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          paddingTop: 8,
          borderLeft:
            side === 'right' ? '1px solid var(--border-primary)' : undefined,
          borderRight:
            side === 'left' ? '1px solid var(--border-primary)' : undefined,
          background: 'var(--bg-secondary)',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          title={`Expand ${label}`}
          aria-label={`Expand ${label}`}
          style={{
            background: 'none',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            width: 20,
            height: 20,
            fontSize: 11,
            lineHeight: 1,
          }}
        >
          {side === 'left' ? '»' : '«'}
        </button>
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 10,
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            color: '#8a7a5a',
          }}
        >
          {label}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        flex: `0 0 ${width}px`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 8px',
          borderBottom: '1px solid var(--border-primary)',
          background: 'var(--bg-secondary)',
          flex: '0 0 auto',
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            color: '#8a7a5a',
          }}
        >
          {label}
        </span>
        <button
          type="button"
          onClick={onToggle}
          title={`Collapse ${label}`}
          aria-label={`Collapse ${label}`}
          style={{
            background: 'none',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'pointer',
            width: 18,
            height: 18,
            fontSize: 10,
            lineHeight: 1,
          }}
        >
          {side === 'left' ? '«' : '»'}
        </button>
      </div>
      {/* row, not column: the wrapped Palette/YamlPane's own root sets
          `flex: '0 0 <width>px'` + `width: <width>` expecting to be a
          child of a ROW flex container (its original, unwrapped position
          in DungeonBuilderConcept's row layout) — a column here would
          reinterpret that flex-basis as a HEIGHT instead of a width, and
          the default row `align-items: stretch` is what makes the child
          fill this slot's full height with no extra prop needed. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
