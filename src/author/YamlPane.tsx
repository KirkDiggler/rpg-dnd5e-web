/**
 * YamlPane — a set of small, presentational, doc-agnostic pieces shared
 * by the YAML-pane surface: server/capability badges, the compile-badge
 * strip, Save & Play, Download/Load YAML, and the spec-compat banner.
 * None of these import `DungeonDoc` themselves (CONTRACT.md's Operating
 * Bar "don't deep-couple" rule) — every prop here is plain data handed
 * down by whichever composition root mounts them.
 *
 * **Kirk look-feedback (2026-08-07, rpg-project#194): the edit-mode
 * `YamlPane` component itself (and its "Walk it" action) retired along
 * with the "Edit: The Shrine Hall" tab** — this file kept only the
 * sub-components `creation/ProposedYamlPane.tsx` (the surviving, sole
 * YAML pane) already reused: `CapabilitiesLine`, `CompileBadgeStrip`,
 * `SaveAndPlayButton`, `DownloadYamlButton`, `LoadYamlButton`,
 * `SpecCompatBanner`, `SaveResultPanel`. See CONTRACT.md's ledger entry
 * for the full removal.
 *
 * **Capability-probed graduation (2026-08-04)**: the compile badges and
 * Save & Play's enable/disable are TRUTH-DRIVEN — `capabilityProbe.ts`
 * probes the real server once per live connection, `stripToV1Subset`
 * reads the result, and every component below just renders whatever it's
 * handed — no field name is hardcoded in this file. `dialectCompiling` is
 * the positive half of that split: constructs present AND accepted, so
 * the badge strip can say "compiles now" instead of silently omitting
 * them. `capabilities`/`onRefreshCapabilities` drive the small "server
 * capabilities" readout beside the LIVE badge.
 *
 * **Local drafts + versioned save/load**: `DownloadYamlButton`/
 * `LoadYamlButton` never touch the server or `stripToV1Subset` — Kirk's
 * ruling, verbatim: "compatibility stripping should happen at load time
 * not save," so a downloaded/loaded file is always the complete authoring
 * dialect (`fileIO.ts`'s own doc comment has the full reasoning).
 * `SpecCompatBanner` renders the other half of "load time":
 * `specCompat.ts`'s spec-cut inference/mismatch, computed by the parent
 * and handed down as one plain-data prop. */
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useRef } from 'react';
import { capabilitySummary, type ServerCapabilities } from './capabilityProbe';
import { downloadYamlFile } from './fileIO';
import type { SpecCompatReport } from './specCompat';
import type { ServerState } from './usePutDungeonPreview';
import type { SaveState } from './useSaveDungeon';

/** The "server capabilities" readout beside the LIVE badge — the
 * capability-probed graduation unit's own honesty surface: what did THIS
 * server actually say yes to, today, not what this file assumes. Renders
 * nothing outside live mode (nothing to probe) or before the probe
 * completes at all (`capabilities === null` with `serverState === 'live'`
 * reads as mid-probe, not "zero capabilities" — a blank readout, not a
 * false "0/N"). Exported so `creation/ProposedYamlPane.tsx` can show the
 * same honest readout — the sole consumer since the edit-mode tab's own
 * retirement (2026-08-07, rpg-project#194). */
export function CapabilitiesLine({
  serverState,
  capabilities,
  onRefresh,
}: {
  serverState: ServerState;
  capabilities: ServerCapabilities | null;
  onRefresh: () => void;
}) {
  if (serverState !== 'live') return null;
  if (!capabilities) {
    return (
      <span style={{ fontSize: 10.5, color: '#8a7a5a' }}>
        probing server capabilities…
      </span>
    );
  }
  const { accepted, total } = capabilitySummary(capabilities);
  // Kirk look-feedback addendum (2026-08-07, rpg-project#194): "I am
  // being told the backend fully supports v0.3." Derived from the SAME
  // live probe result every field/badge above already reads, never a
  // hardcoded claim — the moment a server accepts fewer than all
  // DIALECT_FIELDS (an older deploy, a rolled-back server), this line
  // un-claims itself automatically, exactly as honest as the badges
  // beside it.
  const fullySupported = total > 0 && accepted === total;
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 10.5,
        color: '#8a7a5a',
      }}
    >
      server capabilities: accepts {accepted}/{total} dialect fields
      {fullySupported && ' · v0.3 cut: fully supported'}
      <button
        onClick={onRefresh}
        title="Re-run the per-field capability probe against this server"
        style={{
          fontSize: 10,
          background: 'none',
          border: '1px solid var(--border-primary)',
          color: '#8a7a5a',
          borderRadius: 3,
          padding: '0px 5px',
          cursor: 'pointer',
        }}
      >
        refresh
      </button>
    </span>
  );
}

