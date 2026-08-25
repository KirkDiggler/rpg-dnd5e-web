import { create } from '@bufbuild/protobuf';
import {
  CharacterDataSchema,
  ConditionViewSchema,
  FeatureViewSchema,
  RefSchema,
  ResourceViewSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import {
  GENERIC_CHARACTER_PRESENTATION,
  presentCharacterData,
} from './characterPresentation';

describe('character presentation', () => {
  it('maps authoritative refs to presentation only and preserves provider names and details verbatim', () => {
    const data = create(CharacterDataSchema, {
      features: [
        create(FeatureViewSchema, {
          ref: create(RefSchema, {
            module: 'dnd5e',
            type: 'features',
            id: 'action_surge',
          }),
          name: 'Provider Action Surge',
          detail: 'Provider-authored detail — unchanged.',
          resourceKey: 'action_surge',
        }),
      ],
      conditions: [
        create(ConditionViewSchema, {
          ref: create(RefSchema, {
            module: 'dnd5e',
            type: 'conditions',
            id: 'fighting_style_dueling',
          }),
          name: 'Provider Dueling',
          detail: 'Exact provider condition detail.',
          sourceMember: 'fighter-2',
        }),
      ],
    });

    const presented = presentCharacterData(data);

    expect(presented.features[0]).toMatchObject({
      name: 'Provider Action Surge',
      detail: 'Provider-authored detail — unchanged.',
      resourceKey: 'action_surge',
    });
    expect(presented.features[0]?.icon).not.toBe(
      GENERIC_CHARACTER_PRESENTATION.icon
    );
    expect(presented.conditions[0]).toMatchObject({
      name: 'Provider Dueling',
      detail: 'Exact provider condition detail.',
      sourceMember: 'fighter-2',
    });
  });

  it('uses an honest generic icon/tone for unknown or absent refs without deriving a label', () => {
    const data = create(CharacterDataSchema, {
      features: [
        create(FeatureViewSchema, {
          ref: create(RefSchema, {
            module: 'homebrew-campaign',
            type: 'features',
            id: 'future_feature',
          }),
          name: 'Server Name Ω',
          detail: '2 uses remain according to the provider.',
        }),
        create(FeatureViewSchema, {
          name: 'Unreferenced Provider Feature',
          detail: '',
        }),
      ],
    });

    const presented = presentCharacterData(data);

    expect(presented.features).toEqual([
      expect.objectContaining({
        name: 'Server Name Ω',
        detail: '2 uses remain according to the provider.',
        ...GENERIC_CHARACTER_PRESENTATION,
      }),
      expect.objectContaining({
        name: 'Unreferenced Provider Feature',
        detail: '',
        ...GENERIC_CHARACTER_PRESENTATION,
      }),
    ]);
  });

  it('passes resource names and counts through unchanged and uses the exact generic fallback without interpreting the opaque key', () => {
    const data = create(CharacterDataSchema, {
      resources: [
        create(ResourceViewSchema, {
          // ResourceView has no full Ref. Even a familiar-looking key must not
          // opt into special presentation or be treated as a rules identity.
          key: 'action_surge',
          name: 'Provider Resource Name',
          current: 7,
          maximum: 11,
        }),
      ],
    });

    expect(presentCharacterData(data).resources).toEqual([
      expect.objectContaining({
        key: 'action_surge',
        name: 'Provider Resource Name',
        current: 7,
        maximum: 11,
        ...GENERIC_CHARACTER_PRESENTATION,
      }),
    ]);
  });
});
