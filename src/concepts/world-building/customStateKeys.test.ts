import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { exportDraftYaml, readDraftYaml } from '../encounter-studio/draftFile';
import castle from '../encounter-studio/fixtures/the-mad-king-states.yaml?raw';
import { factionLayers, layeredOrders } from './layeredOrders';
import { addMonsterAnswerEntry } from './monsterOrderEdits';
import {
  addSiteAnswerEntry,
  addSiteTableAnswerEntry,
  patchSiteAnswerEntry,
  removeSiteAnswerEntry,
} from './sitePolicyEdits';

describe('recipe-picked keys are data, never object prototype properties (#1384 review)', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'preserves %s through import, read-back and export',
    (key) => {
      const file = parse(castle);
      file.tables['answer-the-gate'] = {
        ...file.tables['answer-the-gate'],
        [key]: [{ hold: {} }],
      };
      for (const id of ['reserve-1', 'reserve-2']) {
        file.room.room.monsterBindings[
          id
        ].states.waiting.transitions[0].do.push({ pick: key });
      }
      const read = readDraftYaml(stringify(file));
      if (!read.ok) throw new Error(read.refusal);
      expect(Object.hasOwn(read.scope.tables!['answer-the-gate'], key)).toBe(
        true
      );
      expect(layeredOrders(read, 'reserve-1')[key].rows).toEqual([
        { hold: {} },
      ]);
      expect(layeredOrders(read, 'reserve-1')[key].source).toEqual({
        kind: 'table',
        id: 'answer-the-gate',
      });
      expect(
        factionLayers(read.scope, { id: 'garrison', table: 'answer-the-gate' })[
          key
        ]?.rows
      ).toEqual([{ hold: {} }]);
      const exported = parse(exportDraftYaml(read, read.key));
      expect(Object.hasOwn(exported.tables['answer-the-gate'], key)).toBe(true);
      expect(exported.tables['answer-the-gate'][key]).toEqual([{ hold: {} }]);
    }
  );
  it.each(['__proto__', 'constructor', 'toString'])(
    'adds and edits %s without reading inherited values as rows',
    (key) => {
      let scope = addSiteAnswerEntry(
        { factions: [{ id: 'garrison' }] },
        'garrison',
        key
      );
      expect(Object.hasOwn(scope.factions![0].on!, key)).toBe(true);
      expect(scope.factions![0].on![key]).toEqual([{ hold: {} }]);
      scope = patchSiteAnswerEntry(scope, 'garrison', key, 0, {
        attack: 'enemy',
      });
      expect(scope.factions![0].on![key]).toEqual([{ attack: 'enemy' }]);
      scope = removeSiteAnswerEntry(scope, 'garrison', key, 0);
      expect(scope.factions![0].on).toBeUndefined();
      const root = addSiteTableAnswerEntry(
        { tables: { drill: {} } },
        'drill',
        key
      );
      expect(root.tables!.drill[key]).toEqual([{ hold: {} }]);
      expect(addMonsterAnswerEntry(undefined, key)?.on?.[key]).toEqual([
        { hold: {} },
      ]);
    }
  );
});
