import { parseRef } from '@/utils/refs';
import { objectShape, rejectUnknownKeys } from './strictShape';

export const TEMPLATE_ABILITIES = [
  'str',
  'dex',
  'con',
  'int',
  'wis',
  'cha',
] as const;
export type TemplateAbility = (typeof TEMPLATE_ABILITIES)[number];
/** Authored TemplateSpec only. HP, AC and other derived totals have no fields. */
export interface MonsterTemplate {
  base: string;
  name?: string;
  abilities?: Partial<Record<TemplateAbility, number>>;
  hitDice?: string;
  armor?: string;
  proficiency?: number;
  skills?: string[];
  actions?: string[];
  /** Weapon refs added to or dropped from the base stat block's actions.
   * Their authored order is significant to the toolkit and is preserved. */
  addActions?: string[];
  dropActions?: string[];
  experience?: number;
}
export type SiteTemplates = Record<string, MonsterTemplate>;
const KEYS = [
  'base',
  'name',
  'abilities',
  'hitDice',
  'armor',
  'proficiency',
  'skills',
  'actions',
  'addActions',
  'dropActions',
  'experience',
];
function fail(path: string, message: string): never {
  throw new Error(`${path}: ${message}`);
}
function typedRef(
  value: unknown,
  type: 'monsters' | 'armor' | 'weapons',
  path: string
): string {
  if (typeof value !== 'string') fail(path, 'must be a reference string');
  const ref = parseRef(value);
  if (!ref || ref.module !== 'dnd5e' || ref.type !== type)
    fail(path, `must be a dnd5e:${type} reference`);
  return value;
}
/** Mirrors the published encounter TemplateSpec shape. Existence, shadowing,
 * derived numbers and rulebook legality remain authoring-service decisions. */
export function validateMonsterTemplates(value: unknown): SiteTemplates {
  const raw = objectShape(value, 'templates');
  const entries: [string, MonsterTemplate][] = [];
  for (const [id, value] of Object.entries(raw)) {
    const path = `templates.${id}`;
    const ref = parseRef(`dnd5e:monsters:${id}`);
    if (!ref || ref.idParts.length !== 1)
      fail(path, 'id must be one reference segment');
    const block = objectShape(value, path);
    rejectUnknownKeys(block, KEYS, path);
    const base = typedRef(block.base, 'monsters', `${path}.base`);
    if (Object.hasOwn(raw, parseRef(base)!.id))
      fail(
        `${path}.base`,
        'templates derive from the rulebook, not from another local template'
      );
    const template: MonsterTemplate = { base };
    for (const key of ['name', 'hitDice', 'armor'] as const)
      if (Object.hasOwn(block, key)) {
        const text = block[key];
        if (typeof text !== 'string')
          fail(`${path}.${key}`, 'must be a string');
        if (key === 'armor' && text) typedRef(text, 'armor', `${path}.armor`);
        if (key === 'hitDice' && text) {
          const dice = /^([0-9]+)d([0-9]+)$/.exec(text);
          if (!dice || !/[1-9]/.test(dice[1]) || !/[1-9]/.test(dice[2]))
            fail(
              `${path}.hitDice`,
              'must be NdM with positive counts, such as 2d8'
            );
        }
        template[key] = text;
      }
    if (Object.hasOwn(block, 'abilities')) {
      const scores = objectShape(block.abilities, `${path}.abilities`);
      rejectUnknownKeys(scores, TEMPLATE_ABILITIES, `${path}.abilities`);
      template.abilities = {};
      for (const [key, score] of Object.entries(scores)) {
        if (
          typeof score !== 'number' ||
          !Number.isInteger(score) ||
          score < 1 ||
          score > 30
        )
          fail(`${path}.abilities.${key}`, 'must be an integer from 1 to 30');
        template.abilities[key as TemplateAbility] = score;
      }
    }
    for (const key of ['proficiency', 'experience'] as const)
      if (Object.hasOwn(block, key)) {
        const number = block[key];
        if (
          typeof number !== 'number' ||
          !Number.isSafeInteger(number) ||
          number < 0
        )
          fail(`${path}.${key}`, 'must be a nonnegative representable integer');
        template[key] = number;
      }
    for (const key of [
      'skills',
      'actions',
      'addActions',
      'dropActions',
    ] as const)
      if (Object.hasOwn(block, key)) {
        const values = block[key];
        if (!Array.isArray(values)) fail(`${path}.${key}`, 'must be a list');
        template[key] = values.map((item, index) => {
          const at = `${path}.${key}[${index}]`;
          if (typeof item !== 'string') fail(at, 'must be a string');
          if (key !== 'skills') return typedRef(item, 'weapons', at);
          if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(item))
            fail(at, 'must be a lowercase skill id');
          return item;
        });
      }
    entries.push([id, template]);
  }
  return Object.fromEntries(entries);
}
