# Encounter Studio

## Ownership

Encounter Studio is a presentation over `WorldBuildingConcept`'s document,
history, selection, gesture and persistence owner. It does not own a second draft
or implement monster rules. Load the UI/UX charter and this repository's
instructions; the detailed authoring contract is
[`world-building/CONTRACT.md`](../../../src/concepts/world-building/CONTRACT.md).

## Separate responsibilities

- **Site management:** one surface for world/reference/file opening and
  world/copy/file saving. Local browser recovery is not a world save. Play is
  separate navigation but retains save-before-launch semantics.
- **Cast management:** one member per monster ref found in templates, palette
  defaults or placements. Adding a standard monster or changing its cast label
  and look does not create a template. A zombie can look human without changing
  its rules identity.
- **Placed NPC:** one hex-bound instance with its own look, bindings and name.
  Removing it does not delete its cast member; Undo restores the whole placement.
- **Props:** retain their existing scene/free-placement controls, not NPC hex
  placement semantics.

Equipment and stat customization belong to separate rules contracts. The
advanced editor exposes existing capabilities; its presence does not imply the
toolkit can derive templates from every monster offered in a UI list. The
rulebook template-base registry is distinct from its monster constructors. Do not
repair a rejected template by silently changing its base.

## Appearance and lifetime

`scene.creaturePalette` is editor metadata, not rulebook content. `ref` is monster
identity; optional `modelRef` is the default appearance family for new instances.
A placed declaration's optional `appearanceRef` is an exact appearance override.
The appearance catalog supplies looks, never monster identity or stats.

An absent appearance override uses existing standard-model resolution, when
available. An explicit unavailable ref remains explicit and is not substituted.
Custom templates without a standard model need an explicit appearance.

Imported sites can have looks on every placed creature and no cast defaults.
The placement picker offers those existing published looks without synthesizing
or persisting a default. The author commits the chosen look only by placing.
Changing defaults does not restyle old placements. A placement can be removed
without losing a cast member inferred from that last imported instance.

## Source map

| Concern                                         | Owner / entry                                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Studio navigation and publishing composition    | `src/concepts/encounter-studio/EncounterStudioWorkspace.tsx`                                                         |
| Site presentation slot                          | `StudioSitePanel.tsx` in that directory                                                                              |
| File and world operations                       | `StudioDraftFile.tsx`, `StudioOpen.tsx`, `StudioPublish.tsx`; existing `useRoomPublishing` remains transaction owner |
| Cast list and appearance editor                 | `StudioCast.tsx`, `StudioCastAppearance.tsx`                                                                         |
| Placement look choices                          | `StudioCreaturePalette.tsx`, `NpcLookPicker.tsx`                                                                     |
| Derived cast and edits                          | `src/concepts/world-building/cast.ts`                                                                                |
| Editor recipe codec                             | `src/concepts/world-building/creaturePalette.ts`                                                                     |
| Document, selection, arming and mutation guards | `src/concepts/world-building/WorldBuildingConcept.tsx`                                                               |
| Selected noun intents / controls                | `world-building/studioArrange.ts`, `encounter-studio/StudioArrangePanel.tsx`                                         |
| Standard monster/model vocabulary               | `src/author/paletteData.ts`, `src/components/hex-grid/monsterModels.ts`                                              |
| Explicit appearance metadata                    | `src/npc-appearances/`, generated provider catalog                                                                   |

## Verification and continuing work

Use the [Studio verification guide](../../how-to/encounter-studio-verification.md)
and a disposable browser context against the real app. Tests must distinguish
new standard cast members from imported template members lacking defaults. Drive
the visible palette, then assert committed declaration ref/look, preserved scope
and Undo; owner-only calls do not prove that a button is enabled.

For persistence, cover imported/owned/reference destinations, key sharing,
overwrite cancellation, YAML roundtrip, and unchanged bytes on refusal. The
case files are [site management](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1327)
and [cast/placement](https://github.com/KirkDiggler/rpg-dnd5e-web/issues/1332),
including the imported-cast regression and operator acceptance.

Layout/2D placement, the selected-NPC presentation overhaul, and equipment/stat
customization are separate follow-ups, not claims made by this slice. Consult the
linked issues and actual code before extending those paths.
