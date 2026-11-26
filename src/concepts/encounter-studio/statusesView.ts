/**
 * The site's status effects, read for the Status effects page
 * (rpg-project#1215): the file's `statuses` as written, what the engine says
 * of each, and the lines that give it. The studio types no word of what a
 * status does; every sentence is the engine's.
 */
import type {
  ReadBack,
  ReadBackStatement,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';

// The engine's own identifiers for how it says a status (rpg-project#1215,
// F3): not prose.
const STATUS_KIND = 'place.status';
const GRANT_KIND = 'line.grant';
const STATUS = 'status';
const GIVES = 'gives';
const WHO = 'who';
const RECEIVES = 'receives';

export interface StatusGiver {
  /** What the giving line belongs to: the statement's `about`. */
  kind: string;
  id: string;
  /** The giving line's path in the file. */
  path: string;
  /** Who receives it: the id the line connects with role `receives`. */
  receiver: string;
}

export interface StatusView {
  id: string;
  name: string;
  /** The entry as the file holds it, whatever its type. */
  written: unknown;
  /** The engine's statements about the status. */
  said: ReadBackStatement[];
  givenBy: StatusGiver[];
}

/**
 * `statuses` written as something that is not a mapping (text, a number, a
 * list, `true`, an empty key): the file holds it, so the page shows it as
 * written rather than saying the site has none (rpg-project#1215, R1).
 * Null when the file has no `statuses` or it is a mapping.
 */
export function statusesNotMapping(
  document: Readonly<RoomDraftDocument>
): { written: unknown } | null {
  const statuses = document.scope.unread?.statuses;
  if (statuses === undefined) return null;
  return statuses !== null &&
    typeof statuses === 'object' &&
    !Array.isArray(statuses)
    ? null
    : { written: statuses };
}

export function statusesOf(
  document: Readonly<RoomDraftDocument>,
  readBack: ReadBack | null | undefined
): StatusView[] {
  const statuses = document.scope.unread?.statuses;
  if (
    statuses === null ||
    typeof statuses !== 'object' ||
    Array.isArray(statuses)
  )
    return [];
  const statements = (readBack?.sections ?? []).flatMap((section) =>
    section.groups.flatMap((group) => group.statements)
  );
  return Object.entries(statuses as Record<string, unknown>).map(
    ([id, written]) => {
      const name = (written as { name?: unknown } | null)?.name;
      return {
        id,
        name: typeof name === 'string' ? name : id,
        written,
        said: statements.filter(
          (s) =>
            s.kind === STATUS_KIND &&
            s.about?.kind === STATUS &&
            s.about.id === id
        ),
        givenBy: statements.flatMap((s) =>
          s.kind === GRANT_KIND &&
          s.connects.some(
            (c) => c.kind === STATUS && c.id === id && c.role === GIVES
          )
            ? [
                {
                  kind: s.about?.kind ?? '',
                  id: s.about?.id ?? '',
                  path: s.path,
                  receiver:
                    s.connects.find(
                      (c) => c.kind === WHO && c.role === RECEIVES
                    )?.id ?? '',
                },
              ]
            : []
        ),
      };
    }
  );
}
