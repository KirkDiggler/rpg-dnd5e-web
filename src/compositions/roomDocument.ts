import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from '@/concepts/world-building/roomDraft';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';

export const ROOM_DOCUMENT_KIND = 'room-authoring-draft' as const;
export const ROOM_DOCUMENT_VERSION = 1 as const;

export function isRoomDocumentJson(json: string): boolean {
  try {
    const value = JSON.parse(json) as { kind?: unknown };
    return value.kind === ROOM_DOCUMENT_KIND;
  } catch {
    return false;
  }
}

export function encodeRoomDocument(draft: RoomDraft): string {
  const validated = JSON.parse(stringifyRoomDraft(draft)) as {
    draft: RoomDraft;
  };
  return JSON.stringify(
    {
      kind: ROOM_DOCUMENT_KIND,
      version: ROOM_DOCUMENT_VERSION,
      draft: validated.draft,
    },
    null,
    2
  );
}

export function decodeRoomDocumentJson(json: string): RoomDraft {
  if (json.length > 500_000) throw new Error('Room draft is too large.');
  const envelope = JSON.parse(json) as {
    kind?: unknown;
    version?: unknown;
    draft?: unknown;
  };
  if (envelope.kind !== ROOM_DOCUMENT_KIND)
    throw new Error('Expected a room authoring snapshot.');
  if (envelope.version !== ROOM_DOCUMENT_VERSION)
    throw new Error('Unsupported room snapshot version.');
  return parseRoomDraftJson(
    JSON.stringify({
      kind: 'rpg-room-authoring-draft',
      version: 2,
      draft: envelope.draft,
    })
  );
}

export function isRoomDocument(composition: Composition): boolean {
  return isRoomDocumentJson(composition.json);
}
