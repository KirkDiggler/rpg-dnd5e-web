import { paletteNameForRef } from '@/author/paletteData';
import { resolveWorldAsset } from '@/generated/worldAssetCatalog';
import {
  NPC_APPEARANCE_FAMILIES,
  npcAppearanceOptions,
} from '@/npc-appearances/npcAppearanceChoices';
import { documentPlacementNames } from '../world-building/placementNames';
import { STUDIO_ONLY_HELP } from './FieldHelp';
import type {
  AuthoringRegion,
  EncounterStudioSession,
  RegionResolution,
  StructuralWall,
  StudioArrangeIntent,
  StudioArrangeSelection,
} from './studioSession';

export type ArrangeFieldKey =
  | 'x'
  | 'y'
  | 'z'
  | 'yaw'
  | 'heightScale'
  | 'length'
  | 'height'
  | 'thickness'
  | 'elevation'
  | 'q'
  | 'r'
  | 'text'
  | 'facing'
  | 'appearanceRef'
  | 'mapName'
  | 'appearanceFamily'
  | 'appearanceStyle'
  | 'appearanceSkinPalette'
  | 'assetRef'
  | 'anchor'
  | 'position'
  | 'width'
  | 'background'
  | 'baseline'
  | 'startX'
  | 'startZ'
  | 'endX'
  | 'endZ'
  | 'finishA'
  | 'finishB';
