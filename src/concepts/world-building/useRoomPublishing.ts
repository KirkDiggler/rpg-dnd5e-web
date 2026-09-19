/**
 * useRoomPublishing — the World Builder room's publication transaction
 * (plan §2): one root `Dungeon key`, server validation through the
 * existing preview hook, a server-validated save of the EXACT captured
 * canonical YAML, and — for Save & Play — the shared
 * `usePlayAuthoredDungeon` lobby sequence with the Home-selected
 * character.
 *
 * Fencing model (request-identity coherence): each transaction holds a
 * monotonic owner token that captures EVERY fact it was authorized under
 * — the exact key, the exact emitted YAML, the room identity, the
 * character identity, and the client — and a continuation may act only
 * while that identity is STILL the live request identity (token check
 * plus direct source/identity comparison, so a late resolution cannot
 * slip between a re-render and effect flush). Any transition — key edit,
 * changed source bytes under the same room ID, a different room, a
 * character change (including A→B→A), a client swap, or unmount —
 * permanently retires the token: stale continuations never save, never
 * launch, never navigate, and never mutate current error/saved/busy
 * state. The retirement releases exactly the retired operation's busy
 * latch and cancels its child launch; it never clobbers a newer
 * operation (none can start while the retired owner held the latch).
 *
 * The key is editor publication state, never a RoomDraft field: local
 * room JSON and world snapshots stay room-only, and the canonical YAML
 * adapter is the only place a root key exists.
 */
import {
  defaultAuthoringClient,
  errorMessageOf,
  usePutDungeonPreview,
  useSaveDungeon,
  type AuthoringClient,
  type PreviewState,
} from '@/author/authoringRpc';
import {
  usePlayAuthoredDungeon,
  type LobbyLaunchPhase,
} from '@/author/usePlayAuthoredDungeon';
import { create } from '@bufbuild/protobuf';
import { Code, ConnectError } from '@connectrpc/connect';
import { GetDungeonRequestSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomDraft } from './roomDraft';
import {
  decodeSingleRoomDungeon,
  encodeSingleRoomDungeon,
} from './singleRoomDungeon';
import type { SiteScope } from './siteScope';

/** The stable "nothing authored" scope. A caller that passes no scope must
 * not re-create an object on every render, or the `yaml` memo below would
 * re-encode the whole document each time (no invalidation changes, because
 * the emitted bytes compare by value — but the work is pure waste). */
const NO_SCOPE: SiteScope = Object.freeze({});

/** The grammar a room ID must satisfy to DERIVE a default dungeon key
 * (plan §2: `room-${draft.id}` for `[a-z0-9-]+` IDs). A manually entered
 * key is whatever the author types — the server's compiler remains the
 * only legality authority and its refusals are shown verbatim. */
export const ROOM_ID_KEY_GRAMMAR = /^[a-z0-9-]+$/;

export function defaultDungeonKeyForRoom(roomId: string): string {
  return ROOM_ID_KEY_GRAMMAR.test(roomId) ? `room-${roomId}` : '';
}

/** Route-injected capability: the same selected character and
 * App.handlePlayAuthored callback the legacy AuthorView receives. */
export interface RoomPublishingCapability {
  characterId: string | null;
  onPlay: (encounterId: string, characterId: string) => void;
}

/** The seams of a publishing transaction, for truthful status lines. */
export type RoomPublishPhase = 'checking-key' | 'saving' | 'launching';

export interface UseRoomPublishingInput {
  draft: RoomDraft;
  /** The site scope (rpg-dnd5e-web#1157, rpg-project#477): the root
   * `factions`/`dispositions` that belong to the document rather than to a
   * selection. It is EDITOR state, not a draft field — the local draft's
   * envelope carries only `{ kind, version, draft }` — and it is part of the
   * publication request identity because the emitted YAML is a function of
   * it: `encodeSingleRoomDungeon` writes `version: 4` for a scope this
   * document would otherwise silently drop. */
  scope?: SiteScope;
  capability: RoomPublishingCapability;
  client?: AuthoringClient;
  /** Replaces the editor document with a decoded canonical YAML draft and the
   * scope that arrived in the same file. Returns false when refused (the key
   * must then not be adopted). */
  onImportDraft: (draft: RoomDraft, scope: SiteScope) => boolean;
  /** Reports the mutating-transaction boundary upward: while busy, the
   * editor must refuse Back, mode switches and document changes. */
  onBusyChange?: (busy: boolean) => void;
}

