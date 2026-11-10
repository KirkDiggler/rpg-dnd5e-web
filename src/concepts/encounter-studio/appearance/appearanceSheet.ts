import { chooseNpcAppearance } from '@/npc-appearances/npcAppearanceChoices';
import type {
  WorldAtlasMaterial,
  WorldSurfaceMaterial,
} from '@/rendering/worldMaterialTypes';
import { wallFinishFor } from '../../world-building/wallFinishEdits';
import { WALL_FINISH_SIDES } from '../../world-building/wallFinishTypes';
import {
  appearanceSelectionKey,
  type AppearanceChannelState,
  type AppearanceChoice,
  type AppearanceField,
  type AppearanceSheet,
  type AppearanceSheetInput,
} from './appearanceTypes';

function channelFields(
  target: string,
  material?: WorldAtlasMaterial | WorldSurfaceMaterial,
  unavailable?: string
): AppearanceField[] {
  return (['color', 'normal', 'emissive'] as const).map((channel) => {
    let state: AppearanceChannelState;
    if (unavailable) state = { kind: 'unavailable', reason: unavailable };
    else if (!material) state = { kind: 'complete-look' };
    else {
      const image =
        channel === 'color'
          ? material.baseColor
          : channel === 'normal'
            ? material.normal
            : null;
      state = image ? { kind: 'pack-map', image } : { kind: 'no-map' };
    }
    return {
      kind: 'channel',
      id: `${target}:${channel}`,
      label: channel,
      target,
      channel,
      state,
    };
  });
}

