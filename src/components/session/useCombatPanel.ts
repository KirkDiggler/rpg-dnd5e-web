/**
 * useCombatPanel — the React seam between the session route's live RPC
 * state and `combatPanel.ts`'s pure selection, PLUS the panel's own
 * local state (`selectedTargetId`, `targetingRequested`, `lastBeat`) and
 * its imperative actions (Attack, End Turn, entering target mode). Same
 * shape as `useMoveIndicator`/`useTurnHud`, grown to own imperative
 * actions the way `useSessionWalk` owns `walkTo` — a panel has buttons, a
 * pure selector cannot dispatch RPCs.
 *
 * FLAT PRIMITIVE ARGS, not a nested `{turn, afford}` object — same reason
 * `useMoveIndicator`'s own args are flat: an object literal built fresh at
 * the call site (`SessionEncounterView` would otherwise write `turn:
 * {clock, active, round, order}` inline on every render) has a new
 * identity every render even when every field is unchanged, which would
 * defeat the `useMemo` below on every single re-render, not just when the
 * turn/afford state actually changes. The nested shape only exists inside
 * `combatPanel.ts`'s own pure function, built fresh inside the memoized
 * callback where a fresh object costs nothing.
 *
 * # Target mode is explicit, and clears itself after a pick
 *
 * toolkit#1169 made `'move'` the default floor mode on your own turn (you
 * can walk AND fight in the same turn), so `'target'` mode can no longer
 * be entered automatically just because Attack is affordable — a player
 * who wants to walk first would find the floor stuck in targeting mode
 * with no way to just click a hex. `enterTargetMode` is the one explicit
 * trigger (wired to the Attack button's own `'pick-target'` state,
 * `combatPanel.ts`'s own doc comment on why there is no second button);
 * `selectTarget` clears the request once a pick lands, returning the
 * floor to `'move'` on its own — no separate "exit targeting" affordance
 * needed. The clock leaving TURN (a fight ending) also clears it, same as
 * `selectedTargetId`.
 *
 * # The beat line never decodes `Event.payload`
 *
 * `sightingEntities.ts` already keeps a "never decode; render only from
 * typed fields" rule for `Sighting.payload` — this hook keeps the same
 * rule for `Event.payload`, which is EVEN LESS safe to decode: it is
 * explicitly a JSON blob the toolkit's own doc comments call a "TEMPORARY
 * SHAPE... worth being uncomfortable about" (`rpg-toolkit`
 * `rulebooks/dnd5e/session/events.go`), pending toolkit#941 giving events
 * a properly typed, versioned payload. `rpg-api` itself never builds or
 * inspects it (`events.proto`'s own doc comment: "PASSTHROUGH"). Reaching
 * past that boundary to parse an internal, unversioned wire format would
 * be exactly the kind of coupling this whole seam's design rules exist to
 * prevent — a payload shape change would silently break narration with no
 * proto bump to catch it.
 *
 * So the beat line is built ONLY from data this client already has with a
 * real contract:
 *  - MY OWN swing: `AttackResponse` (`roll`/`against`/`hit`/`damage`, all
 *    typed proto fields) plus the target `attackSelectedTarget` itself
 *    chose — formatted the instant the RPC resolves, no stream needed.
 *  - A DOWNED beat arriving on the stream: `event.kind` alone (no decode)
 *    tells us SOMETHING died, but NOT WHO — `noteDowned` renders the
 *    honestly-anonymous "A member is downed." rather than guessing it was
 *    whatever this player currently has targeted. There is no typed "who"
 *    for DOWNED anywhere on the wire today: `Event` carries only the
 *    opaque passthrough payload (see above), and `Sighting` has no downed
 *    state either — that gap is toolkit#1137 (open: "a cold client cannot
 *    learn who is DOWNED — the state exists only as a stream beat"). This
 *    renders unnamed until that lands, never a guess dressed as a fact
 *    (gate review, rpg-dnd5e-web#769).
 */
import {
  ClockKind,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSessionAttack } from '../../api/useSessionAttack';
import { useSessionEndTurn } from '../../api/useSessionEndTurn';
import { selectCombatPanel, type CombatPanelSelection } from './combatPanel';

export interface UseCombatPanelArgs {
  session: string;
  member: string;
  turnClock: ClockKind;
  turnActive: string;
  turnRound: number;
  turnOrder: string[];
  affordClock: ClockKind;
  affordDeclarations: Declaration[];
  /** Owned by the caller — `SessionEncounterView` is the single owner of
   * every Afford/Turn fetch, same discipline `useSessionWalk`'s own
   * `refetchWhere` param already keeps for GetWhere. */
  refetchAfford: () => Promise<void>;
  refetchTurn: () => Promise<void>;
}

