/**
 * A WRITE THE STUDIO CANNOT MAKE SAFELY IS REFUSED AT THE COMMIT
 * (rpg-project#1014). Every room edit commits through `commitRoomDocument`,
 * which first checks that the file the document was read from takes the
 * edit (`assertSourceWritable`): the splice's text must parse and read back
 * as the edit meant. A broken splice (injected here) leaves the document,
 * the saved draft and the undo history as they were, and the operator reads
 * the studio's sentence; a sound one commits as before. New room starts a
 * document with no file.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { readDraftYaml } from '../encounter-studio/draftFile';
import served from '../encounter-studio/fixtures/the-mad-king-served.yaml?raw';
import {
  floorCells,
  ROOM_DRAFT_STORAGE_KEY,
  stringifyRoomDraft,
  type RoomDraft,
} from './roomDraft';
import { encodeCanonicalWithValue } from './singleRoomDungeon';
import { renderScope } from './siteScope';
import type { KeyValueStorage } from './types';
import { WorldBuildingConcept } from './WorldBuildingConcept';
import { spliceInternals } from './yamlSplice';

/** The writer below the guard made faulty, as a splice bug would be: text
 * that does not parse, or the file unchanged (the edit lost). The guard in
 * the real `spliceYaml` must refuse what it writes. */
function breakTheWriter(mode: 'unparseable' | 'lost') {
  const real = spliceInternals.text;
  vi.spyOn(spliceInternals, 'text').mockImplementation(
    (source, document, base, current) => {
      const { edits } = real(source, document, base, current);
      return {
        out: mode === 'unparseable' ? `${source}\n- [ unclosed\n` : source,
        edits,
      };
    }
  );
}

const viewport = vi.hoisted(() => ({
  paint: null as
    | null
    | ((cells: { q: number; r: number }[], mode: 'paint' | 'erase') => void),
}));
vi.mock('./WorldBuildingViewport', () => ({
  WorldBuildingViewport: (props: {
    roomAuthoring?: {
      onWalkableGesture: (
        cells: { q: number; r: number }[],
        mode: 'paint' | 'erase'
      ) => void;
    };
  }) => {
    viewport.paint = props.roomAuthoring?.onWalkableGesture ?? null;
    return <div data-testid="mock-world-viewport" />;
  },
}));
vi.mock('@/compositions/CompositionThumbnailRenderer', () => ({
  ThumbnailRenderer: () => null,
}));

class MemoryStorage implements KeyValueStorage {
  values = new Map<string, string>();
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

function savedDraft(storage: MemoryStorage): RoomDraft {
  return JSON.parse(storage.getItem(ROOM_DRAFT_STORAGE_KEY)!).draft;
}

/** The castle, read from its file, open in the studio. */
function openCastle() {
  const read = readDraftYaml(served);
  if (!read.ok) throw new Error(read.refusal);
  expect(read.draft.sourceRef).toBeDefined();
  const storage = new MemoryStorage();
  storage.setItem(
    ROOM_DRAFT_STORAGE_KEY,
    stringifyRoomDraft(read.draft, read.scope)
  );
  render(<WorldBuildingConcept roomMode storage={storage} />);
  const floor = floorCells(read.draft);
  const has = (q: number, r: number) =>
    floor.some((cell) => cell.q === q && cell.r === r);
  // A cell next to the floor that is not floor yet.
  const cell = floor
    .flatMap((c) => [
      { q: c.q + 1, r: c.r },
      { q: c.q, r: c.r + 1 },
    ])
    .find((c) => !has(c.q, c.r))!;
  return { storage, cell };
}

const undo = () =>
  screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;

describe('a write the studio cannot make safely is refused (rpg-project#1014)', () => {
  it.each([
    [
      'unparseable',
      /^The studio could not write this change safely, so nothing was changed\. The file it would write does not parse at line \d+\./,
    ],
    [
      'lost',
      /^The studio could not write this change safely, so nothing was changed\. The file it would write reads \S+ differently from the edit\./,
    ],
  ] as const)(
    'a %s write leaves the document, the saved draft and undo as they were, and says why',
    (mode, sentence) => {
      const { storage, cell } = openCastle();
      const saved = storage.getItem(ROOM_DRAFT_STORAGE_KEY);
      expect(undo().disabled).toBe(true);
      breakTheWriter(mode);
      act(() => viewport.paint!([cell], 'paint'));
      expect(screen.getByRole('alert').textContent).toMatch(sentence);
      expect(storage.getItem(ROOM_DRAFT_STORAGE_KEY)).toBe(saved);
      expect(floorCells(savedDraft(storage))).not.toContainEqual(cell);
      expect(undo().disabled).toBe(true);
    }
  );

  it('a sound write commits as before: the cell is painted and undo holds it', () => {
    const { storage, cell } = openCastle();
    act(() => viewport.paint!([cell], 'paint'));
    expect(screen.queryByText(/could not write this change safely/)).toBe(null);
    expect(undo().disabled).toBe(false);
    expect(floorCells(savedDraft(storage))).toContainEqual(cell);
  });

  it('New room keeps no file: the blank room is never spliced into the castle', () => {
    const { storage } = openCastle();
    fireEvent.click(screen.getByRole('button', { name: 'Identity' }));
    fireEvent.click(screen.getByRole('button', { name: 'New room' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm new room' }));
    expect(screen.queryByText(/could not write this change safely/)).toBe(null);
    expect(savedDraft(storage).sourceRef).toBeUndefined();
    expect(undo().disabled).toBe(false);
  });

  it('the value the guard compares against is what the canonical text reads as (the castle)', () => {
    const read = readDraftYaml(served);
    if (!read.ok) throw new Error(read.refusal);
    const { text, value } = encodeCanonicalWithValue({
      key: read.key,
      draft: read.draft,
      ...renderScope(read.scope),
    });
    expect(value).toStrictEqual(parse(text));
  });
});
