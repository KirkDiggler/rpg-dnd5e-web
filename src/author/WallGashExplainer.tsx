/**
 * WallGashExplainer — the NO-TOOL-SELECTED fallback for a wall-band cell
 * click (Kirk's 2026-08-02 ask: "I cannot set a wall or a door — just
 * realized the gashes are walls"). Superseded by real authoring the
 * moment a Structural tool is active — `Board.tsx`'s click handler checks
 * `selectedTool` FIRST and only falls through to this when nothing is
 * armed. This is the honest "here's why nothing happened, and here's
 * where to go" for that one remaining case, not a permanent dead end:
 * Kirk's follow-up correction (2026-08-02, same day) was explicit that
 * this must NOT say "go prototype in New Dungeon" anymore — walls are
 * now authorable in THIS view too, via the Structural palette category,
 * so the explainer points there instead of bouncing to a different tab.
 * See TARGET-YAML.md's "Structural palette category" section.
 *
 * **Copy is now conditional on `serverEdgesActive`** (rpg-project#169's
 * wire-edges unit, 2026-08-04) — the ORIGINAL "FloorPlan carries no
 * wall/door edge geometry on the wire" claim stopped being universally
 * true the moment rpg-api-protos v0.1.118 (rpg-api#767) shipped
 * `FloorPlan.edges`. For a response that carries them, this cell's own
 * REAL wall/door line is already drawn on top of it (`Board.tsx`'s
 * server-edges overlay) — the explainer says so, instead of repeating a
 * now-false blanket claim, while still pointing at Structural for
 * AUTHORING an additional target-dialect wall (walls: is still not
 * compiled server-side either way — only the "does the wire carry
 * anything at all" half of the old copy was wrong). */
interface WallGashExplainerProps {
  onClose: () => void;
  /** Whether the `FloorPlan` this click landed on carries real
   * `edges` — `edgesAdapter.ts`'s `hasServerEdges`. */
  serverEdgesActive: boolean;
}

export function WallGashExplainer({
  onClose,
  serverEdgesActive,
}: WallGashExplainerProps) {
  return (
    <div
      role="dialog"
      aria-label="Wall explainer"
      style={{
        position: 'fixed',
        right: 434,
        bottom: 18,
        width: 280,
        background: '#221d19',
        border: '1px solid #6a6255',
        borderRadius: 8,
        padding: 12,
        boxShadow: '0 6px 24px rgba(0,0,0,.5)',
        zIndex: 20,
        fontSize: 12,
        color: '#e8e2d8',
      }}
    >
      <h4 style={{ margin: '0 0 6px', fontSize: 13, color: '#c9bfae' }}>
        This is a wall
      </h4>
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 11.5,
          color: '#a89e90',
          lineHeight: 1.5,
        }}
      >
        {serverEdgesActive ? (
          <>
            This response carries real generated wall/door geometry (
            <code>FloorPlan.edges</code>) — the confident line drawn over this
            cell already IS the compiled wall. Click the line itself (a door
            line opens its connector) rather than this cell for the real thing.
          </>
        ) : (
          <>
            Walls here are normally DERIVED from room layout + connectors — this
            response's <code>FloorPlan</code> carries no wall/door edge geometry
            on the wire.
          </>
        )}{' '}
        You CAN author your own here, though: open the{' '}
        <strong style={{ color: '#c9aeff' }}>Structural</strong> category in the
        palette and select <strong>Wall</strong> (or <strong>Door</strong>, to
        flip an existing one), then click this cell again. It's target dialect,
        proposed — badged "not yet compiled server-side" until dungeonspec
        accepts authored wall geometry. See TARGET-YAML.md.
      </p>
      <button
        onClick={onClose}
        style={{
          width: '100%',
          background: 'transparent',
          color: 'var(--text-secondary, #8a7a5a)',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: 6,
          cursor: 'pointer',
        }}
      >
        Close
      </button>
    </div>
  );
}