export interface UseCombatPanelResult {
  selection: CombatPanelSelection;
  /** Wire straight to the canvas's entity click in `'target'` mode. Also
   * clears `targetingRequested` — see this module's own doc comment. */
  selectTarget: (subject: string) => void;
  /** Wire to the Attack button when `selection.attack.kind ===
   * 'pick-target'`. */
  enterTargetMode: () => void;
  /** No-ops unless `selection.attack.kind === 'attack' && .enabled`. */
  attackSelectedTarget: () => void;
  /** No-ops when `selection.endTurn` isn't enabled. */
  endTurn: () => void;
  /** Renders an unnamed "A member is downed." beat — see this module's
   * own doc comment for why it never names who (toolkit#1137). */
  noteDowned: () => void;
  attacking: boolean;
  endingTurn: boolean;
}

export function useCombatPanel(args: UseCombatPanelArgs): UseCombatPanelResult {
  const {
    session,
    member,
    turnClock,
    turnActive,
    turnRound,
    turnOrder,
    affordClock,
    affordDeclarations,
    refetchAfford,
    refetchTurn,
  } = args;

  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [targetingRequested, setTargetingRequested] = useState(false);
  const [lastBeat, setLastBeat] = useState<string | null>(null);

  // A fight ending (clock leaves TURN) drops any stale target/targeting-
  // request from the fight that just ended — the free-roam pill renders
  // next either way, but this keeps state honest for whenever the NEXT
  // fight starts.
  useEffect(() => {
    if (turnClock !== ClockKind.TURN) {
      setSelectedTargetId(null);
      setTargetingRequested(false);
    }
  }, [turnClock]);

  const { attack: dispatchAttack, loading: attacking } = useSessionAttack();
  const { endTurn: dispatchEndTurn, loading: endingTurn } = useSessionEndTurn();

  const selection = useMemo(
    () =>
      selectCombatPanel({
        turn: {
          clock: turnClock,
          active: turnActive,
          round: turnRound,
          order: turnOrder,
        },
        afford: { clock: affordClock, declarations: affordDeclarations },
        member,
        selectedTargetId,
        targetingRequested,
        lastBeat,
      }),
    [
      turnClock,
      turnActive,
      turnRound,
      turnOrder,
      affordClock,
      affordDeclarations,
      member,
      selectedTargetId,
      targetingRequested,
      lastBeat,
    ]
  );

  const enterTargetMode = useCallback(() => {
    setTargetingRequested(true);
  }, []);

  const selectTarget = useCallback((subject: string) => {
    setSelectedTargetId(subject);
    // Picked — return the floor to 'move' on its own (this module's own
    // doc comment: no separate "exit targeting" affordance).
    setTargetingRequested(false);
  }, []);

  const attackSelectedTarget = useCallback(() => {
    if (
      selection.mode !== 'turn' ||
      selection.attack.kind !== 'attack' ||
      !selection.attack.enabled ||
      !selectedTargetId
    ) {
      return;
    }
    const target = selectedTargetId;
    void (async () => {
      try {
        const response = await dispatchAttack({
          session,
          attacker: member,
          target,
        });
        setLastBeat(
          response.hit
            ? `You hit ${target}: ${response.roll} vs AC ${response.against} for ${response.damage}`
            : `You missed ${target}: ${response.roll} vs AC ${response.against}`
        );
      } catch (err) {
        setLastBeat(
          `Attack failed: ${err instanceof Error ? err.message : 'unknown error'}`
        );
      } finally {
        // Named per rpg-dnd5e-web#762 slice 5a's own comment — the
        // trigger it left for this handler to call.
        void refetchAfford();
        void refetchTurn();
      }
    })();
  }, [
    selection,
    selectedTargetId,
    dispatchAttack,
    session,
    member,
    refetchAfford,
    refetchTurn,
  ]);

  const endTurn = useCallback(() => {
    if (selection.mode !== 'turn' || !selection.endTurn.enabled) return;
    void (async () => {
      try {
        await dispatchEndTurn({ session, member });
      } catch {
        // Not separately surfaced (rare: only fires if the button was
        // enabled but the server disagreed, e.g. a race) — the refetch
        // below reconciles the panel to the true state either way.
      } finally {
        void refetchAfford();
        void refetchTurn();
      }
    })();
  }, [selection, dispatchEndTurn, session, member, refetchAfford, refetchTurn]);

  const noteDowned = useCallback(() => {
    setLastBeat('A member is downed.');
  }, []);

  return {
    selection,
    selectTarget,
    enterTargetMode,
    attackSelectedTarget,
    endTurn,
    noteDowned,
    attacking,
    endingTurn,
  };
}