/** The compile-badge summary, TARGET-YAML.md's "Compile badges" section:
 * per-feature, not per-line (the `yaml` CST doesn't cheaply give real
 * line/column spans without more plumbing than this honesty is worth).
 * Renders nothing for a document using no target-dialect construct at
 * all — the badge only appears the moment there's something real to say.
 *
 * Two halves, capability-probed graduation (this unit): `compiling`
 * (present AND accepted by the live server — a confirming, teal-toned
 * line) and `dropped` (present and NOT accepted — the original amber
 * "not yet compiled" line). A field flips from one to the other
 * automatically as `capabilities` changes; nothing here hardcodes which
 * field belongs in which bucket. Exported so `creation/ProposedYamlPane.tsx`
 * reuses the exact same badge rendering rather than a second copy. */
export function CompileBadgeStrip({
  dropped,
  compiling,
}: {
  dropped: string[];
  compiling: string[];
}) {
  if (dropped.length === 0 && compiling.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {compiling.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#8fe8b0',
            background: '#132018',
            border: '1px solid #2f5240',
            borderRadius: 4,
            padding: '5px 8px',
            lineHeight: 1.4,
          }}
        >
          Compiles on this server: {compiling.join(', ')}
        </div>
      )}
      {dropped.length > 0 && (
        <div
          style={{
            fontSize: 11,
            color: '#c9aeff',
            background: '#1c1526',
            border: '1px solid #3a2f52',
            borderRadius: 4,
            padding: '5px 8px',
            lineHeight: 1.4,
          }}
        >
          Uses: {dropped.join(', ')} — not yet accepted by this server
          (TARGET-YAML.md)
        </div>
      )}
    </div>
  );
}

/** The Save & Play button itself, capability-aware gating and all —
 * exported so `creation/ProposedYamlPane.tsx` gets the SAME real gating
 * the now-retired edit-mode `YamlPane` had, instead of duplicating the
 * disabled-state logic or (worse) keeping its own hardcoded "proposed
 * schema, can't compile" tooltip that a probed capability could make
 * false. `labelWhenPure` lets a caller keep its own label for the fully-v1
 * case (kept as a parameter rather than hardcoded so a future caller
 * isn't forced to match). */
export function SaveAndPlayButton({
  serverState,
  saveState,
  v1Compilable,
  v1CompilableBlockers,
  dialectDropped,
  dialectCompiling,
  onSaveAndPlay,
  labelWhenPure = 'Save & Play',
}: {
  serverState: ServerState;
  saveState: SaveState;
  v1Compilable: boolean;
  v1CompilableBlockers: string[];
  dialectDropped: string[];
  dialectCompiling: string[];
  onSaveAndPlay: () => void;
  labelWhenPure?: string;
}) {
  const hasDialectFields = dialectDropped.length > 0;
  const canSave =
    serverState === 'live' && saveState !== 'saving' && v1Compilable;
  return (
    <button
      onClick={() => onSaveAndPlay()}
      disabled={!canSave}
      title={
        serverState !== 'live'
          ? 'Server unreachable or authoring disabled — nothing to save to.'
          : !v1Compilable
            ? `Nothing compilable yet — ${v1CompilableBlockers.join('; ') || 'declare at least 2 rooms (dungeonspec.Validate requires it).'}`
            : hasDialectFields
              ? `Saves the v1-expressible SUBSET (validate_only: false). Dropped: ${dialectDropped.join(', ')}.${dialectCompiling.length > 0 ? ` Compiles: ${dialectCompiling.join(', ')}.` : ''}`
              : 'PutDungeon(validate_only: false) — persists this dungeon for real.'
      }
      style={{
        background: canSave ? '#5fd1c9' : 'var(--bg-secondary)',
        color: canSave ? '#14110f' : '#6a6255',
        border: canSave ? 'none' : '1px solid var(--border-primary)',
        borderRadius: 4,
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: canSave ? 'pointer' : 'not-allowed',
      }}
    >
      {saveState === 'saving'
        ? 'Saving…'
        : hasDialectFields
          ? 'Save the compilable subset'
          : labelWhenPure}
    </button>
  );
}

