/**
 * WallGashExplainer — honest non-affordance for the wall-band cells
 * between rooms (Kirk's 2026-08-02 ask: "I cannot set a wall or a door —
 * just realized the gashes are walls"). Clicking a wall cell no longer
 * does nothing (the previous no-op the brief flagged) — it opens this,
 * which says plainly why there's no placement handle here: `FloorPlan`
 * carries no wall/door edge geometry at all, only `door_row`/
 * `connector.column` to derive a legality rule from (CONTRACT.md's
 * wall-geometry-gap finding, now confirmed a FOURTH time by this exact
 * interaction — the author reached for a wall and found nothing). Points
 * at the one place walls ARE authorable today — the creation flow's
 * proposed, not-yet-real schema.
 */
interface WallGashExplainerProps {
  onClose: () => void;
  onPrototypeInCreation: () => void;
}

export function WallGashExplainer({
  onClose,
  onPrototypeInCreation,
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
        Walls here are DERIVED from room layout + connectors —{' '}
        <code>FloorPlan</code> carries no wall/door edge geometry to place or
        move. Authored walls (draw your own, place a door anywhere) are the
        creation flow's proposed schema — not something dungeonspec accepts
        today. See CONTRACT.md.
      </p>
      <button
        onClick={onPrototypeInCreation}
        style={{
          width: '100%',
          background: '#c9a227',
          color: '#14110f',
          border: 'none',
          borderRadius: 4,
          padding: 6,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: 6,
        }}
      >
        Prototype it in New Dungeon →
      </button>
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
