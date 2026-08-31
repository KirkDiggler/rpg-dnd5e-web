import type { SkinnedAccessoryStatus } from '@/components/hex-grid/SkinnedAccessoryAttachment';
import { CHARACTER_CUSTOMIZATION_BODY } from './characterCustomizationAssets';
import {
  deriveCustomizationEvidenceFromDiagnostics,
  type CharacterCustomizationDiagnostics,
} from './characterCustomizationDiagnostics';
import {
  type ActiveSurfacePreset,
  type CharacterCustomizationCoverage,
  type CharacterCustomizationFixture,
  type ResolvedCustomizationFixture,
  type StyleResolution,
} from './characterCustomizationExperiment';

function statusCode(
  resolution: StyleResolution,
  status: SkinnedAccessoryStatus | undefined
): string {
  if (resolution.code === 'unmapped') return 'unmapped';
  return status?.code ?? 'awaiting-render';
}

function resolvedStyleRef(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? resolution.styleRef
    : resolution.selection;
}

function resolvedUrl(resolution: StyleResolution): string {
  if (resolution.code === 'mapped') return resolution.asset.url;
  return resolution.code;
}

function resolvedSize(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? `${resolution.asset.byteSize.toLocaleString()} bytes`
    : resolution.code;
}

function resolvedHash(resolution: StyleResolution): string {
  return resolution.code === 'mapped'
    ? resolution.asset.sha256
    : resolution.code;
}

function attachedStatuses(
  diagnostics: CharacterCustomizationDiagnostics
): Extract<SkinnedAccessoryStatus, { code: 'attached' }>[] {
  return [diagnostics.scalpStatus, diagnostics.facialHairStatus].filter(
    (status): status is Extract<SkinnedAccessoryStatus, { code: 'attached' }> =>
      status?.code === 'attached'
  );
}

function missingBoneText(
  diagnostics: CharacterCustomizationDiagnostics,
  resolution: ResolvedCustomizationFixture
): string {
  if (
    resolution.scalp.code === 'unmapped' ||
    resolution.facialHair.code === 'unmapped'
  ) {
    return 'unknown until the unmapped ref is supplied by the provider';
  }
  const rejected = [
    diagnostics.scalpStatus,
    diagnostics.facialHairStatus,
  ].filter(
    (status): status is Extract<SkinnedAccessoryStatus, { code: 'rejected' }> =>
      status?.code === 'rejected'
  );
  if (rejected.length === 0) return 'none reported';
  return rejected.map((status) => status.message).join(' · ');
}

function ExactIdentityList({
  testId,
  label,
  values,
}: {
  readonly testId: string;
  readonly label: string;
  readonly values: readonly string[];
}) {
  if (values.length === 0) {
    return <dd data-testid={testId}>none reported</dd>;
  }
  const summary = `${values.length} unique · ${values.slice(0, 3).join(', ')}${
    values.length > 3 ? '…' : ''
  }`;
  return (
    <dd data-testid={testId}>
      <details>
        <summary>{summary}</summary>
        <p className="mt-1 font-mono text-xs break-all">
          <span className="sr-only">Exact {label}: </span>
          {values.join(', ')}
        </p>
      </details>
    </dd>
  );
}

function materialRows(
  statuses: readonly (SkinnedAccessoryStatus | undefined)[]
) {
  return statuses.flatMap((status) =>
    status?.code === 'attached'
      ? status.instanceMaterials.map((material) => ({
          slot: status.slot,
          styleRef: status.styleRef,
          ...material,
        }))
      : []
  );
}

export interface CharacterCustomizationInspectorProps {
  readonly fixture: CharacterCustomizationFixture;
  readonly surfacePreset: ActiveSurfacePreset;
  readonly resolution: ResolvedCustomizationFixture;
  readonly storedDiagnostics: CharacterCustomizationDiagnostics;
  readonly coverage: CharacterCustomizationCoverage;
  readonly canRecord: boolean;
  readonly verdictJson?: string;
  readonly onRecord: () => void;
}

