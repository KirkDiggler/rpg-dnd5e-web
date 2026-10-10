/**
 * Selected-wall inspector for the shared concept wall tool (Task 3).
 *
 * Every staged edit calls `onEdit` exactly once, which the editor turns into
 * one room-history transaction. Opening add/remove/update are immediate single
 * transactions. Invalid input is caught here and reported through `onNotice`;
 * the draft is never modified. Asset mapping, hex geometry and fit math all
 * live in the pure `structuralWallEditing` leaf.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { CheckApproachRows } from './CheckApproachRows';
import {
  addDoorApproach,
  doorBindingState,
  patchDoorApproach,
  removeDoorApproach,
  setDoorBindingState,
  type DoorBindingState,
  type DoorBindings,
} from './doorBindingEdits';
import type { RoomDoorBinding } from './roomDraft';
import {
  addWallOpening,
  removeWallOpening,
  resizeWallLength,
  rotateWall,
  setWallAppearance,
  setWallBlocker,
  setWallLabel,
  translateWall,
  updateWallOpening,
} from './structuralWallEditing';
import type { StructuralWall } from './structuralWalls';

/** One attached-door mutation. Each is exactly one room-history transaction in
 * the editor, guarded by the publishing lock like every other wall edit. */
export type WallDoorMutation =
  | { kind: 'attach'; wallId: string; openingId: string; assetRef: string }
  | { kind: 'swap'; wallId: string; openingId: string; assetRef: string }
  | { kind: 'remove'; wallId: string; openingId: string }
  | {
      kind: 'binding';
      wallId: string;
      openingId: string;
      binding: RoomDoorBinding;
    };

/** The four authored door states the engine already has, minus `not a door`:
 * removing an attachment is its own explicit control, so an attached door is
 * never silently detached by a state edit. */
const ATTACHED_DOOR_STATES: ReadonlyArray<{
  value: DoorBindingState;
  label: string;
}> = [
  { value: 'open', label: 'open doorway' },
  { value: 'closed', label: 'closed' },
  { value: 'locked', label: 'locked' },
];

