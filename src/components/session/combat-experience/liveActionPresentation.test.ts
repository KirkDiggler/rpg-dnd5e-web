// @vitest-environment node
import { create } from '@bufbuild/protobuf';
import {
  DeclarationSchema,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { FeatureViewSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha2/encounter/types_pb';
import { describe, expect, it } from 'vitest';
import { liveActionPresentation } from './liveActionPresentation';
import { organizeDeclarations } from './organizedActionPresentation';

const feature = create(FeatureViewSchema, {
  name: 'Owned feature',
  ref: { module: 'provider', type: 'features', id: 'grant' },
});
const offers: Declaration[] = [
  create(DeclarationSchema, { id: 'attack', verb: Verb.ATTACK }),
  create(DeclarationSchema, { id: 'move', verb: Verb.MOVE }),
  create(DeclarationSchema, {
    id: 'leveled',
    verb: Verb.CAST,
    spell: { ref: 'provider:spells:one', name: 'Cantrip-sounding name' },
  }),
  create(DeclarationSchema, {
    id: 'cantrip',
    verb: Verb.CAST,
    spell: { ref: 'provider:spells:zero', name: 'Unhelpful name' },
    available: false,
  }),
  create(DeclarationSchema, {
    id: 'generic',
    verb: Verb.ACTIVATE,
    ability: { ref: 'provider:combat_abilities:dash', name: 'Owned feature' },
  }),
  create(DeclarationSchema, {
    id: 'feature',
    verb: Verb.ACTIVATE,
    ability: { ref: 'provider:features:grant', name: 'Different display name' },
    available: false,
  }),
  create(DeclarationSchema, {
    id: 'unknown-spell',
    verb: Verb.CAST,
    spell: { ref: 'provider:spells:granted', name: 'Granted spell' },
  }),
  create(DeclarationSchema, { id: 'end', verb: Verb.END_TURN }),
];

describe('live action presentation', () => {
  it('keeps cantrips and owned features direct by exact provider facts, even when unavailable', () => {
    const presentation = liveActionPresentation({
      declarations: offers,
      knownCantrips: ['provider:spells:zero'],
      knownSpells: ['provider:spells:one'],
      features: [feature],
    });
    expect(presentation.quickDeclarationIds).toEqual([
      'attack',
      'move',
      'cantrip',
      'feature',
      'unknown-spell',
    ]);
    const organized = organizeDeclarations(offers, presentation);
    expect(organized.sections.spells.map((d) => d.id)).toEqual(['leveled']);
    expect(organized.sections.abilities.map((d) => d.id)).toEqual(['generic']);
    expect(organized.quick.find((d) => d.id === 'feature')).toBe(offers[5]);
    expect(organized.quick.find((d) => d.id === 'feature')?.available).toBe(
      false
    );
  });

  it('keeps unclassified offers visible while owner metadata is unavailable instead of guessing their kind', () => {
    expect(
      liveActionPresentation({ declarations: offers }).quickDeclarationIds
    ).toEqual([
      'attack',
      'move',
      'leveled',
      'cantrip',
      'generic',
      'feature',
      'unknown-spell',
    ]);
  });

  it('does not invent missing offers and follows the current signed declaration IDs', () => {
    const current = create(DeclarationSchema, {
      ...offers[3],
      id: 'new-cantrip-id',
    });
    expect(
      liveActionPresentation({
        declarations: [current],
        knownCantrips: ['provider:spells:zero', 'provider:spells:not-offered'],
        knownSpells: [],
        features: [feature],
      }).quickDeclarationIds
    ).toEqual(['new-cantrip-id']);
  });
});
