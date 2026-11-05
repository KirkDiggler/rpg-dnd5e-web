// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DUNGEON_SOURCE_STORAGE_KEY,
  MAX_SOURCES,
  dungeonSourceLost,
  dungeonSourceOf,
  forgetDungeonSources,
  loadDungeonSource,
  rememberDungeonSource,
  saveDungeonSource,
} from './dungeonSources';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => forgetDungeonSources());

describe('the files drafts were read from (rpg-project#857)', () => {
  it('the same bytes are the same token; different bytes are not', () => {
    expect(rememberDungeonSource('a: 1\n')).toBe(
      rememberDungeonSource('a: 1\n')
    );
    expect(rememberDungeonSource('a: 1\n')).not.toBe(
      rememberDungeonSource('a: 2\n')
    );
  });

  it('holds at most a few files, the least recently used leaving first', () => {
    const first = rememberDungeonSource('file: 0\n');
    const tokens = Array.from({ length: MAX_SOURCES }, (_, i) =>
      rememberDungeonSource(`file: ${i + 1}\n`)
    );
    expect(dungeonSourceOf(first)).toBeUndefined();
    expect(dungeonSourceLost({ sourceRef: first })).toBe(true);
    // A use keeps a file: the draft's own file is looked up on every save.
    expect(dungeonSourceOf(tokens[0])).toBe('file: 1\n');
    rememberDungeonSource('file: new\n');
    expect(dungeonSourceOf(tokens[0])).toBe('file: 1\n');
    expect(dungeonSourceOf(tokens[1])).toBeUndefined();
  });

  it('storage keeps the text beside the draft, and a reload brings it back', () => {
    const storage = new MemoryStorage();
    const token = rememberDungeonSource('castle: true\n');
    expect(saveDungeonSource(storage, { sourceRef: token })).toBeNull();
    forgetDungeonSources();
    expect(dungeonSourceLost({ sourceRef: token })).toBe(true);
    loadDungeonSource(storage, { sourceRef: token });
    expect(dungeonSourceOf(token)).toBe('castle: true\n');
    expect(dungeonSourceLost({ sourceRef: token })).toBe(false);
  });

  it('a stored text for another token, or one that does not hash to it, is ignored', () => {
    const storage = new MemoryStorage();
    const token = rememberDungeonSource('castle: true\n');
    forgetDungeonSources();
    storage.setItem(
      DUNGEON_SOURCE_STORAGE_KEY,
      JSON.stringify({ token, text: 'castle: false\n' })
    );
    loadDungeonSource(storage, { sourceRef: token });
    expect(dungeonSourceLost({ sourceRef: token })).toBe(true);
    storage.setItem(DUNGEON_SOURCE_STORAGE_KEY, '{not json');
    loadDungeonSource(storage, { sourceRef: token });
    expect(dungeonSourceLost({ sourceRef: token })).toBe(true);
  });

  it('a full storage is answered, not thrown, and a draft the studio made has nothing lost', () => {
    const token = rememberDungeonSource('castle: true\n');
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(saveDungeonSource(full, { sourceRef: token })).toBe(
      'quota exceeded'
    );
    expect(dungeonSourceLost({})).toBe(false);
  });
});
