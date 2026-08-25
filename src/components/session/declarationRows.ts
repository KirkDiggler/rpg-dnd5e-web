/**
 * declarationRows — the protos v0.1.143 adoption shim for the #253
 * "production combat experience contract" Declaration reshape
 * (rpg-api-protos#253), absorbed here because bumping the pin for
 * `AtlasProp.offset_z`/`AtlasBoundary.height` (rpg-api-protos#254,
 * rpg-project#272/#273) necessarily carries #253 with it — tags are
 * linear.
 *
 * What the wire changed: `affordable` renamed to `available` (same tag,
 * same bool); the one-Declaration-per-target ATTACK rows (ADR-0042's
 * `Declaration.target`) became ONE declaration carrying
 * `candidates[]` (each with its own `available`/`why`); the legacy
 * `shortfall` string left in favor of `why` (`Shortfall.text`); and
 * declarations grew `id`/`attack`/`target_kind` for the new declare-by-id
 * flow.
 *
 * What this module does about it: maps the new wire back onto the EXACT
 * row shape `turnHud.ts` and `combatPanel.ts` already render — one
 * candidate expands to one row, an untargeted declaration stays one row
 * — so the HUD's behavior is pinned unchanged through the bump. It
 * deliberately does NOT adopt `id`/`attack`/`target_kind`: the real #253
 * client experience (declare by declaration id, attack naming, target
 * kinds) belongs to the combat lane's own slice, with its own design and
 * walk — this shim exists so a facings/wall-height wave doesn't smuggle
 * combat UX changes in through a version pin.
 */
import type {
  Declaration,
  Shortfall,
  Slot,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/** One priced action row, in the pre-#253 per-target shape the HUD and
 * combat panel render. Web-owned: the wire's `Declaration` no longer has
 * this shape — `expandDeclarations` produces it. */
export interface DeclarationRow {
  verb: Verb;
  slot: Slot;
  /** The wire's `available` (nee `affordable`) — for a candidate row,
   * the CANDIDATE's own answer, exactly as the old per-target
   * declarations carried it. */
  affordable: boolean;
  /** `why.text` when present, else `''` — the human sentence the old
   * `shortfall` field carried. */
  shortfall: string;
  /** `Declaration.remaining`, verbatim — feet, Move only. */
  remaining?: number;
  /** The candidate member this row prices (`TargetCandidate.member`), or
   * `undefined` for Move/EndTurn and for the single "no target in
   * reach" attack row — the old `Declaration.target` contract. */
  target?: string;
  /** The structured refusal — the row's own candidate's `why` when it
   * is a candidate row, else the declaration's. Present exactly when
   * `affordable` is false. */
  why?: Shortfall;
}

/** The new wire's declarations, expanded to the old per-target rows —
 * see this module's own doc comment. */
export function expandDeclarations(wire: Declaration[]): DeclarationRow[] {
  const rows: DeclarationRow[] = [];
  for (const d of wire) {
    if (d.candidates.length > 0) {
      for (const c of d.candidates) {
        rows.push({
          verb: d.verb,
          slot: d.slot,
          affordable: c.available,
          shortfall: c.why?.text ?? '',
          remaining: d.remaining,
          target: c.member,
          why: c.why,
        });
      }
    } else {
      rows.push({
        verb: d.verb,
        slot: d.slot,
        affordable: d.available,
        shortfall: d.why?.text ?? '',
        remaining: d.remaining,
        why: d.why,
      });
    }
  }
  return rows;
}
