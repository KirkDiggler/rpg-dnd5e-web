/**
 * Which per-prop option sections apply to a SELECTION (rpg-dnd5e-web#1178).
 *
 * THE RULE THE LAYOUT ALREADY STATES: a shared noun is a document section, a
 * selected noun is a property panel. Doors and prop orders were both built as
 * document sections — each listing every prop in the room — for settings that
 * belong to ONE prop. This module is the one place that answers which sections
 * a given selection earns, so the panel and its tests cannot drift.
 *
 * A PROP HAS OPTIONS, AND WHICH ONES DEPEND ON WHAT IT IS. Every prop has a
 * transform, a height and a movement/sight declaration. A door — an asset whose
 * model declares a `leaf`, or one that already carries a `doorBindings` entry —
 * also has door state. A declared prop that is NOT a door can also be held and
 * can arrive. A prop with several roles shows every section that applies.
 *
 * MULTI-SELECT SHOWS ONLY WHAT GENERALISES. A door lock is not a property of a
 * selection of three props, and neither is "what this one carries". Rather than
 * pick a winner and write three props' values from one, the per-prop sections
 * are ABSENT for a multi-selection and the caller says why — the alternative is
 * a control whose effect the author cannot predict.
 *
 * NOTHING HERE DECIDES MEANING. `isDoorAsset` is the renderer's own signal that
 * something swings (`DoorStates`' reason), and "a door may not also carry
 * orders" is the ENGINE's refusal, mirrored here only so the panel does not
 * offer a combination the server rejects.
 */
import { isDoorAsset } from './doorBindingEdits';
import type { RoomGameplayData } from './roomDraft';
import type { WorldScene } from './types';

/** What a selection earns in the right panel. */
export interface PropOptionSections {
  /** Door state (closed / locked / approaches). */
  door: boolean;
  /** Prop orders (holdable / holds / arrives). */
  orders: boolean;
  /** Whether the selection is a SINGLE prop at all. False for a multi-select,
   * which is why the two sections above are false with it. */
  single: boolean;
  /** Why the per-prop sections are absent, when they are. `undefined` when
   * nothing needs explaining (a single prop either shows a section or is
   * genuinely not that kind of thing). */
  reason?: 'multi-select';
}

/** The sections one prop earns on its own.
 *
 * A door is decided by the SAME test `DoorStates` uses to find candidates —
 * `isDoorAsset` (the asset's model declares a `leaf`) OR an entry already in
 * `doorBindings`, so a door the author made can never stop being one. Orders
 * need a `propDeclarations` entry (that is where the footprint comes from) and
 * are hidden for a door, which the engine refuses ("a door somebody picks up").
 */
export function propOptionSections(
  item: { id: string; assetRef: string } | undefined,
  room: RoomGameplayData
): PropOptionSections {
  if (item === undefined) {
    // Nothing single is selected. Whether that is a multi-selection or no
    // selection at all is the caller's to say; either way no per-prop section
    // applies, because there is no one prop for it to be about.
    return { door: false, orders: false, single: false };
  }
  const isDoor =
    isDoorAsset(item.assetRef) || room.doorBindings?.[item.id] !== undefined;
  const declared = room.propDeclarations[item.id] !== undefined;
  return {
    door: isDoor,
    orders: declared && !isDoor,
    single: true,
  };
}

/** The sections a whole SELECTION earns. `single` when exactly one prop is
 * selected and it is the one the panel is about; otherwise every per-prop
 * section is off and a multi-selection says why. */
export function selectionOptionSections(
  selectedItems: ReadonlyArray<{ id: string; assetRef: string }>,
  room: RoomGameplayData
): PropOptionSections {
  if (selectedItems.length === 0) {
    return { door: false, orders: false, single: false };
  }
  if (selectedItems.length === 1) {
    return propOptionSections(selectedItems[0], room);
  }
  return {
    door: false,
    orders: false,
    single: false,
    reason: 'multi-select',
  };
}

/** The props a selection is about, in scene order. Kept here rather than read
 * off `selectedProp` (single-only) so a multi-selection is still describable. */
export function selectedSceneItems(
  scene: WorldScene,
  ids: ReadonlyArray<string>
): Array<{ id: string; assetRef: string }> {
  const wanted = new Set(ids);
  return scene.items
    .filter((item) => wanted.has(item.id))
    .map((item) => ({ id: item.id, assetRef: item.assetRef }));
}
