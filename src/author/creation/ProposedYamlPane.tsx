/**
 * ProposedYamlPane — the Dungeon Builder's YAML pane. The name (and the
 * component's own history) predates the ratified spec: it was styled
 * distinctly from the old edit-mode pane (dashed violet border,
 * hazard-style "proposed schema" banner) back when creation mode's
 * `walls:`/`start:`/`end:`/facing schema was invented ahead of any server
 * support at all. That framing retired 2026-08-07 (rpg-project#194) —
 * Kirk: "I am being told the backend fully supports v0.3," verified live
 * the same day (the dev-tip server accepts + projects `regions:`;
 * `canvas`/`topLevelPlace`/`walls`/`start`/facing were already accepted).
 * This is the REAL `serializeDungeon(cst)` text for creation mode's own
 * document, editable and round-tripping like any other YAML pane; nothing
 * about it is invented or provisional anymore. (The `ProposedYamlPane`
 * name itself is left as-is — a rename is a bigger, unrequested move than
 * the copy/styling fix this round asked for.)
 *
 * **Capability-probed graduation (2026-08-04)**: Save & Play's enable/
 * disable is TRUTH-DRIVEN, not a hardcoded claim — it reuses the SAME
 * `SaveAndPlayButton`/`CompileBadgeStrip`/`CapabilitiesLine` components
 * the (now-retired) edit-mode `YamlPane` used, fed the SAME
 * capability-aware `stripToV1Subset` result computed in
 * `DungeonBuilderConcept.tsx` — one gating implementation, not two that
 * could drift. `CapabilitiesLine` self-reports "v0.3 cut: fully
 * supported" the moment the live probe itself says every dialect field is
 * accepted, and un-claims itself automatically against any server where
 * that isn't (yet, or anymore) true — never a claim this file hardcodes.
 *
 * A hand-typed real `rooms:`/`connectors:` chain in this pane (it's a
 * real, editable CST — see above) is no longer canvas-mode and is gated
 * by dungeonspec's own chain-mode rules instead, same as it always was.
 */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import type { ServerCapabilities } from '../capabilityProbe';
import type { V1SubsetResult } from '../dungeonYaml';
import type { SpecCompatReport } from '../specCompat';
import type { ServerState } from '../usePutDungeonPreview';
import type { SaveState } from '../useSaveDungeon';
import {
  CapabilitiesLine,
  CompileBadgeStrip,
  DownloadYamlButton,
  LoadYamlButton,
  SaveAndPlayButton,
  SaveResultPanel,
  SpecCompatBanner,
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
  /** Local drafts + versioned save/load (this unit) — see
   * `YamlPane.tsx`'s own doc comment on these props; same shape, reused
   * directly rather than re-specified. */
  downloadFilename: string;
  onLoadFile: (text: string) => void;
  onLoadFileError: (message: string) => void;
  allowYamlFileIO: boolean;
  showSaveResultLink: boolean;
  specCompat: SpecCompatReport;
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
  downloadFilename,
  onLoadFile,
  onLoadFileError,
  allowYamlFileIO,
  showSaveResultLink,
  specCompat,
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
        borderLeft: '1px solid var(--border-primary)',
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {allowYamlFileIO && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <DownloadYamlButton
              yamlText={yamlText}
              filename={downloadFilename}
            />
            <LoadYamlButton onLoad={onLoadFile} onLoadError={onLoadFileError} />
          </div>
        )}
        <CapabilitiesLine
          serverState={serverState}
          capabilities={capabilities}
          onRefresh={onRefreshCapabilities}
        />
        <CompileBadgeStrip dropped={dropped} compiling={compiling} />
        <SpecCompatBanner report={specCompat} />
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
        aria-label="Dungeon YAML"
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
            borderTop: '1px solid #5a2a20',
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
        showLobbyLink={showSaveResultLink}
        honestyNote={
          hasDialectFields
            ? `Saved the compilable subset — dropped: ${dropped.join(', ')}.${compiling.length > 0 ? ` Compiled for real: ${compiling.join(', ')}.` : ''} (see TARGET-YAML.md).`
            : undefined
        }
      />
    </aside>
  );
}
