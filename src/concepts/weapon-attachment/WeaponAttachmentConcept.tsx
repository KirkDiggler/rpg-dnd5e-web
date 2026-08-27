import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import {
  CURRENT_MAIN_HAND_WEAPONS,
  TOWNFOLK_MAIN_HAND_SOCKET,
} from '@/components/hex-grid/mainHandWeapons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { WeaponAttachmentPreview } from './WeaponAttachmentPreview';
import {
  WEAPON_ATTACHMENT_FIXTURES,
  canRecordWeaponVerdict,
  coverageFor,
  formatTextureBudget,
  resolveProvisionalMainHand,
  weaponConceptVerdict,
  type WeaponClassId,
  type WeaponEquipmentState,
  type WeaponFacing,
  type WeaponMotion,
  type WeaponRenderObservation,
  type WeaponView,
} from './weaponAttachmentExperiment';

const CLASS_VALUES = [
  'fighter',
  'barbarian',
  'monk',
  'rogue',
] as const satisfies readonly WeaponClassId[];
const EQUIPMENT_VALUES: readonly WeaponEquipmentState[] = [
  'unarmed',
  ...CURRENT_MAIN_HAND_WEAPONS.map((weapon) => weapon.id),
];
const MOTION_VALUES = ['idle', 'walk'] as const;
const VIEW_VALUES = ['close', 'orbit', 'play'] as const;
const FACING_VALUES = [
  0, 1, 2, 3, 4, 5,
] as const satisfies readonly WeaponFacing[];

const formatTuple = (values: readonly number[]) =>
  `[${values.map((value) => value.toFixed(6)).join(', ')}]`;

const SOCKET_PROFILE = `${TOWNFOLK_MAIN_HAND_SOCKET.bone} · bone units ${TOWNFOLK_MAIN_HAND_SOCKET.boneUnitMeters}m · pos ${formatTuple(TOWNFOLK_MAIN_HAND_SOCKET.positionMeters)} · quat ${formatTuple(TOWNFOLK_MAIN_HAND_SOCKET.rotationQuaternion)} · scale ${TOWNFOLK_MAIN_HAND_SOCKET.scale}`;

function readEnumParam<const Values extends readonly string[]>(
  name: string,
  values: Values,
  fallback: Values[number]
): Values[number] {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return value !== null && values.some((candidate) => candidate === value)
    ? (value as Values[number])
    : fallback;
}

function readFacingParam(name: string, fallback: WeaponFacing): WeaponFacing {
  if (typeof window === 'undefined') return fallback;
  const value = new URLSearchParams(window.location.search).get(name);
  return value !== null && /^[0-5]$/.test(value)
    ? (Number(value) as WeaponFacing)
    : fallback;
}

function observationKey(observation: WeaponRenderObservation): string {
  return [
    observation.equipmentState,
    observation.motion,
    observation.view,
    observation.facing,
    observation.attachmentCode,
  ].join('|');
}

function sameStatus(
  left: MainHandAttachmentStatus | undefined,
  right: MainHandAttachmentStatus | undefined
): boolean {
  return (
    left?.code === right?.code &&
    left?.ref === right?.ref &&
    left?.weaponUrl === right?.weaponUrl &&
    left?.bone === right?.bone &&
    left?.message === right?.message
  );
}

function ButtonGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; ariaLabel?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              aria-pressed={active}
              aria-label={option.ariaLabel ?? option.label}
              onClick={() => onChange(option.value)}
              className="rounded border px-3 py-1.5 text-sm"
              style={{
                backgroundColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--bg-secondary)',
                borderColor: active
                  ? 'var(--accent-primary)'
                  : 'var(--border-primary)',
                color: 'var(--text-primary)',
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function WeaponAttachmentConcept() {
  const [classId, setClassId] = useState<WeaponClassId>(() =>
    readEnumParam('class', CLASS_VALUES, 'fighter')
  );
  const [equipmentState, setEquipmentState] = useState<WeaponEquipmentState>(
    () => readEnumParam('weapon', EQUIPMENT_VALUES, 'unarmed')
  );
  const [motion, setMotion] = useState<WeaponMotion>(() =>
    readEnumParam('motion', MOTION_VALUES, 'idle')
  );
  const [view, setView] = useState<WeaponView>(() =>
    readEnumParam('view', VIEW_VALUES, 'play')
  );
  const [facing, setFacing] = useState<WeaponFacing>(() =>
    readFacingParam('facing', 0)
  );
  const [attachmentStatus, setAttachmentStatus] =
    useState<MainHandAttachmentStatus>({ code: 'unarmed' });
  const [observations, setObservations] = useState<WeaponRenderObservation[]>(
    []
  );
  const [verdictJson, setVerdictJson] = useState<string | null>(null);
  const observedKeysRef = useRef<Set<string>>(new Set());

  const resolution = useMemo(
    () =>
      resolveProvisionalMainHand(
        WEAPON_ATTACHMENT_FIXTURES[equipmentState].equipped
      ),
    [equipmentState]
  );
  const presentation =
    resolution.code === 'mapped' ? resolution.presentation : undefined;
  const coverage = useMemo(() => coverageFor(observations), [observations]);
  const canRecord = useMemo(
    () => canRecordWeaponVerdict(observations),
    [observations]
  );

  const handleAttachmentStatus = useCallback(
    (status: MainHandAttachmentStatus) => {
      setAttachmentStatus((current) =>
        sameStatus(current, status) ? current : status
      );
    },
    []
  );

  const handleRenderObserved = useCallback(
    (observation: WeaponRenderObservation) => {
      const key = observationKey(observation);
      if (observedKeysRef.current.has(key)) return;
      observedKeysRef.current.add(key);
      setObservations((current) => [...current, observation]);
    },
    []
  );

  const equippedRef =
    resolution.code === 'unarmed' ? 'unarmed' : resolution.ref;
  const candidateSource =
    resolution.code === 'mapped' ? resolution.candidate.source : 'none';
  const candidateUrl =
    resolution.code === 'mapped' ? resolution.candidate.weaponUrl : 'none';
  const textureBudget =
    resolution.code === 'mapped'
      ? formatTextureBudget(
          resolution.candidate.decodedTextureMb,
          resolution.candidate.budgetMb
        )
      : 'none';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Equipped Weapon Lab · Concept</h1>
        <p className="text-sm text-slate-300">
          actual shared ClassCharacterModel · production provider mapping · no
          writer
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <ButtonGroup
              label="Class"
              value={classId}
              onChange={(next) => {
                setClassId(next);
                setVerdictJson(null);
              }}
              options={CLASS_VALUES.map((value) => ({
                value,
                label: value[0]!.toUpperCase() + value.slice(1),
              }))}
            />
            <ButtonGroup
              label="Equipment"
              value={equipmentState}
              onChange={(next) => {
                setEquipmentState(next);
                setVerdictJson(null);
              }}
              options={[
                { value: 'unarmed', label: 'Unarmed' },
                ...CURRENT_MAIN_HAND_WEAPONS.map((weapon) => ({
                  value: weapon.id,
                  label: weapon.label,
                })),
              ]}
            />
            <ButtonGroup
              label="Motion"
              value={motion}
              onChange={(next) => {
                setMotion(next);
                setVerdictJson(null);
              }}
              options={[
                { value: 'idle', label: 'Idle' },
                { value: 'walk', label: 'Walk' },
              ]}
            />
            <ButtonGroup
              label="View"
              value={view}
              onChange={(next) => {
                setView(next);
                setVerdictJson(null);
              }}
              options={[
                { value: 'close', label: 'Hand close-up' },
                { value: 'orbit', label: 'Full orbit' },
                { value: 'play', label: 'Tactical play' },
              ]}
            />
            <ButtonGroup
              label="Facing"
              value={facing}
              onChange={(next) => {
                setFacing(next);
                setVerdictJson(null);
              }}
              options={FACING_VALUES.map((value, index) => ({
                value,
                label: ['E', 'NE', 'NW', 'W', 'SW', 'SE'][index]!,
                ariaLabel: `Facing ${['E', 'NE', 'NW', 'W', 'SW', 'SE'][index]}`,
              }))}
            />
          </div>

          <div
            className="rounded border p-3"
            style={{ borderColor: 'var(--border-primary)' }}
          >
            <WeaponAttachmentPreview
              classId={classId}
              equipmentState={equipmentState}
              motion={motion}
              view={view}
              facing={facing}
              presentation={presentation}
              onAttachmentStatus={handleAttachmentStatus}
              onRenderObserved={handleRenderObserved}
            />
          </div>
        </div>

        <aside
          className="space-y-4 rounded border p-4"
          style={{ borderColor: 'var(--border-primary)' }}
        >
          <h2 className="text-lg font-semibold">Inspector</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium">Equipped ref</dt>
              <dd data-testid="equipped-ref">{equippedRef}</dd>
            </div>
            <div>
              <dt className="font-medium">Candidate source</dt>
              <dd data-testid="candidate-source">{candidateSource}</dd>
            </div>
            <div>
              <dt className="font-medium">Candidate URL</dt>
              <dd data-testid="candidate-url">{candidateUrl}</dd>
            </div>
            <div>
              <dt className="font-medium">Socket profile</dt>
              <dd data-testid="socket-profile">{SOCKET_PROFILE}</dd>
            </div>
            <div>
              <dt className="font-medium">Attachment status</dt>
              <dd data-testid="attachment-status">{attachmentStatus.code}</dd>
            </div>
            <div>
              <dt className="font-medium">Texture budget</dt>
              <dd data-testid="texture-warning">{textureBudget}</dd>
            </div>
            <div>
              <dt className="font-medium">Coverage status</dt>
              <dd data-testid="coverage-status">
                {`equipment ${coverage.equipmentStates.length}/${EQUIPMENT_VALUES.length} · motion ${coverage.motions.length}/2 · views ${coverage.views.length}/3 · facings ${coverage.facings.length}/6`}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            disabled={!canRecord}
            onClick={() =>
              setVerdictJson(
                JSON.stringify(weaponConceptVerdict(observations), null, 2)
              )
            }
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
            style={{
              borderColor: 'var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            Record non-production verdict
          </button>

          {verdictJson ? (
            <pre
              data-testid="provisional-verdict"
              className="overflow-x-auto rounded border p-3 text-xs"
              style={{ borderColor: 'var(--border-primary)' }}
            >
              {verdictJson}
            </pre>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