export function CharacterCustomizationInspector({
  fixture,
  surfacePreset,
  resolution,
  storedDiagnostics,
  coverage,
  canRecord,
  verdictJson,
  onRecord,
}: CharacterCustomizationInspectorProps) {
  // Re-derive during this render so a new fixture can never be paired with a
  // status retained from the previous child effect.
  const diagnostics = deriveCustomizationEvidenceFromDiagnostics(
    fixture,
    surfacePreset,
    resolution,
    storedDiagnostics
  ).diagnostics;
  const attached = attachedStatuses(diagnostics);
  const mappedBoneNames = Array.from(
    new Set(attached.flatMap((status) => status.mappedBoneNames))
  );
  const mappedBoneUuids = Array.from(
    new Set(attached.flatMap((status) => status.mappedBoneUuids))
  );
  const controlledRoot = attached[0]?.bodyRootBoneUuid;
  const referenceRoot = [
    diagnostics.referenceScalpStatus,
    diagnostics.referenceFacialHairStatus,
  ].find((status) => status?.code === 'attached');
  const referenceRootUuid =
    referenceRoot?.code === 'attached'
      ? referenceRoot.bodyRootBoneUuid
      : undefined;
  const controlledMaterials = materialRows([
    diagnostics.scalpStatus,
    diagnostics.facialHairStatus,
  ]);
  const referenceMaterials = materialRows([
    diagnostics.referenceScalpStatus,
    diagnostics.referenceFacialHairStatus,
  ]);

  return (
    <aside
      className="space-y-4 rounded border p-4 text-sm"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      <div>
        <p className="text-xs font-bold tracking-wider text-amber-300">
          NON-PRODUCTION CONCEPT EVIDENCE
        </p>
        <h2 className="text-lg font-semibold">Contract inspector</h2>
      </div>
      <dl className="space-y-3 break-words">
        <div>
          <dt className="font-medium">Body URL</dt>
          <dd data-testid="body-url" className="font-mono text-xs">
            {CHARACTER_CUSTOMIZATION_BODY.url}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Body asset size</dt>
          <dd data-testid="body-size">
            {CHARACTER_CUSTOMIZATION_BODY.byteSize.toLocaleString()} bytes
          </dd>
        </div>
        <div>
          <dt className="font-medium">Body SHA-256</dt>
          <dd className="font-mono text-[0.68rem]">
            {CHARACTER_CUSTOMIZATION_BODY.sha256}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Scalp style ref</dt>
          <dd data-testid="scalp-style-ref" className="font-mono text-xs">
            {resolvedStyleRef(resolution.scalp)}
          </dd>
          <dt className="mt-1 font-medium">Scalp URL · size · hash</dt>
          <dd data-testid="scalp-url" className="font-mono text-xs">
            {resolvedUrl(resolution.scalp)}
          </dd>
          <dd className="text-xs">{resolvedSize(resolution.scalp)}</dd>
          <dd className="font-mono text-[0.68rem]">
            {resolvedHash(resolution.scalp)}
          </dd>
          <dt className="mt-1 font-medium">Scalp status</dt>
          <dd data-testid="scalp-status">
            {statusCode(resolution.scalp, diagnostics.scalpStatus)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Facial-hair style ref</dt>
          <dd className="font-mono text-xs">
            {resolvedStyleRef(resolution.facialHair)}
          </dd>
          <dt className="mt-1 font-medium">Facial-hair URL · size · hash</dt>
          <dd className="font-mono text-xs">
            {resolvedUrl(resolution.facialHair)}
          </dd>
          <dd className="text-xs">{resolvedSize(resolution.facialHair)}</dd>
          <dd className="font-mono text-[0.68rem]">
            {resolvedHash(resolution.facialHair)}
          </dd>
          <dt className="mt-1 font-medium">Facial-hair status</dt>
          <dd data-testid="facial-hair-status">
            {statusCode(resolution.facialHair, diagnostics.facialHairStatus)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Mapped bones</dt>
          <ExactIdentityList
            testId="mapped-bones"
            label="mapped bone names"
            values={mappedBoneNames}
          />
          <dt className="mt-1 font-medium">Missing bones</dt>
          <dd data-testid="missing-bones">
            {missingBoneText(diagnostics, resolution)}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Body root-bone identity</dt>
          <dd data-testid="body-root-identity" className="font-mono text-xs">
            controlled {controlledRoot ?? 'not exposed'} · reference{' '}
            {referenceRootUuid ?? 'not exposed'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Mapped bone identities</dt>
          <ExactIdentityList
            testId="mapped-bone-identities"
            label="mapped bone UUIDs"
            values={mappedBoneUuids}
          />
        </div>
        <div>
          <dt className="font-medium">Runtime material evidence</dt>
          <dd data-testid="material-evidence">
            <details>
              <summary>
                controlled {controlledMaterials.length} · reference{' '}
                {referenceMaterials.length} instance-owned material
                {controlledMaterials.length + referenceMaterials.length === 1
                  ? ''
                  : 's'}
              </summary>
              <pre
                className="mt-1 overflow-x-auto rounded border p-2 text-xs"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                {JSON.stringify(
                  {
                    controlled: controlledMaterials,
                    reference: referenceMaterials,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </dd>
        </div>
        <div>
          <dt className="font-medium">Mounted accessory armatures</dt>
          <dd data-testid="armature-count">
            {diagnostics.mountedAccessoryArmatures} · counted from terminal bind
            status and mapped body-bone identities, never URL success
          </dd>
        </div>
        <div>
          <dt className="font-medium">Exact attachment status</dt>
          <dd>
            <details>
              <summary>Attachment status JSON</summary>
              <pre
                data-testid="attachment-status-json"
                className="mt-1 overflow-x-auto rounded border p-2 text-xs"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                {JSON.stringify(
                  {
                    controlled: {
                      scalp: diagnostics.scalpStatus,
                      facialHair: diagnostics.facialHairStatus,
                    },
                    reference: {
                      scalp: diagnostics.referenceScalpStatus,
                      facialHair: diagnostics.referenceFacialHairStatus,
                    },
                    sceneCommitted: diagnostics.sceneCommitted,
                  },
                  null,
                  2
                )}
              </pre>
            </details>
          </dd>
        </div>
        <div>
          <dt className="font-medium">Reference twin</dt>
          <dd>
            scalp {diagnostics.referenceScalpStatus?.code ?? 'loading'} · facial{' '}
            {diagnostics.referenceFacialHairStatus?.code ?? 'loading'} ·
            isolation witness{' '}
            {diagnostics.referenceTwinIsolation ? 'positive' : 'pending'}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Animation / weapon</dt>
          <dd data-testid="animation-weapon-status">
            {fixture.motion === 'walk' ? 'Walk_Forward' : 'Idle_Relaxed'} ·{' '}
            {diagnostics.weaponStatus.code}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Coverage status</dt>
          <dd data-testid="coverage-status">
            {canRecord ? 'complete' : 'not complete'} · scalp{' '}
            {coverage.scalpSelections.length}/5 · facial{' '}
            {coverage.facialHairSelections.length}/5 · motion{' '}
            {coverage.motions.length}/2 · views {coverage.views.length}/3 ·
            presets {coverage.surfacePresets.length}/4 · alternate pair{' '}
            {coverage.simultaneousNonDefaultPair ? 'yes' : 'no'} · twin{' '}
            {coverage.referenceTwinIsolation ? 'yes' : 'no'}
          </dd>
        </div>
      </dl>

      <div>
        <h3 className="font-medium">Current fixture JSON</h3>
        <pre
          data-testid="fixture-json"
          className="mt-1 overflow-x-auto rounded border p-2 text-xs"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          {JSON.stringify(fixture, null, 2)}
        </pre>
      </div>

      <button
        type="button"
        disabled={!canRecord}
        onClick={onRecord}
        className="rounded border px-3 py-1.5 disabled:opacity-50"
        style={{ borderColor: 'var(--border-primary)' }}
      >
        Record Concept verdict
      </button>
      {verdictJson ? (
        <pre className="overflow-x-auto rounded border p-2 text-xs">
          {verdictJson}
        </pre>
      ) : null}
    </aside>
  );
}