export type ArrangeDraft = Partial<Record<ArrangeFieldKey, string>>;
export interface ArrangeField {
  key: ArrangeFieldKey;
  label: string;
  value: string;
  numeric?: boolean;
  secondary?: boolean;
  placeholder?: string;
  choices?: readonly { value: string; label: string }[];
  disabled?: boolean;
  /** The field's help, behind its "?" (rpg-project#579). */
  help?: string;
  /** A self-contained picker: it commits on change as its own history entry,
   * and Cancel does not cover it (S5-Q1). */
  applyOnChange?: true;
}
const display = (value: number): string => String(Number(value.toFixed(6)));
const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** Form tokens are display only. Only keys explicitly changed enter the patch. */
export function arrangeFields(
  selection: StudioArrangeSelection,
  facingNames: readonly string[],
  draft: ArrangeDraft = {}
): ArrangeField[] {
  const numeric = (
    key: ArrangeFieldKey,
    label: string,
    value: number
  ): ArrangeField => ({ key, label, value: display(value), numeric: true });
  switch (selection.kind) {
    case 'scene': {
      const values = selection.preview ?? selection;
      return [
        numeric('x', 'World X', values.position.x),
        numeric('y', 'World Y', values.position.y),
        numeric('z', 'World Z', values.position.z),
        numeric(
          'yaw',
          selection.rootCount === 1
            ? 'Y facing (degrees)'
            : 'Rotate by (degrees)',
          values.yaw === undefined ? 0 : degrees(values.yaw)
        ),
        ...(values.height.kind === 'absent'
          ? []
          : [
              {
                key: 'heightScale' as const,
                label: 'Height scale (%)',
                numeric: true,
                value:
                  values.height.kind === 'value'
                    ? display(values.height.scale * 100)
                    : '',
                placeholder: 'Mixed',
              },
            ]),
      ];
    }
    case 'wall': {
      const values = selection.preview ?? selection;
      return [
        {
          key: 'startX',
          label: 'Start X',
          value: String(values.line.start.x),
          numeric: true,
        },
        {
          key: 'startZ',
          label: 'Start Z',
          value: String(values.line.start.z),
          numeric: true,
        },
        {
          key: 'endX',
          label: 'End X',
          value: String(values.line.end.x),
          numeric: true,
        },
        {
          key: 'endZ',
          label: 'End Z',
          value: String(values.line.end.z),
          numeric: true,
        },
        {
          ...numeric('x', 'Wall midpoint X', values.midpoint.x),
          secondary: true,
        },
        {
          ...numeric('z', 'Wall midpoint Z', values.midpoint.z),
          secondary: true,
        },
        numeric('yaw', 'Y facing (degrees)', degrees(values.yaw)),
        numeric('length', 'Wall length', values.length),
        {
          key: 'anchor',
          label: 'Fixed endpoint',
          value: 'start',
          choices: [
            { value: 'start', label: 'Start' },
            { value: 'end', label: 'End' },
          ],
        },
        numeric('height', 'Appearance height', values.appearance.height),
        numeric(
          'thickness',
          'Appearance thickness',
          values.appearance.thickness
        ),
        numeric(
          'elevation',
          'Appearance elevation',
          values.appearance.elevation
        ),
      ];
    }
    case 'door':
      return [
        numeric(
          'position',
          'Along wall position',
          (selection.preview ?? selection).position
        ),
        numeric('width', 'Door width', (selection.preview ?? selection).width),
      ];
    case 'label':
      return [
        { key: 'text', label: 'Rename label', value: selection.label.text },
        numeric('x', 'Label world X', selection.label.location.x),
        numeric('z', 'Label world Z', selection.label.location.z),
        ...(selection.region
          ? [
              {
                key: 'background' as const,
                label: 'Background light (%)',
                numeric: true,
                help: STUDIO_ONLY_HELP,
                value: selection.region.lighting
                  ? display(selection.region.lighting.background * 100)
                  : '',
                placeholder: '100',
              },
            ]
          : []),
      ];
    case 'actor': {
      const ref = draft.appearanceRef ?? selection.monster.appearanceRef ?? '';
      const { current, family, styles, skinPalettes } =
        npcAppearanceOptions(ref);
      const choices = (
        key: 'style' | 'skinPalette'
      ): { value: string; label: string }[] =>
        current?.look
          ? (key === 'style' ? styles : skinPalettes).map((value) => ({
              value,
              label: value,
            }))
          : [
              {
                value: '',
                label: !ref
                  ? 'Choose an NPC model first'
                  : current
                    ? 'Single-look model'
                    : 'Model unavailable',
              },
            ];
      return [
        {
          key: 'mapName',
          label: 'Map name',
          value: selection.mapName ?? '',
          placeholder: 'Rules name when unset',
          help: 'Map name is an authoring label, not a stat-block change.',
        },
        {
          key: 'appearanceFamily',
          label: 'NPC appearance',
          applyOnChange: true,
          value: family?.ref ?? ref,
          choices: [
            { value: '', label: 'Use rules default appearance' },
            ...(ref && !current
              ? [{ value: ref, label: `Unavailable: ${ref}` }]
              : []),
            ...NPC_APPEARANCE_FAMILIES.map((entry) => ({
              value: entry.ref,
              label: `${entry.defaultLook.displayName} — ${entry.defaultLook.sourcePack}`,
            })),
          ],
        },
        {
          key: 'appearanceStyle',
          label: 'Style',
          applyOnChange: true,
          value: current?.look?.style ?? '',
          choices: choices('style'),
          disabled: !current?.look,
        },
        {
          key: 'appearanceSkinPalette',
          label: 'Skin palette',
          applyOnChange: true,
          value: current?.look?.skinPalette ?? '',
          choices: choices('skinPalette'),
          disabled: !current?.look,
        },
        numeric('q', 'Starting hex q', selection.startingCell.location.q),
        numeric('r', 'Starting hex r', selection.startingCell.location.r),
        {
          key: 'facing',
          label: 'Starting facing',
          applyOnChange: true,
          value: selection.startingCell.facing ?? '',
          choices: [
            { value: '', label: 'Asset default' },
            ...facingNames.map((value) => ({ value, label: value })),
          ],
        },
      ];
    }
    case 'start':
      return [
        numeric('q', 'Starting hex q', selection.cell.q),
        numeric('r', 'Starting hex r', selection.cell.r),
      ];
    case 'hex':
      // Read-only in S0: the play contract is the dialect's, not the form's.
      return [];
    case 'cast':
      // The cast member's own form edits it, not the arrange form.
      return [];
  }
}

