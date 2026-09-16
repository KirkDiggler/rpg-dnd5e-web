import { createRoomDraft } from '@/concepts/world-building/roomDraft';
import { createEmptyScene } from '@/concepts/world-building/sceneState';
import { describe, expect, it } from 'vitest';
import {
  decodeRoomDocumentJson,
  encodeRoomDocument,
  isRoomDocumentJson,
} from './roomDocument';

describe('room snapshot document', () => {
  it('round-trips the complete typed room draft and uses the explicit marker', () => {
    const draft = createRoomDraft(createEmptyScene('scene-1'), 'room-1');
    draft.name = 'Rich room';
    draft.workspace = { hexRadius: 14, horizontalLimit: 28 };
    draft.room.walkableHexes = [
      { q: 14, r: 0 },
      { q: 0, r: -14 },
    ];
    draft.room.arrangementDeclarations = { arrangement: {} };
    const json = encodeRoomDocument(draft);
    expect(isRoomDocumentJson(json)).toBe(true);
    expect(JSON.parse(json)).toMatchObject({
      kind: 'room-authoring-draft',
      version: 1,
    });
    expect(decodeRoomDocumentJson(json)).toEqual(draft);
  });

  it('recognizes unsupported room versions without classifying them as scenes', () => {
    expect(
      isRoomDocumentJson(
        JSON.stringify({ kind: 'room-authoring-draft', version: 99 })
      )
    ).toBe(true);
    expect(() =>
      decodeRoomDocumentJson(
        JSON.stringify({ kind: 'room-authoring-draft', version: 99 })
      )
    ).toThrow('Unsupported room snapshot version');
  });
});
