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
 * **Why the button still reads disabled in practice, today**: creation
 * mode has no "declare a room" UI (`emptyCanvasDoc.ts`'s own doc comment
 * — `rooms: []` is the only shape this mode's board ever produces) and
 * dungeonspec's real `minRooms = 2` + "exactly one boss-archetype room"
 * requirements are unconditional, independent of which target-dialect
 * fields the server accepts (see `stripToV1Subset`'s own
 * `compilableBlockers`). So a from-scratch canvas is STILL genuinely
 * unsavable today — but the button now says so with the SPECIFIC real
 * reason ("needs at least 2 rooms (has 0)") instead of the old blanket
 * "proposed schema" claim, and an author who hand-types `rooms:`
 * declarations into this very pane (it's a real, editable CST — see
 * this doc comment's own opening) would see the button light up the
 * moment the document actually becomes compilable, same as edit mode.
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
