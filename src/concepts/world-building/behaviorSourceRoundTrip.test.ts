import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { setRegionLighting } from './regionEdits';
import { parseRoomDocumentJson, stringifyRoomDraft } from './roomDraft';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import { scopeFrom } from './siteScope';

const fixtures = 'src/concepts/world-building/fixtures';

// This is source preservation, not a client-side behavior compiler. The joined
// server check consumes the opt-in exports through the real authoring endpoint.
function roundTrip(source: string, name: string) {
  const before = parse(source);
  const imported = decodeSingleRoomDungeon(source);
  const region = imported.draft.room.regions[0].id;
  const edited = setRegionLighting(imported.draft, region, 0.6);
  const saved = stringifyRoomDraft(edited, scopeFrom(imported));
  const loaded = parseRoomDocumentJson(saved);
  const exported = encodeSingleRoomDungeon({
    key: imported.key,
    draft: loaded.draft,
    ...loaded.scope,
  });
  const after = parse(exported);
  expect(after.behaviorDefinitions).toEqual(before.behaviorDefinitions);
  expect(after.factions).toEqual(before.factions);
  expect(after.room.room.monsterBindings).toEqual(
    before.room.room.monsterBindings
  );
  expect(
    after.room.room.regions.find((r: { id: string }) => r.id === region)
      .lighting
  ).toEqual({ intensity: 0.6 });
  expect(after.authorNotes).toEqual(before.authorNotes);
  expect(after).not.toHaveProperty('behaviorProgress');
  expect(encodeSingleRoomDungeon(decodeSingleRoomDungeon(exported))).toBe(
    exported
  );
  const output = process.env.BEHAVIOR_EXPORT_DIR;
  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, `${name}.yaml`), exported);
  }
  return after;
}

describe('canonical behavior source through ordinary Studio editing', () => {
  for (const [name, file] of [
    ['patrol', 'behavior-patrol-consumer.yaml'],
    ['castle', 'canonical-behavior-castle.yaml'],
  ]) {
    it(`preserves complete ${name} definitions and ordered bindings through edit/save/reload/export`, () => {
      roundTrip(readFileSync(join(fixtures, file), 'utf8'), name);
    });
  }

  it('keeps changed route values and explicitly empty versus absent attachments', () => {
    const source = parse(
      readFileSync(join(fixtures, 'behavior-patrol-consumer.yaml'), 'utf8')
    );
    source.room.room.monsterBindings.west.behaviors[1].items.push({
      q: 8,
      r: 1,
    });
    source.room.room.monsterBindings.court.behaviors = [];
    let after = roundTrip(stringify(source), 'three-items-empty');
    expect(after.room.room.monsterBindings.west.behaviors[1].items).toEqual([
      { q: 6, r: 1 },
      { q: 2, r: 0 },
      { q: 8, r: 1 },
    ]);
    expect(after.room.room.monsterBindings.court).toHaveProperty(
      'behaviors',
      []
    );
    delete source.room.room.monsterBindings.court.behaviors;
    after = roundTrip(stringify(source), 'three-items-absent');
    expect(after.room.room.monsterBindings.court).not.toHaveProperty(
      'behaviors'
    );
  });

  it('carries false, zero, empty strings and unrelated unread source without coercion', () => {
    const source = parse(
      readFileSync(join(fixtures, 'behavior-patrol-consumer.yaml'), 'utf8')
    );
    source.behaviorDefinitions.patrol.parameters.push(
      { name: 'flag', kind: 'bool', required: true },
      { name: 'count', kind: 'int', required: true, min: 0, max: 2 },
      { name: 'label', kind: 'string', required: true }
    );
    for (const actor of ['west', 'court']) {
      Object.assign(source.room.room.monsterBindings[actor].behaviors[1].with, {
        flag: false,
        count: 0,
        label: '',
      });
    }
    roundTrip(stringify(source), 'supplied-values');
    source.authorNotes = { future: ['keep this', 0, false] };
    source.room.room.monsterBindings.west.authorNotes = { untouched: true };
    // Unknown author metadata is preserved, not asserted to be server-valid.
    roundTrip(stringify(source), 'unread-metadata');
  });
});
