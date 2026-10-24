import { create } from '@bufbuild/protobuf';
import { CharacterDataSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { presentCharacterData } from './characterPresentation';
import { characterStatusEntries } from './characterStatusEntries';
const feature = {
  name: 'Bardic Inspiration',
  detail: 'Provider feature detail',
  ref: { module: 'dnd5e', type: 'features', id: 'bardic_inspiration' },
};
const pool = {
  key: 'inspiration',
  name: 'Bardic Inspiration',
  current: 3,
  maximum: 3,
};
describe('compact character status projection', () => {
  it('joins only an explicit resource key, retaining all facts in one inspectable entry', () => {
    const character = presentCharacterData(
      create(CharacterDataSchema, {
        features: [{ ...feature, resourceKey: pool.key }],
        resources: [pool],
      })
    );
    const entries = characterStatusEntries(character);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      name: feature.name,
      detail: feature.detail,
      kind: 'feature',
      resource: pool,
      resourceMissing: false,
    });
    expect(entries[0].art.src).toContain('Fortified_01');
  });
  it('does not join by matching names or invent a zero when resource data is missing', () => {
    const unlinked = characterStatusEntries(
      presentCharacterData(
        create(CharacterDataSchema, { features: [feature], resources: [pool] })
      )
    );
    expect(unlinked).toHaveLength(2);
    expect(unlinked[0].resource).toBeUndefined();
    const missing = characterStatusEntries(
      presentCharacterData(
        create(CharacterDataSchema, {
          features: [{ ...feature, resourceKey: pool.key }],
        })
      )
    );
    expect(missing[0].resourceMissing).toBe(true);
    expect(missing[0].resource).toBeUndefined();
  });
  it('preserves conflicting resource rows instead of choosing one silently', () => {
    const entries = characterStatusEntries(
      presentCharacterData(
        create(CharacterDataSchema, {
          features: [{ ...feature, resourceKey: pool.key }],
          resources: [pool, { ...pool, current: 1 }],
        })
      )
    );
    expect(entries).toHaveLength(3);
    expect(entries[0].resourceMissing).toBe(true);
    expect(entries.slice(1).map((entry) => entry.resource?.current)).toEqual([
      3, 1,
    ]);
  });
  it('keeps zero counts, source disclosure and unknown artwork honest', () => {
    const entries = characterStatusEntries(
      presentCharacterData(
        create(CharacterDataSchema, {
          conditions: [
            {
              ref: { module: 'other', type: 'conditions', id: 'inspired' },
              name: 'Unknown effect',
              detail: 'Supplied explanation',
              sourceMember: 'mira',
            },
          ],
          resources: [{ ...pool, current: 0 }],
        })
      )
    );
    expect(entries[0]).toMatchObject({
      kind: 'condition',
      sourceMember: 'mira',
      detail: 'Supplied explanation',
      art: { src: '', fallback: '?' },
    });
    expect(entries[1].resource?.current).toBe(0);
  });
});
