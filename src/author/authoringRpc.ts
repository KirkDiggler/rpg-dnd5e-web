/**
 * authoringRpc — the builder's two calls on `AuthoringService`
 * (rpg-api-protos v0.1.134, rpg-project#256 design §3a):
 *
 * - `usePutDungeonPreview`: every edit, debounced, `PutDungeon{validate_only}`
 *   → the compiler's path-addressed `errors` and, when it compiled, the
 *   SAME `GetAtlasResponse` the game plays from. The preview draws that
 *   atlas; the canvas highlights those paths. `validate_only` never
 *   refuses a half-drawn map — a missing start is an error entry, not a
 *   status — so the hook's own failure states are only about reachability.
 * - `useSaveDungeon`: `PutDungeon` for real; the server stores the bytes
 *   verbatim, so what was sent is what `GetDungeon` hands back.
 *
 * Both take the client as a parameter (default: the app's own
 * `authoringClient`) so the toolkit-contributor sandbox and tests can
 * hand in their own.
 */
import { authoringClient } from '@/api/client';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError, type Client } from '@connectrpc/connect';
import {
  ListScenariosRequestSchema,
  PutDungeonRequestSchema,
  type AuthoringService,
  type FieldError,
  type PutDungeonResponse,
  type ScenarioDescriptor,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { GetAtlasResponse } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import { useCallback, useEffect, useRef, useState } from 'react';

export type AuthoringClient = Pick<
  Client<typeof AuthoringService>,
  'putDungeon' | 'getDungeon' | 'listScenarios'
>;

export const defaultAuthoringClient: AuthoringClient = authoringClient;

export type PreviewStatus =
  | 'idle'
  | 'validating'
  | 'compiled'
  | 'errors'
  | 'unreachable';

export interface PreviewState {
  status: PreviewStatus;
  errors: FieldError[];
  /** The compiled atlas — set whenever the LAST compile succeeded; kept
   * through a later `errors` answer so the 3D preview does not blank
   * while the author is mid-edit. */
  atlas: GetAtlasResponse | null;
  /** The last transport failure's message, for the status line. */
  message: string | null;
}

export const PREVIEW_DEBOUNCE_MS = 400;

export function errorMessageOf(err: unknown): string {
  if (err instanceof ConnectError)
    return `${Code[err.code]}: ${err.rawMessage}`;
  return err instanceof Error ? err.message : String(err);
}

export interface UsePutDungeonPreviewOptions {
  client?: AuthoringClient;
  /** Fixtures mode (the Concepts Lab sandbox): answer with this atlas and
   * no errors, never calling the server. */
  fixtureAtlas?: GetAtlasResponse | null;
  debounceMs?: number;
}

export function usePutDungeonPreview(
  key: string,
  yaml: string,
  {
    client = defaultAuthoringClient,
    fixtureAtlas,
    debounceMs = PREVIEW_DEBOUNCE_MS,
  }: UsePutDungeonPreviewOptions = {}
): PreviewState {
  const [state, setState] = useState<PreviewState>({
    status: 'idle',
    errors: [],
    atlas: fixtureAtlas ?? null,
    message: null,
  });
  const generation = useRef(0);

  useEffect(() => {
    if (fixtureAtlas !== undefined) {
      setState({
        status: 'compiled',
        errors: [],
        atlas: fixtureAtlas,
        message: null,
      });
      return;
    }
    const mine = ++generation.current;
    setState((s) => ({ ...s, status: 'validating' }));
    const timer = setTimeout(async () => {
      let response: PutDungeonResponse;
      try {
        response = await client.putDungeon(
          create(PutDungeonRequestSchema, { key, yaml, validateOnly: true })
        );
      } catch (err) {
        if (mine !== generation.current) return;
        setState((s) => ({
          ...s,
          status: 'unreachable',
          message: errorMessageOf(err),
        }));
        return;
      }
      if (mine !== generation.current) return;
      if (response.errors.length > 0) {
        setState((s) => ({
          status: 'errors',
          errors: response.errors,
          atlas: s.atlas,
          message: null,
        }));
      } else {
        setState({
          status: 'compiled',
          errors: [],
          atlas: response.atlas ?? null,
          message: null,
        });
      }
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [key, yaml, client, fixtureAtlas, debounceMs]);

  return state;
}

/**
 * The 3D tab's staleness banner (#804 walk finding 2: "the 3d view
 * bottom room is off"). The preview deliberately keeps the LAST
 * compiled atlas through errors and transport failures so it never
 * blanks mid-edit — but that means the 3D picture can silently lag the
 * document (walls the author just drew missing from the render). This
 * names the lag instead of leaving it to look like broken geometry:
 * non-null whenever the atlas on screen is NOT the current document's
 * own compile.
 */
export function staleAtlasNotice(state: PreviewState): string | null {
  if (!state.atlas || state.status === 'compiled') return null;
  switch (state.status) {
    case 'validating':
      return '3D shows the last compiled document — compiling the latest edits…';
    case 'errors':
      return '3D shows the last compiled document — the current file has problems (see the error list)';
    case 'unreachable':
      return `3D shows the last compiled document — authoring server unreachable${
        state.message ? `: ${state.message}` : ''
      }`;
    default:
      return null;
  }
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

export interface SaveState {
  status: SaveStatus;
  errors: FieldError[];
  message: string | null;
  /** The key the last successful save wrote. */
  savedKey: string | null;
  /** The exact text the last save submitted — `errors` describe THIS
   * text, so a caller shows them only while the document still is it. */
  submittedYaml: string | null;
}

export interface UseSaveDungeonResult extends SaveState {
  /** Resolves `true` when the server stored the file. */
  save: (key: string, yaml: string) => Promise<boolean>;
}

export function useSaveDungeon(
  client: AuthoringClient = defaultAuthoringClient
): UseSaveDungeonResult {
  const [state, setState] = useState<SaveState>({
    status: 'idle',
    errors: [],
    message: null,
    savedKey: null,
    submittedYaml: null,
  });

  const save = useCallback(
    async (key: string, yaml: string): Promise<boolean> => {
      setState((s) => ({
        ...s,
        status: 'saving',
        message: null,
        submittedYaml: yaml,
      }));
      try {
        const response = await client.putDungeon(
          create(PutDungeonRequestSchema, { key, yaml, validateOnly: false })
        );
        if (response.errors.length > 0) {
          setState({
            status: 'invalid',
            errors: response.errors,
            message: null,
            savedKey: null,
            submittedYaml: yaml,
          });
          return false;
        }
        setState({
          status: 'saved',
          errors: [],
          message: null,
          savedKey: key,
          submittedYaml: yaml,
        });
        return true;
      } catch (err) {
        setState({
          status: 'error',
          errors: [],
          message: errorMessageOf(err),
          savedKey: null,
          submittedYaml: yaml,
        });
        return false;
      }
    },
    [client]
  );

  return { ...state, save };
}

export interface ScenariosState {
  scenarios: readonly ScenarioDescriptor[];
  loading: boolean;
  /** The transport failure's message. NOT a reason to show anything but
   * the failure: there is no fallback descriptor and never will be. */
  error: string | null;
}

/**
 * `ListScenarios` — every scenario the server's rulebook offers, and the
 * form each one needs filled in (rpg-project#368 §3.2).
 *
 * # There is no fallback descriptor, deliberately
 *
 * A client-side copy of "the recover-the-artifact form has an artifact and
 * an exit" is how a fitter survives its own deletion: the panel would keep
 * rendering a form for a scenario the rulebook no longer serves, and the
 * author would fill it in and get a refusal from a package that has never
 * heard of it. So an empty answer renders "no scenarios offered" and a
 * failed call renders the failure. Both are true statements about what the
 * server said; neither invents a scenario.
 *
 * # And no scenario knowledge either
 *
 * The descriptor IS the form: key, label, widget type, which family of
 * authored thing an `entity_ref` picker lists, and the guidance sentence
 * the rulebook's own constructor would refuse with. Nothing in this file
 * or the panel below it knows what an artifact is. A scenario this build
 * has never heard of renders, and that is the test.
 *
 * Ungated: reading content mutates nothing (GetDungeon's precedent), so
 * this answers with authoring switched off, exactly as `ListDungeons`
 * does for the Open picker.
 */
export function useListScenarios(
  client: AuthoringClient = defaultAuthoringClient
): ScenariosState {
  const [state, setState] = useState<ScenariosState>({
    scenarios: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const response = await client.listScenarios(
          create(ListScenariosRequestSchema, {})
        );
        if (!live) return;
        setState({
          scenarios: response.scenarios,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!live) return;
        setState({
          scenarios: [],
          loading: false,
          error: errorMessageOf(err),
        });
      }
    })();
    return () => {
      live = false;
    };
  }, [client]);

  return state;
}
