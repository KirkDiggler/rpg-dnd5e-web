/**
 * ProposedYamlPane — the "New Dungeon" canvas's YAML, styled distinctly
 * from the real edit-mode pane (dashed violet border, hazard-style
 * banner) so it never gets mistaken for something dungeonspec accepts
 * today. As of the CST unification (CONTRACT.md), this is no longer a
 * hand-serialized approximation — it's the REAL `serializeDungeon(cst)`
 * text for creation mode's own document, editable and round-tripping
 * the same way edit mode's YamlPane is.
 *
 * **Capability-probed graduation (this unit, 2026-08-04)**: Save & Play
 * used to be PERMANENTLY disabled here, with a blanket "the server can't
 * compile this yet" tooltip — honest when creation mode's proposed
 * `walls:`/`start:`/`end:`/facing schema was 100% invented, but no longer
 * honest the moment the real server started accepting some of it for real
 * (`walls:`, bare `start:`, room-scoped floor-prop `facing` — see
 * `capabilityProbe.ts`). This pane now reuses the SAME
 * `SaveAndPlayButton`/`CompileBadgeStrip`/`CapabilitiesLine` components
 * edit mode's `YamlPane` uses, fed the SAME capability-aware
 * `stripToV1Subset` result computed in `DungeonBuilderConcept.tsx` — one
 * gating implementation, not two that could drift.
 *
 * **Why the button still reads disabled in practice, today**: this is
 * still a from-scratch CANVAS document (`doc.canvas` — `emptyCanvasDoc.ts`'s
 * own doc comment: "a from-scratch canvas has nothing... no fictional
 * room standing in for one"), and no server has shipped platform Wave 0
 * (rpg-project#192) yet — `canvas:` itself isn't accepted. `stripToV1Subset`'s
 * `compilableBlockers` says exactly that ("from-scratch canvas documents
 * aren't accepted by this server yet (platform Wave 0 — rpg-project#192)")
 * rather than dungeonspec's chain-mode `minRooms = 2`/"exactly one
 * boss-archetype room" rules — region-brush honesty round, 2026-08-06:
 * those rules are real, but they're validate.go's real minimums for a
 * `rooms:` CHAIN, a shape a canvas document doesn't have and can't be
 * made to have by adding a boss room (Kirk hit exactly this live: added
 * a boss region trying to satisfy "needs a boss," which could never
 * unblock a canvas doc since the server rejects `canvas:` before
 * validation ever reaches boss cardinality). An author who hand-types a
 * real `rooms:`/`connectors:` chain into this very pane instead of using
 * `canvas:` (it's a real, editable CST — see this doc comment's own
 * opening) is no longer canvas-mode and gets the chain-mode blockers
 * back, same as edit mode.
 */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import type { ServerCapabilities } from '../capabilityProbe';
import type { V1SubsetResult } from '../dungeonYaml';
import type { ServerState } from '../usePutDungeonPreview';
import type { SaveState } from '../useSaveDungeon';
import {
  CapabilitiesLine,
  CompileBadgeStrip,
  SaveAndPlayButton,
  SaveResultPanel,
} from '../YamlPane';

interface ProposedYamlPaneProps {
  yamlText: string;
  onChangeText: (text: string) => void;
  parseError: string | null;
  serverState: ServerState;
  capabilities: ServerCapabilities | null;
  onRefreshCapabilities: () => void;
  v1Subset: V1SubsetResult | null;
  onSaveAndPlay: () => void;
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
}

export function ProposedYamlPane({
  yamlText,
  onChangeText,
  parseError,
  serverState,
  capabilities,
  onRefreshCapabilities,
  v1Subset,
  onSaveAndPlay,
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
}: ProposedYamlPaneProps) {
  const dropped = v1Subset?.dropped ?? [];
  const compiling = v1Subset?.compiling ?? [];
  const compilable = v1Subset?.compilable ?? false;
  const compilableBlockers = v1Subset?.compilableBlockers ?? [];
  const hasDialectFields = dropped.length > 0;
  return (
    <aside
      style={{
        width: 420,
        flex: '0 0 420px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        borderLeft: '2px dashed #9b7fd6',
      }}
    >
      <div
        style={{
          padding: '8px 12px',
          background: '#241a33',
          borderBottom: '2px dashed #9b7fd6',
          color: '#c9aeff',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
        }}
      >
        Proposed schema — most of this dungeonspec cannot express yet
      </div>
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px dashed #4a3a63',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <CapabilitiesLine
          serverState={serverState}
          capabilities={capabilities}
          onRefresh={onRefreshCapabilities}
        />
        <CompileBadgeStrip dropped={dropped} compiling={compiling} />
        <SaveAndPlayButton
          serverState={serverState}
          saveState={saveState}
          v1Compilable={compilable}
          v1CompilableBlockers={compilableBlockers}
          dialectDropped={dropped}
          dialectCompiling={compiling}
          onSaveAndPlay={onSaveAndPlay}
        />
      </div>
      <textarea
        aria-label="Proposed schema (mostly invented, not real dungeonspec)"
        value={yamlText}
        onChange={(e) => onChangeText(e.target.value)}
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 0,
          resize: 'none',
          border: 'none',
          outline: 'none',
          background: '#170f22',
          color: '#d9c9f0',
          fontFamily: 'ui-monospace, Consolas, Menlo, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          padding: '10px 12px',
          whiteSpace: 'pre',
        }}
      />
      {parseError && (
        <div
          style={{
            padding: '6px 12px',
            background: '#3a1c18',
            color: '#ff9a8a',
            fontSize: 11,
            borderTop: '1px dashed #5a2a20',
          }}
        >
          {parseError}
        </div>
      )}
      <SaveResultPanel
        saveState={saveState}
        savedKey={savedKey}
        saveFieldErrors={saveFieldErrors}
        saveErrorMessage={saveErrorMessage}
        honestyNote={
          hasDialectFields
            ? `Saved the compilable subset — dropped: ${dropped.join(', ')}.${compiling.length > 0 ? ` Compiled for real: ${compiling.join(', ')}.` : ''} (see TARGET-YAML.md).`
            : undefined
        }
      />
    </aside>
  );
}
