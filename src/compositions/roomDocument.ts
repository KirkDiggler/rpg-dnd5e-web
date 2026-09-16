import {
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from '@/concepts/world-building/roomDraft';
import { MAX_JSON_LENGTH } from '@/concepts/world-building/serialization';
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
  const encoded = JSON.stringify(
    {
      kind: ROOM_DOCUMENT_KIND,
      version: ROOM_DOCUMENT_VERSION,
      draft: validated.draft,
    },
    null,
    2
  );
  if (encoded.length > MAX_JSON_LENGTH) {
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
  }
  return encoded;
}

export function decodeRoomDocumentJson(json: string): RoomDraft {
  if (json.length > MAX_JSON_LENGTH)
    throw new Error(
      `Room draft is too large (maximum ${MAX_JSON_LENGTH} characters).`
    );
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
