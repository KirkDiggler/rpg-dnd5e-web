import {
  ROOM_DRAFT_ENVELOPE_VERSION,
  parseRoomDraftJson,
  stringifyRoomDraft,
  type RoomDraft,
} from '@/concepts/world-building/roomDraft';
import { MAX_JSON_LENGTH } from '@/concepts/world-building/serialization';
import type { Composition } from '@kirkdiggler/rpg-api-protos/gen/ts/api/composition/v1alpha1/service_pb';

export const ROOM_DOCUMENT_KIND = 'room-authoring-draft' as const;
export const ROOM_DOCUMENT_VERSION = 2 as const;

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
  if (envelope.version !== 1 && envelope.version !== 2)
    throw new Error('Unsupported room snapshot version.');
  const draft = envelope.draft as Record<string, unknown> | undefined;
  if (!draft) throw new Error('Room snapshot draft is missing.');
  /** Envelope version 1 historically carried a draft version 2; the current
   * envelope version 2 carries draft version 3. Mismatched, invalid or newer
   * combinations are refused rather than reinterpreted, and the room document
   * envelope never absorbs a draft version that was never written under it. */
  if (envelope.version === 1 && draft.version !== 2)
    throw new Error(
      'Expected a version 2 room draft in a version 1 room snapshot.'
    );
  if (envelope.version === 2 && draft.version !== 3)
    throw new Error(
      'Expected a version 3 room draft in a version 2 room snapshot.'
    );
  // THE SYNTHESIZED ENVELOPE CARRIES THE **CURRENT** DRAFT SHAPE.
  //
  // This used to write `envelope.version === 1 ? 2 : 3` — the SNAPSHOT
  // envelope's own number, borrowed for the draft envelope. The two axes only
  // agreed by coincidence, and when the draft envelope went to 5 for
  // `startingCell` (rpg-project#501 §6.1) this build began REFUSING ITS OWN
  // freshly-decoded snapshot. `singleRoomDungeon` had the identical bug and was
  // fixed the same way: a wrapper mints the CURRENT shape, never a number it
  // inherited from a different version axis.
  //
  // The snapshot's own version still guards what it always did — which DRAFT
  // version a snapshot may carry, checked above — and that check is unchanged.
  //
  // A LEGACY SNAPSHOT KEEPS ITS OWN DRAFT VERSION, because that number is
  // still true of it: envelope 1 carries draft 2, and `parseRoomDocumentJson`
  // has a v2 legacy path that migrates exactly that shape. Stamping the
  // CURRENT version on it would claim a shape it does not have and skip the
  // migration it needs. Only the CURRENT snapshot (envelope 2, draft 3) is
  // stamped current — it is the one this build writes.
  return parseRoomDraftJson(
    JSON.stringify({
      kind: 'rpg-room-authoring-draft',
      version: envelope.version === 1 ? 2 : ROOM_DRAFT_ENVELOPE_VERSION,
      draft,
    })
  );
}

export function isRoomDocument(composition: Composition): boolean {
  return isRoomDocumentJson(composition.json);
}
