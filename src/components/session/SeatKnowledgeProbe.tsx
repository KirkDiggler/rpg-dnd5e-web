import type { CellKnowledge } from './cellKnowledge';

/**
 * A hidden, DOM-readable record of what this seat draws per cell (fog of war,
 * rpg-project#586), so a walk can assert lit vs remembered without reading
 * pixels out of the WebGL canvas. It renders the client's own derived state,
 * which is exactly what the scene draws from; it is not a second source.
 *
 * - `data-seen` / `data-remembered` / `data-edge`: cell counts.
 * - `data-seen-cells` / `data-remembered-cells`: cube keys (`x,y,z`), sorted,
 *   `;`-separated. An absent cell appears in neither list.
 */
export function SeatKnowledgeProbe({
  knowledge,
}: {
  knowledge: CellKnowledge;
}) {
  const seen: string[] = [];
  const remembered: string[] = [];
  for (const [key, state] of knowledge.state) {
    (state === 'seen' ? seen : remembered).push(key);
  }
  seen.sort();
  remembered.sort();
  return (
    <div
      hidden
      data-testid="seat-knowledge"
      data-seen={seen.length}
      data-remembered={remembered.length}
      data-edge={knowledge.edge.size}
      data-seen-cells={seen.join(';')}
      data-remembered-cells={remembered.join(';')}
    />
  );
}