/** Compose the entire dirty noun before invoking the owner; never section commits. */
export function arrangeIntent(
  selection: StudioArrangeSelection,
  draft: ArrangeDraft
): StudioArrangeIntent | null {
  if (
    Object.keys(draft).length === 0 ||
    Object.keys(draft).every((key) => key === 'anchor')
  )
    return null;
  const number = (key: ArrangeFieldKey): number => {
    const token = draft[key];
    // Number(''), incomplete exponent/sign and Infinity are not authoring values.
    if (token === undefined || !token.trim() || !Number.isFinite(Number(token)))
      throw new Error('Enter finite numeric values before applying.');
    return Number(token);
  };
  const axes = (
    keys: readonly ('x' | 'y' | 'z')[]
  ): Partial<{ x: number; y: number; z: number }> => {
    const patch: Partial<{ x: number; y: number; z: number }> = {};
    for (const key of keys)
      if (draft[key] !== undefined) patch[key] = number(key);
    return patch;
  };
  const cell = (current: {
    q: number;
    r: number;
  }): { q: number; r: number } => {
    const location = {
      q: draft.q === undefined ? current.q : number('q'),
      r: draft.r === undefined ? current.r : number('r'),
    };
    if (!Number.isInteger(location.q) || !Number.isInteger(location.r))
      throw new Error('Starting hex coordinates must be integers.');
    return location;
  };
  switch (selection.kind) {
    case 'door':
      return {
        kind: 'door-edit',
        target: selection.target,
        ...(draft.position !== undefined
          ? { position: number('position') }
          : {}),
        ...(draft.width !== undefined ? { width: number('width') } : {}),
      };
    case 'scene':
      return {
        kind: 'scene-edit',
        target: selection.target,
        ...(draft.x !== undefined ||
        draft.y !== undefined ||
        draft.z !== undefined
          ? { position: axes(['x', 'y', 'z']) }
          : {}),
        ...(draft.yaw !== undefined
          ? {
              rotation: {
                kind: selection.rootCount === 1 ? 'absolute' : 'relative',
                radians: (number('yaw') * Math.PI) / 180,
              },
            }
          : {}),
        ...(draft.heightScale !== undefined
          ? { heightScale: number('heightScale') / 100 }
          : {}),
      };
    case 'wall': {
      const appearance: Partial<StructuralWall['appearance']> = {};
      for (const key of ['height', 'thickness', 'elevation'] as const)
        if (draft[key] !== undefined) appearance[key] = number(key);
      if (draft.assetRef !== undefined) appearance.assetRef = draft.assetRef;
      return {
        kind: 'wall-edit',
        target: selection.target,
        ...(draft.startX !== undefined || draft.startZ !== undefined
          ? {
              start: {
                ...(draft.startX !== undefined ? { x: number('startX') } : {}),
                ...(draft.startZ !== undefined ? { z: number('startZ') } : {}),
              },
            }
          : {}),
        ...(draft.endX !== undefined || draft.endZ !== undefined
          ? {
              end: {
                ...(draft.endX !== undefined ? { x: number('endX') } : {}),
                ...(draft.endZ !== undefined ? { z: number('endZ') } : {}),
              },
            }
          : {}),
        ...(draft.x !== undefined || draft.z !== undefined
          ? { midpoint: axes(['x', 'z']) }
          : {}),
        ...(draft.yaw !== undefined
          ? { yaw: (number('yaw') * Math.PI) / 180 }
          : {}),
        ...(draft.length !== undefined
          ? {
              length: {
                value: number('length'),
                anchor: draft.anchor === 'end' ? 'end' : 'start',
              },
            }
          : {}),
        ...(Object.keys(appearance).length ? { appearance } : {}),
        ...(draft.finishA !== undefined || draft.finishB !== undefined
          ? {
              wallFinishes: {
                ...(draft.finishA !== undefined
                  ? { 'positive-z': draft.finishA || null }
                  : {}),
                ...(draft.finishB !== undefined
                  ? { 'negative-z': draft.finishB || null }
                  : {}),
              },
            }
          : {}),
      };
    }
    case 'label': {
      let regionLighting: Extract<
        StudioArrangeIntent,
        { kind: 'label-edit' }
      >['regionLighting'];
      if (draft.background !== undefined || draft.baseline !== undefined) {
        if (!selection.region)
          throw new Error('Select a linked region label to edit lighting.');
        if (draft.baseline === 'reset') {
          regionLighting = { regionId: selection.region.id, value: null };
        } else {
          const background = number('background');
          if (background < 0 || background > 100)
            throw new Error(
              'Background light must be between 0 and 100 percent.'
            );
          regionLighting = {
            regionId: selection.region.id,
            value: { background: background / 100 },
          };
        }
      }
      if (
        draft.text !== undefined &&
        (!draft.text.trim() || draft.text.length > 120)
      )
        throw new Error(
          'Enter a nonblank label name of at most 120 characters.'
        );
      return {
        kind: 'label-edit',
        target: selection.target,
        ...(draft.text !== undefined ? { text: draft.text } : {}),
        ...(draft.x !== undefined || draft.z !== undefined
          ? { location: axes(['x', 'z']) }
          : {}),
        ...(regionLighting ? { regionLighting } : {}),
      };
    }
    case 'actor':
      return {
        kind: 'actor-start',
        target: selection.target,
        ...(draft.mapName !== undefined
          ? { mapName: draft.mapName.trim() || null }
          : {}),
        ...(draft.appearanceRef !== undefined
          ? { appearanceRef: draft.appearanceRef || null }
          : {}),
        ...(draft.q !== undefined || draft.r !== undefined
          ? { location: cell(selection.startingCell.location) }
          : {}),
        ...(draft.facing !== undefined
          ? {
              facing:
                draft.facing === ''
                  ? { kind: 'default' }
                  : { kind: 'compass', value: draft.facing },
            }
          : {}),
      };
    case 'start':
      return {
        kind: 'start-position',
        target: selection.target,
        location: cell(selection.cell),
      };
    case 'hex':
    case 'cast':
      return null;
  }
}

