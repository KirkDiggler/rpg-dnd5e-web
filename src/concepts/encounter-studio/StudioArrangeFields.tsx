import {
  NPC_APPEARANCE_CATALOG,
  resolveNpcAppearance,
} from '@/generated/npcAppearanceCatalog';
import type {
  AuthoringRegion,
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
  | 'assetRef'
  | 'anchor'
  | 'position'
  | 'width'
  | 'background'
  | 'baseline';
export type ArrangeDraft = Partial<Record<ArrangeFieldKey, string>>;
export interface ArrangeField {
  key: ArrangeFieldKey;
  label: string;
  value: string;
  numeric?: boolean;
  placeholder?: string;
  choices?: readonly { value: string; label: string }[];
}
const display = (value: number): string => String(Number(value.toFixed(6)));
const degrees = (radians: number): number => (radians * 180) / Math.PI;

/** Form tokens are display only. Only keys explicitly changed enter the patch. */
export function arrangeFields(
  selection: StudioArrangeSelection,
  facingNames: readonly string[]
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
        numeric('x', 'Wall midpoint X', values.midpoint.x),
        numeric('z', 'Wall midpoint Z', values.midpoint.z),
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
                value: selection.region.lighting
                  ? display(selection.region.lighting.background * 100)
                  : '',
                placeholder: '100',
              },
            ]
          : []),
      ];
    case 'actor':
      return [
        {
          key: 'appearanceRef',
          label: 'NPC appearance',
          value: selection.monster.appearanceRef ?? '',
          choices: [
            { value: '', label: 'Use rules default appearance' },
            ...(selection.monster.appearanceRef &&
            !resolveNpcAppearance(selection.monster.appearanceRef)
              ? [
                  {
                    value: selection.monster.appearanceRef,
                    label: `Unavailable: ${selection.monster.appearanceRef}`,
                  },
                ]
              : []),
            ...NPC_APPEARANCE_CATALOG.map((appearance) => ({
              value: appearance.assetRef,
              label: `${appearance.displayName} — ${appearance.sourcePack}`,
            })),
          ],
        },
        numeric('q', 'Starting hex q', selection.startingCell.location.q),
        numeric('r', 'Starting hex r', selection.startingCell.location.r),
        {
          key: 'facing',
          label: 'Starting facing',
          value: selection.startingCell.facing ?? '',
          choices: [
            { value: '', label: 'Asset default' },
            ...facingNames.map((value) => ({ value, label: value })),
          ],
        },
      ];
    case 'start':
      return [
        numeric('q', 'Starting hex q', selection.cell.q),
        numeric('r', 'Starting hex r', selection.cell.r),
      ];
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
