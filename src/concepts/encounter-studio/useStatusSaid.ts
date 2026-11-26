/**
 * THE ENGINE SAYS A STATUS BACK (rpg-project#1217).
 *
 * `AuthoringService.SayStatus` reads one status, as the file writes it, back
 * in the rules' own words. The studio asks for the selected status only and
 * types no word of what a status does. An answer for an older ask is
 * dropped, and nothing is kept across statuses: while a new ask is out for the
 * same status the last answer rides along as `was`, for no other.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  SayStatusRequestSchema,
  type AuthoringService,
  type FieldError,
  type StatusSaidPart,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useEffect, useState } from 'react';

type Settled = Exclude<StatusSaid, { status: 'idle' | 'loading' }>;

export type StatusSaidClient = Pick<
  Client<typeof AuthoringService>,
  'sayStatus'
>;

export type StatusSaid =
  /** Not asked: not enabled, no id, or `written` is not an object. */
  | { status: 'idle' }
  /** A new ask is out. `was` is the last said or refused answer for the SAME
   * status, so the page can keep drawing it; absent for another status. */
  | {
      status: 'loading';
      was?: Extract<Settled, { status: 'said' | 'refused' }>;
    }
  | {
      status: 'said';
      name: string;
      sentence: string;
      parts: StatusSaidPart[];
    }
  | { status: 'refused'; errors: FieldError[] }
  | { status: 'unavailable'; reason: string };

export const STATUS_UNIMPLEMENTED_REASON = 'the engine cannot say a status';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function useStatusSaid({
  id,
  written,
  client = authoringClient,
  enabled,
}: {
  id: string | null | undefined;
  written: unknown;
  client?: StatusSaidClient;
  enabled: boolean;
}): StatusSaid {
  const json = isObject(written) ? JSON.stringify(written) : null;
  const key = enabled && id && json !== null ? `${id}\u0000${json}` : null;
  const [answer, setAnswer] = useState<{
    key: string;
    id: string;
    said: Settled;
  } | null>(null);
  useEffect(() => {
    if (key === null || !id || json === null) return;
    let live = true;
    client
      .sayStatus(create(SayStatusRequestSchema, { id, statusJson: json }))
      .then(
        (response): Settled =>
          response.errors.length > 0
            ? { status: 'refused', errors: response.errors }
            : {
                status: 'said',
                name: response.name,
                sentence: response.sentence,
                parts: response.parts,
              },
        (err: unknown): Settled => ({
          status: 'unavailable',
          reason:
            err instanceof ConnectError && err.code === Code.Unimplemented
              ? STATUS_UNIMPLEMENTED_REASON
              : err instanceof ConnectError
                ? `${Code[err.code]}: ${err.rawMessage}`
                : String(err),
        })
      )
      .then((said) => {
        if (live) setAnswer({ key, id, said });
      });
    return () => {
      live = false;
    };
  }, [client, key, id, json]);
  if (key === null) return { status: 'idle' };
  if (answer?.key === key) return answer.said;
  if (
    answer &&
    answer.id === id &&
    (answer.said.status === 'said' || answer.said.status === 'refused')
  )
    return { status: 'loading', was: answer.said };
  return { status: 'loading' };
}