const reasons: Record<
  Extract<RegionResolution, { status: 'unresolved' }>['reason'],
  string
> = {
  unbound:
    'No enclosure accepted. Use enclosing walls or define an explicit area.',
  open: 'The enclosure is open. Repair the walls or define an explicit area.',
  'seed-on-boundary':
    'The label is on a boundary. Move it inside the intended area.',
  'outside-bound-enclosure':
    'The label is outside its accepted enclosure. Move it back or explicitly rebind.',
  'boundary-changed':
    'The accepted boundary changed. Repair it or explicitly rebind.',
  'unsupported-geometry':
    'This wall geometry is unsupported. Define an explicit area.',
  'uncertain-geometry':
    'The geometry cannot be certified. Define an explicit area.',
  'duplicate-room-label':
    'Multiple room labels claim this enclosure. Move or delete a linked pair.',
  overlap: 'Regions overlap. Edit their definitions; no region takes priority.',
  'empty-explicit': 'The explicit area is empty. Paint or select cells.',
};

export function regionStatus(
  region: Readonly<AuthoringRegion>,
  resolution?: RegionResolution
): string {
  const mode = region.boundary.kind === 'automatic' ? 'Automatic' : 'Explicit';
  return resolution?.status === 'resolved'
    ? `${mode} · Resolved`
    : `${mode} · Unresolved · ${resolution?.status === 'unresolved' ? reasons[resolution.reason] : 'Boundary unavailable.'}`;
}

/** The name an inspector heading gives one selected thing. */
export function selectionName(
  selection: StudioArrangeSelection,
  session: EncounterStudioSession
): string {
  switch (selection.kind) {
    case 'scene': {
      const scene = session.document.draft.scene;
      const root = [...scene.items, ...scene.groups].find(
        (entity) => entity.id === selection.rootIds[0]
      );
      return selection.rootCount === 1
        ? root?.label || root?.id || 'Scenery'
        : `${selection.rootCount} scenery roots`;
    }
    case 'wall':
      return selection.wall.label || selection.wall.id;
    case 'door':
      // Names, not ids (rpg-project#579): the catalog's display name; the
      // ref is one click away behind Copy model id.
      return `Door · ${resolveWorldAsset(selection.door.assetRef)?.displayName ?? 'unknown model'}`;
    case 'label':
      return selection.label.text;
    case 'actor':
      return (
        documentPlacementNames(session.document).get(selection.monster.id) ??
        selection.mapName ??
        paletteNameForRef(selection.monster.ref)
      );
    case 'start':
      return 'Party start';
    case 'hex':
      return `Hex ${selection.cell.q}, ${selection.cell.r}`;
    case 'cast':
      return selection.member.name;
  }
}