function npcFields(input: AppearanceSheetInput): AppearanceField[] {
  if (input.selection.kind !== 'actor') return [];
  const ref =
    input.draft.appearanceRef ?? input.selection.monster.appearanceRef ?? '';
  const current = input.npcFamilies
    .flatMap((family) => family.looks)
    .find((look) => look.assetRef === ref);
  const family = input.npcFamilies.find(
    (row) => row.ref === (current?.look?.familyRef ?? current?.assetRef)
  );
  const fields: AppearanceField[] = [
    {
      kind: 'npc-family',
      id: 'npc-family',
      label: 'NPC appearance',
      value: ref,
      choices: [
        { value: '', label: 'Use rules default appearance' },
        ...input.npcFamilies.map((row) => ({
          value: chooseNpcAppearance(
            { currentRef: ref, control: 'family', value: row.ref },
            input.npcFamilies
          ),
          label: row.defaultLook.displayName,
        })),
      ],
      ...(ref && !current
        ? { unavailable: 'Selected NPC appearance is unavailable.' }
        : {}),
    },
  ];
  if (family && current?.look) {
    const look = current.look;
    const styles = family.looks
      .flatMap((row) =>
        row.look?.skinPalette === look.skinPalette
          ? [{ value: row.assetRef, label: row.look.style }]
          : []
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    const skins = family.looks
      .flatMap((row) =>
        row.look?.style === look.style
          ? [{ value: row.assetRef, label: row.look.skinPalette }]
          : []
      )
      .sort((a, b) => a.label.localeCompare(b.label));
    fields.push(
      {
        kind: 'npc-style',
        id: 'npc-style',
        label: 'Style',
        value: ref,
        choices: styles,
      },
      {
        kind: 'npc-skin',
        id: 'npc-skin',
        label: 'Skin palette',
        value: ref,
        choices: skins,
      }
    );
  }
  fields.push(
    ...channelFields(
      'npc',
      undefined,
      ref && !current ? 'Appearance is unavailable.' : undefined
    )
  );
  return fields;
}

function worldFields(input: AppearanceSheetInput): AppearanceField[] {
  const { selection, draft, scene, catalog } = input;
  const owner =
    selection.kind === 'wall'
      ? selection.appearance
      : selection.kind === 'scene' && selection.rootCount === 1
        ? scene.items.find((item) => item.id === selection.rootIds[0])
        : undefined;
  if (!owner) return [];
  const assetRef =
    selection.kind === 'wall'
      ? (draft.assetRef ?? owner.assetRef)
      : owner.assetRef;
  const asset = Object.hasOwn(input.assets, assetRef)
    ? input.assets[assetRef]
    : undefined;
  const fields: AppearanceField[] = [];
  if (selection.kind === 'wall' && input.assetChoices) {
    fields.push({
      kind: 'asset',
      id: 'asset',
      label: 'Appearance asset',
      value: assetRef,
      choices: input.assetChoices,
      ...(!input.assetChoices.some((choice) => choice.value === assetRef)
        ? { unavailable: 'Selected asset is unavailable.' }
        : {}),
    });
  }
  const binding = catalog?.atlas?.bindings.find(
    (row) => row.assetRef === assetRef
  );
  const overrides = draft.materialOverrides ?? owner.materialOverrides ?? [];
  const ids = [
    ...new Set([
      ...(binding?.surfaces.map((row) => row.id) ?? []),
      ...overrides.map((row) => row.surfaceId),
    ]),
  ];
  for (const surfaceId of ids) {
    const surface = binding?.surfaces.find((row) => row.id === surfaceId);
    const current =
      overrides.find((row) => row.surfaceId === surfaceId)?.materialRef ?? '';
    let unavailable = !catalog
      ? 'Material catalog is unavailable.'
      : !surface
        ? 'Selected material scope has no declared binding.'
        : binding?.glbSha256 !== asset?.glbSha256
          ? 'Material binding geometry is stale.'
          : !surface.compatibleFamilies?.length
            ? 'Target has no published compatibility declaration.'
            : undefined;
    const materials = unavailable
      ? []
      : (catalog?.atlas?.materials.filter((row) =>
          surface!.compatibleFamilies.includes(row.family)
        ) ?? []);
    if (
      !unavailable &&
      current &&
      !materials.some((row) => row.ref === current)
    )
      unavailable = 'Selected texture pack is unavailable or incompatible.';
    fields.push({
      kind: 'atlas-pack',
      id: `atlas:${surfaceId}`,
      surfaceId,
      label: ids.length === 1 ? 'Texture pack' : `Texture pack · ${surfaceId}`,
      value: current,
      choices: [
        { value: '', label: 'Original' },
        ...materials.map((row) => ({ value: row.ref, label: row.displayName })),
      ],
      ...(unavailable ? { unavailable } : {}),
    });
    fields.push(
      ...channelFields(
        surfaceId,
        materials.find((row) => row.ref === current),
        unavailable
      )
    );
  }
  if (selection.kind === 'wall') {
    const provider = catalog?.surfaces.find((row) => row.assetRef === assetRef);
    const saved = wallFinishFor(scene, selection.wall.id);
    for (const side of WALL_FINISH_SIDES) {
      const value =
        (side === 'positive-z' ? draft.finishA : draft.finishB) ??
        saved?.[side] ??
        '';
      const targets =
        provider?.bindings.filter((row) => row.side === side) ?? [];
      if (!targets.length && !value) continue;
      let unavailable = !catalog
        ? 'Material catalog is unavailable.'
        : !targets.length
          ? 'This wall has no declared finish surface for this side.'
          : provider?.glbSha256 !== asset?.glbSha256
            ? 'Wall surface geometry is stale.'
            : undefined;
      const materials = unavailable
        ? []
        : (catalog?.materials.filter(
            (row) =>
              targets.filter((target) => target.family === row.family)
                .length === 1
          ) ?? []);
      if (!unavailable && value && !materials.some((row) => row.ref === value))
        unavailable = 'Selected wall finish is unavailable or incompatible.';
      const choices: AppearanceChoice[] = [
        { value: '', label: 'Use authored default' },
        ...materials.map((row) => ({ value: row.ref, label: row.displayName })),
      ];
      fields.push({
        kind: 'wall-finish',
        id: `wall:${side}`,
        side,
        label: `Side ${side === 'positive-z' ? 'A' : 'B'} finish`,
        value,
        choices,
        ...(unavailable ? { unavailable } : {}),
      });
      fields.push(
        ...channelFields(
          side,
          materials.find((row) => row.ref === value),
          unavailable
        )
      );
    }
    const faces = fields.filter((field) => field.kind === 'wall-finish');
    if (faces.length === 2) {
      const [a, b] = faces;
      const mixed = a.value !== b.value;
      fields.unshift({
        kind: 'wall-finish',
        id: 'wall:both',
        side: 'both',
        label: 'Wall finish (both sides)',
        value: mixed ? '__mixed__' : a.value,
        choices: a.choices.filter((choice) =>
          b.choices.some((other) => other.value === choice.value)
        ),
        ...(mixed ? { mixed: true as const } : {}),
      });
    }
  }
  return fields;
}

/** Derive the selected owner's appearance fields without mutating its document. */
export function buildAppearanceSheet(
  input: AppearanceSheetInput
): AppearanceSheet {
  const fields =
    input.selection.kind === 'actor' ? npcFields(input) : worldFields(input);
  return {
    selectionKey: appearanceSelectionKey(input.selection),
    fields,
    diagnostics: [
      ...new Set(
        fields.flatMap((field) =>
          field.kind !== 'channel' && field.unavailable
            ? [field.unavailable]
            : []
        )
      ),
    ],
  };
}
