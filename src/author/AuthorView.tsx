/**
 * AuthorView — the Dungeon Builder's real, in-game home (`/author`
 * AppView, rpg-project#194). Mounts the SAME `DungeonBuilderConcept`
 * component tree the Concepts Lab dev sandbox mounts
 * (`concepts/ConceptsView.tsx`) — one component tree, two mounts, per the
 * graduation's own rule. This is the LIVE mount: no `forceFixtures`, so
 * `usePutDungeonPreview`'s own mount-time probe decides live-vs-fixtures
 * against whatever server this build actually talks to, exactly as it
 * always has.
 *
 * The button that routes here (`DungeonBuilderHomeButton.tsx`, mounted on
 * Home) is gated by its own separate probe (`useAuthoringGate.ts`) so a
 * deployed build with authoring off server-side never shows a way in at
 * all — this component doesn't re-check that gate itself; by the time
 * it's mounted, the gate has already said yes.
 */
import { DungeonBuilderConcept } from './DungeonBuilderConcept';

interface AuthorViewProps {
  onBack: () => void;
}

export function AuthorView({ onBack }: AuthorViewProps) {
  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="px-3 py-1.5 rounded text-sm"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-primary)',
          }}
        >
          Back
        </button>
        <h1
          className="text-3xl font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          Dungeon Builder
        </h1>
      </div>
      <DungeonBuilderConcept />
    </div>
  );
}