export interface UseRoomPublishingResult {
  key: string;
  setKey: (value: string) => void;
  /** The canonical YAML of the current (key, draft) pair; null while no
   * key is entered. This exact text is what a save submits. */
  yaml: string | null;
  /** Live server validation of the current source (never blocks editing). */
  preview: PreviewState;
  /** True while a save/launch transaction mutates server state. */
  busy: boolean;
  phase: RoomPublishPhase | null;
  /** Refusal/error message from THIS hook (empty key, read failure,
   * launch refusal). Save/launch failures render from their own state. */
  error: string | null;
  setError: (message: string | null) => void;
  /** Armed overwrite confirmation, bound to the exact key + room + source
   * it was read against. Cancel writes nothing. */
  overwritePending: {
    key: string;
    launch: boolean;
    roomId: string;
    yaml: string;
  } | null;
  /** The save hook's state: provider field errors, transport failures,
   * the exact submitted text and the saved key. */
  saver: Omit<ReturnType<typeof useSaveDungeon>, 'save'>;
  /** The last successful save of THIS editor context, bound to the exact
   * key + source + room it wrote. Callers gate "Saved" status on it so a
   * stale saved state can never present as current after an identity
   * change. */
  savedFor: { key: string; yaml: string; roomId: string } | null;
  /** The shared launch hook's state: phase-named failures and busy. */
  launch: {
    launching: boolean;
    phase: LobbyLaunchPhase | null;
    error: string | null;
  };
  save: () => Promise<boolean>;
  saveAndPlay: () => Promise<boolean>;
  /** Explicit confirmation to overwrite the existing dungeon at the
   * pending key, completing the original request (with its launch intent).
   * Refused when the armed confirmation no longer binds the current
   * source/identity. */
  confirmOverwrite: () => Promise<boolean>;
  cancelOverwrite: () => void;
  /** Canonical YAML import: decodes, replaces the editor document and its
   * scope, and adopts the file's root key. Returns false on refusal/refusal-
   * worth decode errors (message in `error`). */
  importYaml: (text: string) => boolean;
}

/** One transaction at a time; the token carries EVERY fact the request
 * was authorized under and is the single authority for "may this
 * continuation still act on a live mount". */
interface PublishOwner {
  key: string;
  yaml: string;
  roomId: string;
  characterId: string | null;
  client: AuthoringClient;
}

