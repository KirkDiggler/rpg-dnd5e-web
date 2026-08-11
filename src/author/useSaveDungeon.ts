/**
 * useSaveDungeon — the edit-mode board's "Save & Play" action (Kirk's
 * 2026-08-01 ask on rpg-dnd5e-web#667: "complete the real loop"). Same
 * `authoringClient.putDungeon` wiring `usePutDungeonPreview.ts` uses for
 * its live debounced preview, kept as its own hook (not folded into that
 * one) because this is a single explicit, user-triggered write
 * (`validate_only: false`) with its own success/failure lifecycle, not a
 * debounced-on-every-keystroke read.
 *
 * `PutDungeonResponse` carries no `key` field (see service_pb.ts's own
 * doc comment) — the saved key is exactly the request's `key`, echoed
 * back by this hook rather than re-derived from the response.
 *
 * Deliberately does NOT touch the lobby route or ListDungeons — Kirk's
 * ask was explicit ("build NO new lobby plumbing"). The success panel
 * points at the plain lobby URL and tells the author to pick the new key
 * in the existing dungeon dropdown (rpg-project#131's DungeonPicker, this
 * branch's base) themselves.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { ConnectError } from '@connectrpc/connect';
import { PutDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { ValidationError } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/common_pb';
import { useState } from 'react';

export type SaveState = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

/** The only authoring RPC this slice needs. Kept structural so an isolated
 * caller can supply a scoped unary client without pulling in global auth. */
export interface AuthoringUnaryClient {
  putDungeon: typeof authoringClient.putDungeon;
}

export interface UseSaveDungeonResult {
  state: SaveState;
  /** Set once a save succeeds — the request's own `key`, not anything
   * echoed by the response (PutDungeonResponse has no key field). */
  savedKey: string | null;
  /** `state === 'invalid'` only: the real server-side validation failure
   * (dungeonspec.Validate rejected the YAML this actually persisted
   * against) — same v1 flat-error shape as the live preview's
   * field_errors. */
  fieldErrors: ValidationError[];
  /** `state === 'error'` only: transport/gate-off/programming-error
   * failure, not author feedback — same distinction usePutDungeonPreview
   * draws between field_errors and requestError. */
  errorMessage: string | null;
  save: (key: string, yamlText: string) => void;
}

export function useSaveDungeon(
  client: AuthoringUnaryClient = authoringClient,
  onSaveSucceeded?: (key: string) => void
): UseSaveDungeonResult {
  const [state, setState] = useState<SaveState>('idle');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ValidationError[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const save = (key: string, yamlText: string) => {
    setState('saving');
    setFieldErrors([]);
    setErrorMessage(null);
    (async () => {
      let response;
      try {
        response = await client.putDungeon(
          create(PutDungeonRequestSchema, {
            key,
            yaml: yamlText,
            validateOnly: false,
          })
        );
      } catch (err) {
        setErrorMessage(
          err instanceof ConnectError
            ? err.message
            : 'PutDungeon request failed'
        );
        setState('error');
        return;
      }

      if (response.success) {
        setSavedKey(key);
        setState('saved');
        // This is a consumer notification, not part of the RPC result. A
        // throwing (or promise-rejecting) callback must not reclassify an
        // already-persisted save as a PutDungeon failure.
        try {
          void Promise.resolve(onSaveSucceeded?.(key)).catch(() => undefined);
        } catch {
          // A synchronous callback failure is likewise isolated from save state.
        }
      } else {
        setFieldErrors(response.fieldErrors);
        setState('invalid');
      }
    })();
  };

  return { state, savedKey, fieldErrors, errorMessage, save };
}
