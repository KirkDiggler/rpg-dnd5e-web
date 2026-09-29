import { describe, expect, it } from 'vitest';
import {
  createRoomDraft,
  parseRoomDocumentJson,
  parseRoomDraftJson,
  stringifyRoomDraft,
} from './roomDraft';
import { createEmptyScene } from './sceneState';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import type { SiteScope } from './siteScope';

const draft = createRoomDraft(createEmptyScene('room'), 'room');
const secret: SiteScope = {
  concealments: {
    vault: {
      checks: [{ ability: 'perception', dc: 15 }],
      notice: [{ ability: 'investigation', dc: 12 }],
      cells: [{ q: 1, r: 0 }],
    },
  },
};

describe('standalone site nouns persist without unrelated policies', () => {
  it.each([secret, { tables: { drill: {} } } satisfies SiteScope])(
    'keeps a standalone scope in local storage',
    (scope) => {
      const json = stringifyRoomDraft(draft, scope);
      expect(parseRoomDocumentJson(json).scope).toEqual(scope);
      expect(() => parseRoomDraftJson(json)).toThrow(/carries a site scope/);
    }
  );
  it('omits an empty normalized scope', () => {
    expect(
      JSON.parse(stringifyRoomDraft(draft, { concealments: {} }))
    ).not.toHaveProperty('scope');
  });
  it('round-trips the authoring scope across local draft and published YAML', () => {
    const scope = {
      ...secret,
      intel: [{ id: 'map', reveals: { concealment: 'vault' } }],
    };
    const loaded = parseRoomDocumentJson(stringifyRoomDraft(draft, scope));
    const yaml = encodeSingleRoomDungeon({
      key: 'vault-site',
      draft: loaded.draft,
      ...loaded.scope,
    });
    const decoded = decodeSingleRoomDungeon(yaml);
    expect(decoded.concealments).toEqual(scope.concealments);
    expect(decoded.intel).toEqual(scope.intel);
  });
});