export function useRoomPublishing({
  draft,
  scope = NO_SCOPE,
  capability,
  client = defaultAuthoringClient,
  onImportDraft,
  onBusyChange,
}: UseRoomPublishingInput): UseRoomPublishingResult {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** The key is publication state of THIS editor context, bound to the
   * room identity it was established for. */
  const [keyState, setKeyState] = useState(() => ({
    value: defaultDungeonKeyForRoom(draft.id),
    roomId: draft.id,
  }));
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<RoomPublishPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overwritePending, setOverwritePending] = useState<{
    key: string;
    launch: boolean;
    roomId: string;
    yaml: string;
  } | null>(null);
  const [savedFor, setSavedFor] = useState<{
    key: string;
    yaml: string;
    roomId: string;
  } | null>(null);
  const saver = useSaveDungeon(client);
  const launch = usePlayAuthoredDungeon({
    characterId: capability.characterId,
    onPlay: capability.onPlay,
  });

  const busyRef = useRef(false);
  const ownerRef = useRef<PublishOwner | null>(null);
  const savedRef = useRef<{ key: string; roomId: string } | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  /** The scope is part of the request identity through the emitted YAML: a
   * transaction captures the exact `yaml` a scope produced, and a scope
   * change produces different bytes. This mirror keeps the transactional
   * encode — which runs outside render — reading the live scope. */
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const keyRef = useRef(keyState.value);
  keyRef.current = keyState.value;
  /** Live mirrors of the request identity; a late continuation compares
   * its captured owner against these directly, so it cannot act in the
   * window between a props change and the invalidation effect. */
  const characterRef = useRef(capability.characterId ?? null);
  characterRef.current = capability.characterId ?? null;
  const clientRef = useRef(client);
  clientRef.current = client;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  const onImportDraftRef = useRef(onImportDraft);
  onImportDraftRef.current = onImportDraft;
  const playRef = useRef(launch.play);
  playRef.current = launch.play;
  const cancelLaunchRef = useRef(launch.cancel);
  cancelLaunchRef.current = launch.cancel;
  const saverRef = useRef(saver.save);
  saverRef.current = saver.save;

  const applyBusy = useCallback((next: boolean) => {
    busyRef.current = next;
    if (mounted.current) setBusy(next);
    onBusyChangeRef.current?.(next);
  }, []);

  /** Retire ONE transaction monotonically: only the still-current owner
   * releases the latch, so a retired continuation can never clobber a
   * newer operation's busy state. The retired operation's child launch —
   * if any — is cancelled with it. */
  const retireOwner = useCallback((owner: PublishOwner) => {
    if (ownerRef.current !== owner) return;
    ownerRef.current = null;
    cancelLaunchRef.current();
    if (mounted.current) {
      busyRef.current = false;
      setBusy(false);
      setPhase(null);
    }
    onBusyChangeRef.current?.(false);
  }, []);

  /** The canonical YAML of the current source — captured by transactions,
   * shown for export. Encoding is the adapter's; an empty key yields no
   * YAML and no preview traffic.
   *
   * THE SCOPE IS A DEPENDENCY, AND THAT IS THE WHOLE FENCING CHANGE: the
   * emitted text is the request identity the invalidation effect already
   * compares (`owner.yaml !== yaml`), so a scope change retires an in-flight
   * transaction through the mechanism that exists. No second invalidation
   * path is added. */
  const trimmedKey = keyState.value.trim();
  const yaml = useMemo(() => {
    if (!trimmedKey) return null;
    try {
      return encodeSingleRoomDungeon({
        key: trimmedKey,
        draft,
        factions: scope.factions,
        dispositions: scope.dispositions,
      });
    } catch {
      return null;
    }
  }, [trimmedKey, draft, scope]);
  const yamlRef = useRef(yaml);
  yamlRef.current = yaml;

  const preview = usePutDungeonPreview(trimmedKey, yaml ?? '', {
    client,
    enabled: yaml !== null,
  });

  /** A different room identity (new room, imported document) resets the
   * key to that room's derived default. Retirement of any in-flight
   * transaction is the invalidation effect's job — coherently, with busy
   * release and child-launch cancellation. */
  useEffect(() => {
    setKeyState((current) =>
      current.roomId === draft.id
        ? current
        : { value: defaultDungeonKeyForRoom(draft.id), roomId: draft.id }
    );
  }, [draft.id]);

  /** Request-identity invalidation: the moment the live key, exact
   * emitted source, room identity, character or client no longer matches
   * what the in-flight transaction captured, that transaction is retired
   * (and its overwrite confirmation with it). This is the single,
   * coherent retirement path — the busy latch, the editor lock and the
   * child launch all release together, and only for the retired owner. */
  useEffect(() => {
    const owner = ownerRef.current;
    if (
      owner &&
      (owner.roomId !== draft.id ||
        owner.key !== keyState.value.trim() ||
        owner.yaml !== yaml ||
        owner.characterId !== (capability.characterId ?? null) ||
        owner.client !== client)
    ) {
      retireOwner(owner);
    }
  }, [
    draft.id,
    keyState.value,
    yaml,
    capability.characterId,
    client,
    retireOwner,
  ]);

  /** An armed overwrite confirmation is bound to the exact source it was
   * read against; a same-ID source change (or key change) can never
   * inherit it. */
  useEffect(() => {
    setOverwritePending((pending) =>
      pending &&
      (pending.key !== keyState.value.trim() ||
        pending.roomId !== draft.id ||
        pending.yaml !== yaml)
        ? null
        : pending
    );
  }, [keyState.value, draft.id, yaml]);

  /** An explicit key edit invalidates a pending overwrite confirmation. */
  const setKey = useCallback((value: string) => {
    setOverwritePending(null);
    setKeyState((current) => ({ ...current, value }));
    setError(null);
  }, []);

  const runTransaction = useCallback(
    async (input: {
      launch: boolean;
      overwriteConfirmed: boolean;
    }): Promise<boolean> => {
      if (ownerRef.current) return false;
      const current = draftRef.current;
      const currentScope = scopeRef.current;
      const trimmed = keyRef.current.trim();
      const characterAtStart = characterRef.current;
      const clientAtStart = clientRef.current;
      if (!trimmed) {
        setError('Enter a dungeon key to publish this room.');
        return false;
      }
      let yamlText: string;
      try {
        yamlText = encodeSingleRoomDungeon({
          key: trimmed,
          draft: current,
          factions: currentScope.factions,
          dispositions: currentScope.dispositions,
        });
      } catch (err) {
        setError(
          `Could not prepare the canonical YAML: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return false;
      }
      const owner: PublishOwner = {
        key: trimmed,
        yaml: yamlText,
        roomId: current.id,
        characterId: characterAtStart,
        client: clientAtStart,
      };
      ownerRef.current = owner;
      applyBusy(true);
      setError(null);
      /** The full request identity: the token, alive on a live mount, for
       * the exact room/key/source/character/client it was started with. A
       * continuation that resolves after ANY of these changed is stale and
       * may not act — even in the render/effect gap, because these are
       * direct comparisons against live mirrors, not just the token. */
      const isCurrent = () =>
        mounted.current &&
        ownerRef.current === owner &&
        draftRef.current.id === owner.roomId &&
        keyRef.current.trim() === owner.key &&
        yamlRef.current === owner.yaml &&
        characterRef.current === owner.characterId &&
        clientRef.current === owner.client;
      // The launch intent is captured, not re-read: a late save must never
      // look up a newer play binding for a different character.
      const playAtStart = playRef.current;
      try {
        // Existence check: before the FIRST save to a key in this editor
        // context, read it. A key this same document already saved to in
        // this context may update normally; anything else asks.
        const saved = savedRef.current;
        const needsCheck =
          !input.overwriteConfirmed &&
          !(saved && saved.key === trimmed && saved.roomId === current.id);
        if (needsCheck) {
          setPhase('checking-key');
          try {
            await clientAtStart.getDungeon(
              create(GetDungeonRequestSchema, { key: trimmed })
            );
            if (!isCurrent()) return false;
            // The key exists: arm the explicit confirmation, bound to this
            // exact read, and stop. No bytes change; the author decides.
            setPhase(null);
            setOverwritePending({
              key: trimmed,
              launch: input.launch,
              roomId: current.id,
              yaml: yamlText,
            });
            return false;
          } catch (err) {
            if (!isCurrent()) return false;
            if (ConnectError.from(err).code !== Code.NotFound) {
              setError(
                `Could not check whether “${trimmed}” already exists: ${errorMessageOf(err)}`
              );
              return false;
            }
            // NotFound: a new key — proceed to the save.
          }
          if (!isCurrent()) return false;
        }
        setPhase('saving');
        const ok = await saverRef.current(trimmed, yamlText);
        if (!isCurrent()) return false;
        if (!ok) return false;
        // A successful save proves the exact submitted YAML; this
        // document may now update this key without re-asking.
        savedRef.current = { key: trimmed, roomId: current.id };
        setSavedFor({ key: trimmed, yaml: yamlText, roomId: current.id });
        setOverwritePending(null);
        if (input.launch) {
          setPhase('launching');
          const launched = await playAtStart(trimmed);
          if (!isCurrent()) return false;
          return launched;
        }
        return true;
      } finally {
        // Only the current owner releases the latch: a retired or
        // unmounted continuation must not clobber a newer operation's
        // busy state. (Identity retirement already released it via
        // retireOwner; the token guard makes this a no-op then.)
        if (ownerRef.current === owner) {
          ownerRef.current = null;
          applyBusy(false);
          setPhase(null);
        }
      }
    },
    [applyBusy]
  );

  const save = useCallback(
    () => runTransaction({ launch: false, overwriteConfirmed: false }),
    [runTransaction]
  );
  const saveAndPlay = useCallback(
    () => runTransaction({ launch: true, overwriteConfirmed: false }),
    [runTransaction]
  );

  const overwriteRef = useRef(overwritePending);
  overwriteRef.current = overwritePending;
  const confirmOverwrite = useCallback(async (): Promise<boolean> => {
    const pending = overwriteRef.current;
    if (!pending) return false;
    // A confirmation is only ever completed for the exact request it was
    // armed against; a same-ID source change or key change retires it.
    if (
      pending.key !== keyRef.current.trim() ||
      pending.roomId !== draftRef.current.id ||
      pending.yaml !== yamlRef.current
    ) {
      setOverwritePending(null);
      return false;
    }
    return runTransaction({
      launch: pending.launch,
      overwriteConfirmed: true,
    });
  }, [runTransaction]);
  const cancelOverwrite = useCallback(() => {
    // Cancel changes no stored bytes: it only disarms the confirmation.
    setOverwritePending(null);
  }, []);

  const importYaml = useCallback((text: string): boolean => {
    let decoded: ReturnType<typeof decodeSingleRoomDungeon>;
    try {
      decoded = decodeSingleRoomDungeon(text);
    } catch (err) {
      setError(
        `Could not import this canonical YAML: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return false;
    }
    const accepted = onImportDraftRef.current(decoded.draft, {
      ...(decoded.factions ? { factions: decoded.factions } : {}),
      ...(decoded.dispositions ? { dispositions: decoded.dispositions } : {}),
    });
    if (!accepted) return false;
    // The imported file's root key becomes the publication key for the
    // imported room identity; pending confirmations and the "saved
    // here" latch belong to the replaced document, not this one.
    setKeyState({ value: decoded.key, roomId: decoded.draft.id });
    savedRef.current = null;
    setOverwritePending(null);
    setError(null);
    return true;
  }, []);

  return {
    key: keyState.value,
    setKey,
    yaml,
    preview,
    busy,
    phase,
    error,
    setError,
    overwritePending,
    saver,
    savedFor,
    launch,
    save,
    saveAndPlay,
    confirmOverwrite,
    cancelOverwrite,
    importYaml,
  };
}