/** Downloads the CURRENT, full-fidelity dialect YAML text — never
 * stripped, no server round trip (`fileIO.ts`'s `downloadYamlFile`). See
 * this file's own doc comment for Kirk's "stripping happens at load, not
 * save" ruling this button exists to satisfy. */
export function DownloadYamlButton({
  yamlText,
  filename,
}: {
  yamlText: string;
  filename: string;
}) {
  return (
    <button
      onClick={() => downloadYamlFile(filename, yamlText)}
      title="Download the complete authoring-dialect YAML — never stripped, no server round trip."
      style={{
        background: 'transparent',
        color: '#8a7a5a',
        border: '1px solid var(--border-primary)',
        borderRadius: 4,
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      Download .yaml
    </button>
  );
}

/** Loads a `.yaml` file from disk into the SAME parse/Apply path the
 * Apply button and debounced typing already use (`onLoad`, wired by the
 * parent to `applyText`/`applyCreationText` directly — see
 * `DungeonBuilderConcept.tsx`'s `handleLoadYamlFile`) — no separate
 * pipeline, so a parse error surfaces exactly like Apply's already does.
 * A hidden file input behind a styled button, the standard pattern for a
 * button-triggered file picker. Resets its own value after each pick so
 * selecting the SAME file twice in a row still fires `onChange` (browsers
 * dedupe on unchanged `<input>` value otherwise). */
export function LoadYamlButton({
  onLoad,
  onLoadError,
}: {
  onLoad: (text: string) => void;
  /** Called when `File.text()` itself rejects (a real read failure — file
   * became inaccessible, permission revoked mid-pick, etc., NOT a YAML
   * parse error, which `onLoad`'s own `applyText`/`applyCreationText`
   * already catches and reports through `parseError`). Wired by the
   * parent to the SAME `parseError`/`creationParseError` state a bad
   * paste-and-Apply already surfaces through — one error affordance, not
   * a second, silent-except-for-the-console one. */
  onLoadError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => inputRef.current?.click()}
        title="Load a .yaml file — replaces the current document, same as pasting + Apply."
        style={{
          background: 'transparent',
          color: '#8a7a5a',
          border: '1px solid var(--border-primary)',
          borderRadius: 4,
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Load .yaml
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".yaml,.yml,text/yaml"
        aria-label="Load dungeon YAML file"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void file
            .text()
            .then(onLoad)
            .catch((err: unknown) => {
              onLoadError(
                err instanceof Error
                  ? `Could not read file: ${err.message}`
                  : 'Could not read the selected file.'
              );
            });
        }}
      />
    </>
  );
}

/** The load-time spec-compatibility report (`specCompat.ts`, local-drafts
 * unit) — Kirk's ask: "we could have 0.4 able to load in the concept page
 * and want to run the v0.3 version of it if possible. maybe we can check
 * compatibility." Renders ONLY the declared-vs-inferred spec CUT (a
 * document-structure fact, nothing to do with any live server) — the
 * OTHER half of that compatibility question, what the CONNECTED server
 * would actually drop from this document today, is `report.serverWouldDrop`
 * (reusing `stripToV1Subset`'s own `dropped` list verbatim, never
 * recomputed) and is already rendered by the pre-existing
 * `CompileBadgeStrip` right above this component in both `YamlPane`/
 * `ProposedYamlPane` — this component doesn't re-render that half, just
 * sits next to it. Renders nothing when there is truly nothing to say: no
 * `spec:` declared and the document is 0.3-clean — the same "only appear
 * when there's something real to report" discipline `CompileBadgeStrip`
 * itself follows. */
export function SpecCompatBanner({ report }: { report: SpecCompatReport }) {
  const { declaredSpec, inferredCut, inferredReasons, specMismatch } = report;
  const hasSpecLine =
    declaredSpec !== null || inferredCut === 'draft' || specMismatch;
  if (!hasSpecLine) return null;

  const specLine = specMismatch
    ? `spec: "${declaredSpec}" declared, but this document uses draft-only constructs: ${inferredReasons.join(', ')} — needs "draft", not "0.3".`
    : declaredSpec !== null
      ? `spec: "${declaredSpec}" — ${inferredCut === declaredSpec ? 'matches' : 'declared conservatively; inferred'} ${inferredCut === declaredSpec ? 'what this document actually uses.' : `"${inferredCut}" would also be accurate.`}`
      : inferredCut === 'draft'
        ? `No spec: declared — this document requires "draft" (uses: ${inferredReasons.join(', ')}).`
        : `No spec: declared — inferred "0.3" (only ratified constructs used).`;

  return (
    <div
      style={{
        fontSize: 11,
        color: specMismatch ? '#ff9a8a' : '#8fc9e8',
        background: specMismatch ? '#2a1512' : '#101f26',
        border: `1px solid ${specMismatch ? '#5a2a20' : '#2a4a5a'}`,
        borderRadius: 4,
        padding: '5px 8px',
        lineHeight: 1.4,
      }}
    >
      {specMismatch ? '⚠ ' : ''}
      {specLine}
    </div>
  );
}

/** Shared by both Save & Play and Walk it — `honestyNote`, when given, is
 * appended to the success message (Walk it's one real caveat: the boss
 * pin survives). */
export function SaveResultPanel({
  saveState,
  savedKey,
  saveFieldErrors,
  saveErrorMessage,
  honestyNote,
}: {
  saveState: SaveState;
  savedKey: string | null;
  saveFieldErrors: ValidationError[];
  saveErrorMessage: string | null;
  honestyNote?: string;
}) {
  if (saveState === 'saved') {
    return (
      <div
        style={{
          background: '#16261c',
          borderTop: '1px solid #3a5a45',
          color: '#8fe8b0',
          fontSize: 12,
          padding: '8px 12px',
          lineHeight: 1.5,
        }}
      >
        <strong>Saved as "{savedKey}".</strong> Open{' '}
        <a
          href="http://localhost:3001/"
          target="_blank"
          rel="noreferrer"
          style={{ color: '#5fd1c9' }}
        >
          http://localhost:3001/
        </a>{' '}
        and pick "{savedKey}" in the dungeon dropdown to play it.
        {honestyNote && (
          <div style={{ color: '#ffb347', marginTop: 4 }}>{honestyNote}</div>
        )}
      </div>
    );
  }
  if (saveState === 'invalid') {
    return (
      <div
        style={{
          background: '#2a1512',
          borderTop: '1px solid #5a2a20',
          color: '#ff9a8a',
          fontSize: 11.5,
          padding: '8px 12px',
        }}
      >
        <strong>Save rejected — dungeonspec.Validate failed:</strong>
        {saveFieldErrors.map((e, i) => (
          <div key={i}>{e.message}</div>
        ))}
      </div>
    );
  }
  if (saveState === 'error') {
    return (
      <div
        style={{
          background: '#2a1512',
          borderTop: '1px solid #5a2a20',
          color: '#ff9a8a',
          fontSize: 11.5,
          padding: '8px 12px',
        }}
      >
        Save failed: {saveErrorMessage}
      </div>
    );
  }
  return null;
}
