import { useState } from 'react';
import { WORLD_BUILDING_CATALOG_BY_REF } from '../world-building/catalog';
import { wallLength } from '../world-building/structuralWallEditing';
import type { StructuralWall } from '../world-building/structuralWalls';
import {
  addWallSection,
  editWallSection,
  removeWallSection,
  wallSectionOptions,
} from '../world-building/wallSectionEditing';
import type { WallSection } from '../world-building/wallSections';
import type { StudioWallEditing } from './studioSession';

function SectionPosition({
  section,
  move,
  remove,
}: {
  section: WallSection;
  move(position: number): void;
  remove(): void;
}): React.JSX.Element {
  const [position, setPosition] = useState(String(section.position));
  const label =
    WORLD_BUILDING_CATALOG_BY_REF.get(section.assetRef)?.label ??
    section.assetRef;
  return (
    <div className="es-wall-section-row">
      <strong>{label}</strong>
      <label>
        Position along wall
        <input
          type="number"
          step="0.05"
          aria-label={`Section ${section.id} position`}
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      </label>
      <div className="es-buttons">
        <button
          type="button"
          aria-label={`Move section ${section.id}`}
          onClick={() => move(Number(position))}
        >
          Move section
        </button>
        <button
          type="button"
          aria-label={`Remove section ${section.id}`}
          onClick={remove}
        >
          Remove section
        </button>
      </div>
    </div>
  );
}

/** Uses the existing wall edit transaction. No local document/history owner. */
export function StudioWallSections({
  wall,
  editing,
}: {
  wall: StructuralWall;
  editing: StudioWallEditing;
}): React.JSX.Element {
  const options = wallSectionOptions();
  const [assetRef, setAssetRef] = useState(options[0]?.ref ?? '');
  const [position, setPosition] = useState(String(wallLength(wall) / 2));
  const [error, setError] = useState<string | null>(null);
  const commit = (change: () => StructuralWall): void => {
    try {
      if (!editing.edit(change())) {
        setError('Section change was refused; the wall is unchanged.');
        return;
      }
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <section className="es-context-panel es-arrange" aria-label="Wall sections">
      <h3>Wall sections</h3>
      <p className="es-help">
        Place each feature once within this wall. Height and finishes follow the
        wall; sections do not create gameplay openings. These edits apply
        immediately.
      </p>
      <label>
        Section appearance
        <select
          aria-label="Section appearance"
          value={assetRef}
          onChange={(event) => setAssetRef(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.ref} value={option.ref}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Position from wall start
        <input
          type="number"
          step="0.05"
          aria-label="New section position"
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={!assetRef}
        onClick={() =>
          commit(() =>
            addWallSection(wall, {
              id: `section-${crypto.randomUUID()}`,
              assetRef,
              position: Number(position),
            })
          )
        }
      >
        Add wall section
      </button>
      {(wall.appearance.sections ?? []).map((section) => (
        <SectionPosition
          key={`${section.id}:${section.position}`}
          section={section}
          move={(value) =>
            commit(() => editWallSection(wall, section.id, { position: value }))
          }
          remove={() => commit(() => removeWallSection(wall, section.id))}
        />
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
