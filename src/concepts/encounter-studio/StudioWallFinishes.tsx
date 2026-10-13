import { useEffect, useState } from 'react';
import { wallFinishFor } from '../world-building/wallFinishEdits';
import type { WallFinishSide } from '../world-building/wallFinishTypes';
import type { ArrangeDraft } from './StudioArrangeFields';
import type { EncounterStudioSession, StructuralWall } from './studioSession';

/** Form-only controls. Mode changes do not author linkage or choose a material;
 * both face tokens join the existing Apply/Cancel transaction. */
export function StudioWallFinishes({
  session,
  wall,
  draft,
  onChange,
}: {
  session: EncounterStudioSession;
  wall: Readonly<StructuralWall>;
  draft: ArrangeDraft;
  onChange(patch: Pick<ArrangeDraft, 'finishA' | 'finishB'>): void;
}): React.JSX.Element | null {
  const owner = session.wallEditing.finishes;
  const saved = wallFinishFor(session.document.draft.scene, wall.id);
  const a = saved?.['positive-z'] ?? '',
    b = saved?.['negative-z'] ?? '';
  const [separate, setSeparate] = useState(a !== b);
  useEffect(() => setSeparate(a !== b), [wall.id, a, b]);
  if (!owner) return null;
  const catalog = owner.catalog.catalog;
  const provider = catalog?.surfaces.find(
    (row) => row.assetRef === (draft.assetRef ?? wall.appearance.assetRef)
  );
  const choices = (sides: readonly WallFinishSide[]) =>
    catalog?.materials.filter((material) =>
      sides.every((side) =>
        provider?.bindings.some(
          (binding) =>
            binding.side === side && binding.family === material.family
        )
      )
    ) ?? [];
  const valueA = draft.finishA ?? a,
    valueB = draft.finishB ?? b;
  const select = (
    label: string,
    value: string,
    sides: readonly WallFinishSide[],
    change: (ref: string) => void
  ): React.JSX.Element => {
    const options = choices(sides);
    return (
      <label className="es-wall-finish-choice">
        {label}
        <select
          aria-label={label}
          value={value}
          disabled={!options.length}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">Use region / authored default</option>
          {value === '__mixed__' ? (
            <option value="__mixed__" disabled>
              Different sides — choose to set both
            </option>
          ) : (
            value &&
            !options.some((row) => row.ref === value) && (
              <option value={value} disabled>
                Unavailable selected finish
              </option>
            )
          )}
          {options.map((material) => (
            <option key={material.ref} value={material.ref}>
              {material.displayName}
            </option>
          ))}
        </select>
      </label>
    );
  };
  const problems = owner.statuses.filter(
    (status) => status.wallId === wall.id && status.status === 'unresolved'
  );
  return (
    <fieldset className="es-wall-finish">
      <legend>Wall finish</legend>
      {(owner.catalog.status !== 'ready' || catalog?.kind === 'candidate') && (
        <p className="es-help">{owner.catalog.message}</p>
      )}
      <label className="es-wall-finish-sides">
        <input
          type="checkbox"
          checked={separate}
          onChange={(event) => setSeparate(event.target.checked)}
        />{' '}
        Set sides separately
      </label>
      {separate ? (
        <>
          {select('Side A finish', valueA, ['positive-z'], (ref) =>
            onChange({ finishA: ref })
          )}
          {select('Side B finish', valueB, ['negative-z'], (ref) =>
            onChange({ finishB: ref })
          )}
          <p className="es-help">
            Use the A/B map markers to identify each face. They follow the wall
            when it rotates.
          </p>
        </>
      ) : (
        select(
          'Wall finish (both sides)',
          valueA === valueB ? valueA : '__mixed__',
          ['positive-z', 'negative-z'],
          (ref) => onChange({ finishA: ref, finishB: ref })
        )
      )}
      <details className="es-help">
        <summary>Defaults & pattern alignment</summary>
        No region required. Wall choices override room defaults. Pattern
        alignment follows a resolved room where available; otherwise it starts
        at this wall’s Start end.
      </details>
      {!provider && (
        <p className="es-help">
          This wall appearance has no declared finish surfaces. Choose an
          enrolled appearance such as Castle Wall Fit 01.
        </p>
      )}
      {(valueA || valueB) && (
        <button
          type="button"
          onClick={() => onChange({ finishA: '', finishB: '' })}
        >
          Use region / authored defaults
        </button>
      )}
      {(draft.finishA !== undefined || draft.finishB !== undefined) && (
        <p role="status">Wall finish staged · Apply Arrange to save.</p>
      )}
      {problems.map((problem) => (
        <p key={problem.side} role="alert">
          Side {problem.side === 'positive-z' ? 'A' : 'B'} finish unapplied:{' '}
          {problem.reason}
        </p>
      ))}
    </fieldset>
  );
}
