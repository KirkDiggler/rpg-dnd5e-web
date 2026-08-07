/**
 * RolledContentPanel — off-board list of count-based `obstacles:` entries
 * (rolled at a seed, no [col,row] until then, so they never appear on the
 * board). showcase.yaml itself has zero of these, so the non-empty path
 * below was implemented but genuinely untested against real content —
 * closed by a synthetic obstacles: fixture (dungeonYaml.test.ts's "parses
 * room-level obstacles:" test, same synthetic-injection convention as the
 * monster-flag test beside it) plus a live verification pasting that same
 * synthetic YAML through "Apply YAML → Board"; see CONTRACT.md.
 */
import type { DungeonDoc } from './dungeonYaml';

export function RolledContentPanel({ doc }: { doc: DungeonDoc }) {
  const items = doc.rooms.flatMap((room) =>
    room.obstacles.map((o) => ({ room: room.id, ...o }))
  );

  return (
    <div
      style={{
        borderTop: '1px solid var(--border-primary)',
        padding: '8px 16px',
        maxHeight: 110,
        overflowY: 'auto',
      }}
    >
      <h3
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '.05em',
          color: 'var(--text-secondary, #8a7a5a)',
          margin: '0 0 4px',
        }}
      >
        Rolled content (off-board — count-based obstacles:, no coordinates until
        a seed rolls them)
      </h3>
      {items.length === 0 ? (
        <div style={{ color: '#6a6255', fontSize: 12, fontStyle: 'italic' }}>
          showcase.yaml has none — this panel parses a room-level{' '}
          <code>obstacles: [{'{ref, count}'}]</code> block if present, but that
          path is unexercised here.
        </div>
      ) : (
        items.map((it, i) => (
          <div key={i} style={{ fontSize: 12, color: '#ffb347' }}>
            {it.room}: {it.ref} ×{it.count}
          </div>
        ))
      )}
    </div>
  );
}