export interface StructuralWallPanelProps {
  walls: readonly StructuralWall[];
  selectedWallId: string | null;
  onSelectWall: (id: string | null) => void;
  /** Normal selection rotation controls; numeric transforms stay secondary. */
  transformActions?: ReactNode;
  /** Generated catalog assets with measured dimensions and no door leaf. */
  assetOptions: readonly { ref: string; label: string }[];
  /** Catalog assets whose generated model declares a door `leaf`. */
  doorAssetOptions: readonly { ref: string; label: string }[];
  /** The open document's attached-door state, keyed by bound door id. */
  doorBindings: DoorBindings | undefined;
  /** Asset armed for the next drawn wall. Drawing is disabled without one. */
  armedAssetRef: string | null;
  onArmedAssetChange: (ref: string | null) => void;
  snapEnabled: boolean;
  onSnapChange: (enabled: boolean) => void;
  /** One call per Apply — the editor commits it as one undoable transaction.
   * Returns whether the edit was ACCEPTED: a publishing-lock guard or a
   * rejected document must not be reported as success. */
  onEdit: (next: StructuralWall) => boolean;
  onRemoveWall: (id: string) => void;
  onDoorMutation: (mutation: WallDoorMutation) => boolean;
  onNotice?: (message: string) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function StructuralWallPanel({
  walls,
  selectedWallId,
  onSelectWall,
  transformActions,
  assetOptions,
  doorAssetOptions,
  doorBindings,
  armedAssetRef,
  onArmedAssetChange,
  snapEnabled,
  onSnapChange,
  onEdit,
  onRemoveWall,
  onDoorMutation,
  onNotice,
}: StructuralWallPanelProps) {
  const wall = walls.find((entry) => entry.id === selectedWallId) ?? null;
  const [label, setLabel] = useState('');
  const [appearance, setAppearance] = useState<StructuralWall['appearance']>({
    assetRef: '',
    height: 1,
    thickness: 0.25,
    elevation: 0,
  });
  const [lengthEndpoint, setLengthEndpoint] = useState<'start' | 'end'>('end');
  const [lengthValue, setLengthValue] = useState('0');
  const [lengthEdited, setLengthEdited] = useState(false);
  const [appliedLength, setAppliedLength] = useState<string | null>(null);
  const [blocker, setBlocker] = useState<StructuralWall['blocker']>({
    footprint: { width: 1, depth: 0.25, offsetX: 0, offsetZ: 0 },
    blocksMovement: false,
    blocksLineOfSight: false,
  });
  const [moveX, setMoveX] = useState('0');
  const [moveZ, setMoveZ] = useState('0');
  const [rotateDegrees, setRotateDegrees] = useState('0');
  const [openingDraft, setOpeningDraft] = useState({
    id: '',
    position: '',
    width: '',
  });
  const [openingEdits, setOpeningEdits] = useState<
    Record<string, { position: string; width: string }>
  >({});
  /** Per-bare-opening staged door asset, keyed by opening id. */
  const [doorAssetDrafts, setDoorAssetDrafts] = useState<
    Record<string, string>
  >({});

  // Reset staged drafts whenever the selected wall object changes (selection
  // or a commit), so a refused or applied edit never strands a stale input.
  useEffect(() => {
    setAppliedLength(null);
  }, [selectedWallId]);
  useEffect(() => {
    if (!wall) return;
    setLabel(wall.label);
    setAppearance({ ...wall.appearance });
    setLengthValue(String(Number(wallLengthOf(wall).toFixed(6))));
    setLengthEdited(false);
    setBlocker({
      ...wall.blocker,
      footprint: { ...wall.blocker.footprint },
    });
    setMoveX('0');
    setMoveZ('0');
    setRotateDegrees('0');
    setOpeningDraft({ id: '', position: '', width: '' });
    setDoorAssetDrafts({});
    setOpeningEdits(
      Object.fromEntries(
        wall.openings.map((opening) => [
          opening.id,
          { position: String(opening.position), width: String(opening.width) },
        ])
      )
    );
  }, [wall]);

  const apply = (operation: () => StructuralWall) => {
    try {
      if (onEdit(operation())) onNotice?.('');
    } catch (error) {
      onNotice?.(messageOf(error));
    }
  };

  const applyDoor = (mutation: WallDoorMutation) => {
    try {
      if (onDoorMutation(mutation)) onNotice?.('');
    } catch (error) {
      onNotice?.(messageOf(error));
    }
  };

  const wallLengthValue = wall ? wallLengthOf(wall) : 0;
  // Readable display rounding is not an edit to the canonical length.
  const lengthNumber = lengthEdited ? Number(lengthValue) : wallLengthValue;

  return (
    <div className="wb-wall-panel" data-testid="structural-wall-panel">
      <h3>Walls</h3>
      <div className="wb-actions" role="group" aria-label="Authored walls">
        {walls.length === 0 && <p className="wb-help">No walls yet.</p>}
        {walls.map((entry) => (
          <button
            key={entry.id}
            type="button"
            aria-pressed={entry.id === selectedWallId}
            aria-label={`Select wall ${entry.label} ${entry.id}`}
            onClick={() => onSelectWall(entry.id)}
          >
            {entry.label || entry.id}
          </button>
        ))}
        {selectedWallId && (
          <button type="button" onClick={() => onSelectWall(null)}>
            Clear wall selection
          </button>
        )}
      </div>
      <fieldset>
        <legend>Wall drawing</legend>
        <label>
          <span>Drawing appearance asset</span>
          <select
            aria-label="Drawing appearance asset"
            value={armedAssetRef ?? ''}
            onChange={(event) => onArmedAssetChange(event.target.value || null)}
          >
            <option value="">Select an asset…</option>
            {assetOptions.map((option) => (
              <option key={option.ref} value={option.ref}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            aria-label="Snap to hex centres, corners and side midpoints"
            checked={snapEnabled}
            onChange={(event) => onSnapChange(event.target.checked)}
          />
          <span>Snap to hex centres, corners and side midpoints</span>
        </label>
        {!armedAssetRef && (
          <p className="wb-help" role="status">
            Drawing is disabled until a repeatable asset with measured
            dimensions and no door leaf is selected.
          </p>
        )}
      </fieldset>

      {wall && (
        <div className="wb-light-editor" data-testid="structural-wall-editor">
          <h4>Wall {wall.id}</h4>
          <button
            type="button"
            aria-label={`Remove wall ${wall.id}`}
            onClick={() => onRemoveWall(wall.id)}
          >
            Remove wall
          </button>

          <fieldset>
            <legend>Appearance</legend>
            <label>
              <span>Label</span>
              <input
                aria-label="Wall label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            <label>
              <span>Asset</span>
              <select
                aria-label="Wall appearance asset"
                value={appearance.assetRef}
                onChange={(event) =>
                  setAppearance((current) => ({
                    ...current,
                    assetRef: event.target.value,
                  }))
                }
              >
                {!assetOptions.some(
                  (option) => option.ref === appearance.assetRef
                ) && (
                  <option value={appearance.assetRef}>
                    {appearance.assetRef}
                  </option>
                )}
                {assetOptions.map((option) => (
                  <option key={option.ref} value={option.ref}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['height', 'Appearance height'],
                ['thickness', 'Appearance thickness'],
                ['elevation', 'Appearance elevation'],
              ] as const
            ).map(([key, ariaLabel]) => (
              <label key={key}>
                <span>{ariaLabel}</span>
                <input
                  type="number"
                  step="0.05"
                  aria-label={ariaLabel}
                  value={appearance[key]}
                  onChange={(event) =>
                    setAppearance((current) => ({
                      ...current,
                      [key]: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() =>
                apply(() =>
                  setWallLabel(setWallAppearance(wall, appearance), label)
                )
              }
            >
              Apply appearance
            </button>
          </fieldset>

          <fieldset>
            <legend>Exact length</legend>
            <label>
              <span>Move endpoint</span>
              <select
                aria-label="Length endpoint"
                value={lengthEndpoint}
                onChange={(event) =>
                  setLengthEndpoint(event.target.value as 'start' | 'end')
                }
              >
                <option value="end">End</option>
                <option value="start">Start</option>
              </select>
            </label>
            <label>
              <span>Exact length</span>
              <input
                type="number"
                step="0.1"
                aria-label="Exact length"
                value={lengthValue}
                onChange={(event) => {
                  setLengthValue(event.target.value);
                  setLengthEdited(true);
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                try {
                  const result = resizeWallLength({
                    wall,
                    endpoint: lengthEndpoint,
                    length: lengthNumber,
                  });
                  if (!onEdit(result.wall)) return;
                  setAppliedLength(
                    `${Number(result.appliedLength.toFixed(6))}${
                      result.clamped ? ' (clamped at the doorway edge)' : ''
                    }`
                  );
                  onNotice?.('');
                } catch (error) {
                  onNotice?.(messageOf(error));
                }
              }}
            >
              Apply length
            </button>
            <output aria-live="polite" data-testid="structural-wall-length">
              {appliedLength
                ? `Applied length ${appliedLength}`
                : `Current length ${wallLengthValue}`}
            </output>
          </fieldset>

          <fieldset>
            <legend>Move and rotate</legend>
            {transformActions}
            <p className="wb-help">
              Use Move or Rotate in the toolbar, then drag the selected wall's
              handles.
            </p>
            <details>
              <summary>Advanced transform values</summary>
              <label>
                <span>Move X</span>
                <input
                  type="number"
                  step="0.1"
                  aria-label="Move X"
                  value={moveX}
                  onChange={(event) => setMoveX(event.target.value)}
                />
              </label>
              <label>
                <span>Move Z</span>
                <input
                  type="number"
                  step="0.1"
                  aria-label="Move Z"
                  value={moveZ}
                  onChange={(event) => setMoveZ(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  apply(() =>
                    translateWall(wall, {
                      x: Number(moveX),
                      z: Number(moveZ),
                    })
                  )
                }
              >
                Apply move
              </button>
              <label>
                <span>Rotate degrees</span>
                <input
                  type="number"
                  step="15"
                  aria-label="Rotate degrees"
                  value={rotateDegrees}
                  onChange={(event) => setRotateDegrees(event.target.value)}
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  apply(() =>
                    rotateWall(wall, {
                      angle: (Number(rotateDegrees) * Math.PI) / 180,
                    })
                  )
                }
              >
                Apply rotation
              </button>
            </details>
          </fieldset>

          <fieldset>
            <legend>Blocking rectangle</legend>
            {(
              [
                ['width', 'Blocker width'],
                ['depth', 'Blocker depth'],
                ['offsetX', 'Blocker offset X'],
                ['offsetZ', 'Blocker offset Z'],
              ] as const
            ).map(([key, ariaLabel]) => (
              <label key={key}>
                <span>{ariaLabel}</span>
                <input
                  type="number"
                  step="0.05"
                  aria-label={ariaLabel}
                  value={blocker.footprint[key]}
                  onChange={(event) =>
                    setBlocker((current) => ({
                      ...current,
                      footprint: {
                        ...current.footprint,
                        [key]: Number(event.target.value),
                      },
                    }))
                  }
                />
              </label>
            ))}
            <label>
              <input
                type="checkbox"
                aria-label="Blocker blocks movement"
                checked={blocker.blocksMovement}
                onChange={(event) =>
                  setBlocker((current) => ({
                    ...current,
                    blocksMovement: event.target.checked,
                  }))
                }
              />
              <span>Blocks movement</span>
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Blocker blocks line of sight"
                checked={blocker.blocksLineOfSight}
                onChange={(event) =>
                  setBlocker((current) => ({
                    ...current,
                    blocksLineOfSight: event.target.checked,
                  }))
                }
              />
              <span>Blocks line of sight</span>
            </label>
            <button
              type="button"
              onClick={() => apply(() => setWallBlocker(wall, blocker))}
            >
              Apply blocking rectangle
            </button>
          </fieldset>

          <fieldset>
            <legend>Openings</legend>
            {wall.openings.map((opening) => {
              const door = opening.door;
              const draft = openingEdits[opening.id] ?? {
                position: String(opening.position),
                width: String(opening.width),
              };
              return (
                <div key={opening.id} className="wb-actions">
                  <span>{opening.id}</span>
                  <label>
                    <span>Position</span>
                    <input
                      type="number"
                      step="0.1"
                      aria-label={`Opening position ${opening.id}`}
                      value={draft.position}
                      onChange={(event) =>
                        setOpeningEdits((current) => ({
                          ...current,
                          [opening.id]: {
                            ...draft,
                            position: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>Width</span>
                    <input
                      type="number"
                      step="0.1"
                      aria-label={`Opening width ${opening.id}`}
                      value={draft.width}
                      onChange={(event) =>
                        setOpeningEdits((current) => ({
                          ...current,
                          [opening.id]: { ...draft, width: event.target.value },
                        }))
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      apply(() =>
                        updateWallOpening(wall, opening.id, {
                          position: Number(draft.position),
                          width: Number(draft.width),
                        })
                      )
                    }
                  >
                    Apply opening
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove opening ${opening.id}`}
                    onClick={() =>
                      apply(() => removeWallOpening(wall, opening.id))
                    }
                  >
                    Remove
                  </button>
                  {door ? (
                    <div
                      className="wb-actions"
                      data-testid={`wall-door-${opening.id}`}
                      data-door-id={door.id}
                    >
                      <span>Door {door.id}</span>
                      <label>
                        <span>Door asset</span>
                        <select
                          aria-label={`Door asset for opening ${opening.id}`}
                          value={doorAssetDrafts[opening.id] ?? door.assetRef}
                          onChange={(event) =>
                            setDoorAssetDrafts((current) => ({
                              ...current,
                              [opening.id]: event.target.value,
                            }))
                          }
                        >
                          {!doorAssetOptions.some(
                            (option) => option.ref === door.assetRef
                          ) && (
                            <option value={door.assetRef}>
                              {door.assetRef}
                            </option>
                          )}
                          {doorAssetOptions.map((option) => (
                            <option key={option.ref} value={option.ref}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          applyDoor({
                            kind: 'swap',
                            wallId: wall.id,
                            openingId: opening.id,
                            assetRef:
                              doorAssetDrafts[opening.id] ?? door.assetRef,
                          })
                        }
                      >
                        Swap door asset
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove door from opening ${opening.id}`}
                        onClick={() =>
                          applyDoor({
                            kind: 'remove',
                            wallId: wall.id,
                            openingId: opening.id,
                          })
                        }
                      >
                        Remove door
                      </button>
                      {(() => {
                        const binding = doorBindings?.[door.id];
                        const state = doorBindingState(binding);
                        return (
                          <>
                            <label>
                              <span>Door state</span>
                              <select
                                aria-label={`Door state for opening ${opening.id}`}
                                value={state}
                                onChange={(event) =>
                                  applyDoor({
                                    kind: 'binding',
                                    wallId: wall.id,
                                    openingId: opening.id,
                                    binding:
                                      setDoorBindingState(
                                        binding,
                                        event.target.value as DoorBindingState
                                      ) ?? {},
                                  })
                                }
                              >
                                {ATTACHED_DOOR_STATES.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <output
                              data-testid={`wall-door-state-${opening.id}`}
                            >
                              {state}
                            </output>
                            {state === 'locked' && (
                              <CheckApproachRows
                                id={door.id}
                                rows={binding?.locked ?? []}
                                testIdPrefix={`wall-door-${opening.id}`}
                                onPatch={(index, patch) =>
                                  applyDoor({
                                    kind: 'binding',
                                    wallId: wall.id,
                                    openingId: opening.id,
                                    binding: patchDoorApproach(
                                      binding,
                                      index,
                                      patch
                                    ),
                                  })
                                }
                                onRemove={(index) =>
                                  applyDoor({
                                    kind: 'binding',
                                    wallId: wall.id,
                                    openingId: opening.id,
                                    binding: removeDoorApproach(binding, index),
                                  })
                                }
                                onAdd={() =>
                                  applyDoor({
                                    kind: 'binding',
                                    wallId: wall.id,
                                    openingId: opening.id,
                                    binding: addDoorApproach(binding),
                                  })
                                }
                              />
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      className="wb-actions"
                      data-testid={`wall-door-attach-${opening.id}`}
                    >
                      <label>
                        <span>Door asset</span>
                        <select
                          aria-label={`Door asset for opening ${opening.id}`}
                          value={doorAssetDrafts[opening.id] ?? ''}
                          onChange={(event) =>
                            setDoorAssetDrafts((current) => ({
                              ...current,
                              [opening.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Select a door asset…</option>
                          {doorAssetOptions.map((option) => (
                            <option key={option.ref} value={option.ref}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!doorAssetDrafts[opening.id]}
                        onClick={() =>
                          applyDoor({
                            kind: 'attach',
                            wallId: wall.id,
                            openingId: opening.id,
                            assetRef: doorAssetDrafts[opening.id]!,
                          })
                        }
                      >
                        Attach door
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div className="wb-actions">
              <label>
                <span>New opening id</span>
                <input
                  aria-label="New opening id"
                  value={openingDraft.id}
                  onChange={(event) =>
                    setOpeningDraft((current) => ({
                      ...current,
                      id: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>New opening position</span>
                <input
                  type="number"
                  step="0.1"
                  aria-label="New opening position"
                  value={openingDraft.position}
                  onChange={(event) =>
                    setOpeningDraft((current) => ({
                      ...current,
                      position: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>New opening width</span>
                <input
                  type="number"
                  step="0.1"
                  aria-label="New opening width"
                  value={openingDraft.width}
                  onChange={(event) =>
                    setOpeningDraft((current) => ({
                      ...current,
                      width: event.target.value,
                    }))
                  }
                />
              </label>
              <button
                type="button"
                onClick={() =>
                  apply(() =>
                    addWallOpening(wall, {
                      id: openingDraft.id,
                      position: Number(openingDraft.position),
                      width: Number(openingDraft.width),
                    })
                  )
                }
              >
                Add opening
              </button>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function wallLengthOf(wall: StructuralWall): number {
  return Math.hypot(
    wall.line.end.x - wall.line.start.x,
    wall.line.end.z - wall.line.start.z
  );
}
