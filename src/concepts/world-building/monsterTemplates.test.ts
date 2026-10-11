import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { createPopulatedStudioDocument } from '../encounter-studio/fixtures/studioDocument';
import { validateMonsterTemplates } from './monsterTemplates';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  stringifyRoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { scopeFrom, validateSiteScope } from './siteScope';

const guard = {
  base: 'dnd5e:monsters:human',
  name: 'Castle Guard',
  abilities: { str: 13, con: 12, wis: 11 },
  hitDice: '2d8',
  armor: 'dnd5e:armor:chain-shirt',
  skills: ['perception'],
  actions: ['dnd5e:weapons:spear'],
  proficiency: 0,
  experience: 0,
};
describe('authored stat blocks through the shared scope and codecs', () => {
  it('round-trips complete populated source without losing templates, actors or other scope', () => {
    const document = createPopulatedStudioDocument();
    document.scope.templates = {
      Guard_Elite: guard,
      cook: {
        base: 'dnd5e:monsters:human',
        name: 'Castle Cook',
        actions: ['dnd5e:weapons:dagger'],
      },
    };
    document.draft.room.monsterDeclarations[0].ref =
      'dnd5e:monsters:Guard_Elite';
    const before = structuredClone(document);
    const yaml = encodeSingleRoomDungeon({
      key: 'complete-kitchen',
      draft: document.draft,
      ...document.scope,
    });
    const decoded = decodeSingleRoomDungeon(yaml);
    const stored = parseRoomDocumentJson(
      stringifyRoomDraft(decoded.draft, scopeFrom(decoded))
    );
    expect(stored).toEqual(before);
    const again = encodeSingleRoomDungeon({
      key: decoded.key,
      draft: stored.draft,
      ...stored.scope,
    });
    expect(parse(again)).toEqual(parse(yaml));
    expect(parse(again).templates.Guard_Elite).toEqual(guard);
    expect(document).toEqual(before);
  });
  it('preserves the Kitchen’s neutral-until alarm rule instead of dropping or refusing it', () => {
    const scope = {
      templates: { guard },
      factions: [{ id: 'watch' }],
      dispositions: [
        {
          between: ['watch', 'party'],
          stance: 'neutral',
          until: { fact: 'alarm-raised' },
        },
      ],
    };
    expect(validateSiteScope(scope)).toEqual(scope);
    expect(() =>
      validateSiteScope({
        ...scope,
        dispositions: [{ ...scope.dispositions[0], stance: 'allied' }],
      })
    ).toThrow(/allied/);
  });

  it('carries absent vs explicitly empty overrides and does not resolve unknown rulebook content', () => {
    const input = {
      Custom: {
        base: 'dnd5e:monsters:unknown_base',
        name: '',
        hitDice: '',
        armor: '',
        abilities: {},
        skills: [],
        actions: [],
        proficiency: 0,
        experience: 0,
      },
    };
    expect(validateMonsterTemplates(input)).toEqual(input);
    expect(
      validateMonsterTemplates({ goblin: { base: 'dnd5e:monsters:human' } })
    ).toEqual({ goblin: { base: 'dnd5e:monsters:human' } }); // shadowing is engine-owned
    expect(
      validateMonsterTemplates({
        custom: {
          ...guard,
          armor: 'dnd5e:armor:future-armor',
          actions: ['dnd5e:weapons:future-weapon'],
        },
      })
    ).toMatchObject({ custom: { armor: 'dnd5e:armor:future-armor' } });
  });
  it('keeps absence unchanged, promotes template-only source to v4 and refuses an unsupported envelope', () => {
    const draft = createRoomDraft(createEmptyScene('scene'), 'room');
    const base = encodeSingleRoomDungeon({ key: 'empty', draft });
    expect(parse(base).version).toBe(3);
    expect(base).not.toContain('templates:');
    expect(
      encodeSingleRoomDungeon({ key: 'empty', draft, templates: {} })
    ).toBe(base);
    const withTemplate = parse(
      encodeSingleRoomDungeon({ key: 'empty', draft, templates: { guard } })
    );
    expect(withTemplate.version).toBe(4);
    expect(withTemplate.room.version).toBe(3);
    expect(() =>
      decodeSingleRoomDungeon(stringify({ ...withTemplate, version: 3 }))
    ).toThrow(/templates.*version 4/);
    expect(() =>
      decodeSingleRoomDungeon(
        stringify({
          ...withTemplate,
          play: { ...withTemplate.play, lighting: 'dim' },
        })
      )
    ).toThrow(/play contract/);
  });
  it('does not mutate inputs and safely carries legal prototype-like ids as own properties', () => {
    const input = JSON.parse('{"__proto__":{"base":"dnd5e:monsters:human"}}');
    const output = validateMonsterTemplates(input);
    expect(Object.hasOwn(output, '__proto__')).toBe(true);
    expect(JSON.parse(JSON.stringify(output))).toEqual(input);
    const before = structuredClone(guard),
      result = validateMonsterTemplates({ guard });
    result.guard.abilities!.str = 20;
    result.guard.actions!.push('dnd5e:weapons:dagger');
    expect(guard).toEqual(before);
  });
  it.each([
    { hp: 20 },
    { hitPoints: 20 },
    { armorClass: 15 },
    { speed: { walk: 30 } },
    { abilities: { str: 12.5 } },
    { abilities: { con: 0 } },
    { abilities: { wis: 31 } },
    { abilities: { unknown: 12 } },
    { abilities: null },
    { proficiency: -1 },
    { experience: 1.5 },
    { proficiency: Number.MAX_SAFE_INTEGER + 1 },
    { armor: null },
    { armor: 'dnd5e:weapons:spear' },
    { hitDice: 8 },
    { hitDice: '0d8' },
    { hitDice: '2d0' },
    { hitDice: '2d8+2' },
    { actions: 'dnd5e:weapons:spear' },
    { actions: ['dnd5e:armor:chain-shirt'] },
    { skills: ['Perception'] },
  ])('refuses malformed or unsupported authored fields: %j', (change) => {
    expect(() =>
      validateSiteScope({ templates: { guard: { ...guard, ...change } } })
    ).toThrow(/templates.guard/);
  });
  it('requires a base and refuses local inheritance or unnameable ids without silently rewriting refs', () => {
    expect(() => validateMonsterTemplates({ guard: {} })).toThrow(/base/);
    expect(() => validateMonsterTemplates({ guard: { base: '' } })).toThrow(
      /base/
    );
    expect(() => validateMonsterTemplates({ 'bad:id': guard })).toThrow(
      /one reference segment/
    );
    expect(() =>
      validateMonsterTemplates({
        guard,
        captain: { base: 'dnd5e:monsters:guard' },
      })
    ).toThrow(/not from another local template/);
    expect(validateSiteScope({ templates: {} })).not.toHaveProperty(
      'templates'
    );
  });
});
