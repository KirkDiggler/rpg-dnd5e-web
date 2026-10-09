import { create } from '@bufbuild/protobuf';
import { GetSeatRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useState } from 'react';
import { sessionClient } from './client';
import { isSeatRefusal, parseSeatRefusal, refusalMessage } from './seatRefusal';
import { useSessionLeave } from './useSessionLeave';

export interface UseSeatedElsewhereResult {
  /** The seat to offer abandoning, or null when nothing is shown. */
  seat: {
    character: string;
    session: string;
    /** True when a refused launch revealed it, so the caller may relaunch. */
    refused: boolean;
  } | null;
  /**
   * Frees the seat with `SessionService.Exit` — only ever on a click. Resolves
   * true when the seat was freed, false when Exit refused (see `error`).
   */
  abandon: () => Promise<boolean>;
  /**
   * Reads a refused launch. Returns true when the refusal was about a seat and
   * the notice is now showing, false when it was some other error.
   */
  noteRefusal: (err: unknown) => Promise<boolean>;
  abandoning: boolean;
  error: string | null;
}

/**
 * The seat is visible: the lobby refuses, the client offers. Reads
 * `GetSeat` for the character on load (NotFound means no live seat, nothing
 * shown) and learns of a seat from a refused launch. Exit is the one way out
 * and runs only from `abandon`, never on its own.
 */
export function useSeatedElsewhere(
  characterId: string | null | undefined
): UseSeatedElsewhereResult {
  const [seen, setSeen] = useState<{
    character: string;
    session: string;
    refused: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { leave, loading: abandoning } = useSessionLeave();

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    sessionClient
      .getSeat(create(GetSeatRequestSchema, { character: characterId }))
      .then((resp) => {
        if (!cancelled && resp.session) {
          setSeen({
            character: characterId,
            session: resp.session,
            refused: false,
          });
        }
      })
      .catch(() => {
        // NotFound is the common answer: no live seat. Any other failure
        // shows nothing either; the launch refusal is the backstop.
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  // A load-time seat belongs to the character it was read for; a refusal's
  // seat stays until it is freed, whichever party member it names.
  const seat =
    seen && (seen.refused || seen.character === characterId) ? seen : null;

  const noteRefusal = useCallback(
    async (err: unknown): Promise<boolean> => {
      if (!isSeatRefusal(err)) return false;
      const parsed = parseSeatRefusal(refusalMessage(err));
      if (parsed) {
        setError(null);
        setSeen({ ...parsed, refused: true });
        return true;
      }
      if (!characterId) return false;
      try {
        const resp = await sessionClient.getSeat(
          create(GetSeatRequestSchema, { character: characterId })
        );
        if (!resp.session) return false;
        setError(null);
        setSeen({
          character: characterId,
          session: resp.session,
          refused: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    [characterId]
  );

  const abandon = useCallback(async (): Promise<boolean> => {
    if (!seen) return false;
    setError(null);
    try {
      await leave({ session: seen.session, member: seen.character });
      setSeen(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [seen, leave]);

  return { seat, abandon, noteRefusal, abandoning, error };
}
