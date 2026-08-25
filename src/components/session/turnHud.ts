/**
 * turnHud — pure mapping from an `Afford` answer to what the turn HUD
 * draws (rpg-dnd5e-web#762 slice 5a). Kirk's ruling on toolkit#1138:
 * "backend tells dumb client what it can do. in our ui we hand shapes
 * for action, bonus and reaction that lined up with the various things
 * we could do. that was really nice." This module IS that hand-off: it
 * never re-derives 5e's economy, only relabels the server's own
 * can-or-cannot answer into the three lit/dim shapes and the declaration
 * rows a client already has buttons for. Framework-free by design — no
 * React — same reasoning `moveIndicator.ts` gives for its own split from
 * `MoveIndicator.tsx`.
 *
 * # Only two modes, by the seam's own design (ADR-0042 / toolkit#1161)
 *
 * `AffordResponse.clock` says which case this is (`AffordResponse`'s own
 * doc comment): `CLOCK_KIND_WORLD` means "the action economy does not
 * apply to them at all" — EMPTY declarations there IS the answer, never
 * "unknown". This module folds anything that is not `CLOCK_KIND_TURN`
 * into `'free-roam'`, which covers both the documented `CLOCK_KIND_WORLD`
 * case AND `CLOCK_KIND_UNSPECIFIED` — the same value `useSessionAfford`
 * starts at before its first successful fetch lands. There is no third
 * "not sure yet" mode in this contract (unlike `moveIndicator.ts`'s
 * `null` for "nothing to judge yet"): a not-yet-fetched budget and free
 * roam both read as the quiet "Free roam" pill rather than a fabricated
 * turn state, which is the least presumptuous of the two real answers
 * this module can give without more information than `{clock,
 * declarations}` carries.
 *
 * # `lit` follows affordability, not slot alone
 *
 * A shape lights when SOME declaration names that slot AND is payable
 * right now — SLOT_NONE declarations (a banked Extra Attack swing, see
 * `Slot`'s own doc comment) never light any of the three shapes, because
 * they draw from no per-turn shape, but they are still listed in
 * `declarations` below with their own affordability and shortfall text.
 * PER-TARGET ATTACK DECLARATIONS (rpg-project#249 §3, rpg-toolkit#1010):
 * Afford now emits one ATTACK declaration per candidate target in reach,
 * so several rows can share the same slot — `.some(...)` already reads
 * correctly there (the shape lights the moment ANY one of them is
 * affordable), no change needed for this module to stay correct under
 * that shape.
 *
 * # SLOT_UNSPECIFIED is a producer bug, not a fourth shape
 *
 * `Slot`'s own doc comment: 0 means the producer failed to set it, the
 * same UNSPECIFIED-is-a-defect convention every enum at this seam keeps.
 * A declaration with that slot lights nothing (there is no shape to
 * light) but is still listed — dropping it would hide a real answer
 * (whether the verb is affordable) behind a wire defect the CLIENT did
 * not cause. Logged once per `selectTurnHud` call (not once per bad
 * declaration) so a single bad response doesn't spam the console.
 */
import {
  ClockKind,
  Slot,
  type Shortfall,
  type Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type { DeclarationRow } from './declarationRows';

/** The three economy shapes a turn HUD has buttons for — Kirk's own
 * vocabulary, not a proto import, because `Slot` also carries
 * `SLOT_NONE`/`SLOT_UNSPECIFIED`, neither of which is a shape to draw. */
export type TurnHudSlotName = 'action' | 'bonus' | 'reaction';

export interface TurnHudShape {
  slot: TurnHudSlotName;
  lit: boolean;
}

/** One declaration row, unchanged from the wire — formatting it into a
 * sentence ("Attack — ready") is `TurnHud.tsx`'s job, not this module's;
 * this stays the raw proto-shaped answer per the component-props-match-
 * protobuf convention. */
export interface TurnHudDeclarationRow {
  verb: Verb;
  slot: Slot;
  affordable: boolean;
  /** KEPT FOR v0.1.131 READERS (`Declaration.shortfall`'s own doc
   * comment) — `TurnHud.tsx` (the standalone slice-5a building block)
   * still reads this. New code reads `why` instead. */
  shortfall: string;
  /** How much of this verb's own currency is left, in feet — PRESENT for
   * `VERB_MOVE`, `undefined` for every other verb (`Declaration.remaining`'s
   * own doc comment: a number, not a price, and absent-not-zero when a
   * verb carries no such currency at all — rpg-toolkit#1169). `turnHud.ts`
   * itself never reads this (Move draws `SLOT_NONE`, so it never lights a
   * shape); it passes through for `combatPanel.ts`'s own dedicated
   * movement row. */
  remaining?: number;
  /** ATTACK only: the candidate target this declaration prices — one row
   * per target in reach, `undefined` for Move and for the single "no
   * target in reach" row (`Declaration.target`'s own doc comment,
   * rpg-toolkit#1010). Passed through for `combatPanel.ts`'s own
   * per-target affordance list; this module makes no per-target
   * judgment of its own. */
  target?: string;
  /** The structured reason this row is unaffordable — present exactly
   * when `affordable` is false (`Declaration.why`'s own doc comment).
   * Passed through verbatim for `combatPanel.ts`'s disabled-state copy. */
  why?: Shortfall;
}

export type TurnHudSelection =
  | { mode: 'free-roam' }
  | {
      mode: 'turn';
      shapes: TurnHudShape[];
      declarations: TurnHudDeclarationRow[];
    };

export interface SelectTurnHudArgs {
  clock: ClockKind;
  declarations: DeclarationRow[];
}

const HUD_SLOT_ORDER: TurnHudSlotName[] = ['action', 'bonus', 'reaction'];

const SLOT_TO_HUD_NAME: Partial<Record<Slot, TurnHudSlotName>> = {
  [Slot.ACTION]: 'action',
  [Slot.BONUS]: 'bonus',
  [Slot.REACTION]: 'reaction',
};

export function selectTurnHud(args: SelectTurnHudArgs): TurnHudSelection {
  const { clock, declarations } = args;

  if (clock !== ClockKind.TURN) {
    // See this module's own doc comment ("Only two modes") — WORLD and
    // UNSPECIFIED (not-yet-fetched) both read as free roam.
    return { mode: 'free-roam' };
  }

  const unspecifiedCount = declarations.filter(
    (d) => d.slot === Slot.UNSPECIFIED
  ).length;
  if (unspecifiedCount > 0) {
    // A producer bug signal — see this module's own doc comment.
    console.warn(
      `[turnHud] ${unspecifiedCount} declaration(s) arrived with ` +
        'SLOT_UNSPECIFIED — the producer failed to project a shape ' +
        '(rpg-api bug, not a client one). Listing them with nothing lit.'
    );
  }

  const shapes: TurnHudShape[] = HUD_SLOT_ORDER.map((slotName) => ({
    slot: slotName,
    lit: declarations.some(
      (d) => d.affordable && SLOT_TO_HUD_NAME[d.slot] === slotName
    ),
  }));

  const rows: TurnHudDeclarationRow[] = declarations.map((d) => ({
    verb: d.verb,
    slot: d.slot,
    affordable: d.affordable,
    shortfall: d.shortfall,
    remaining: d.remaining,
    target: d.target,
    why: d.why,
  }));

  return { mode: 'turn', shapes, declarations: rows };
}
