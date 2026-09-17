import {
  TargetKind,
  Verb,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * ONE TABLE THE COMBAT CLIENT READS INSTEAD OF SIX HAND-WRITTEN VERB LISTS
 * (rpg-dnd5e-web#1104, paid by rpg-project#458).
 *
 * # What went wrong six times
 *
 * The live combat client enumerated verbs by hand in six places — the dock's
 * row filter, `organizeDeclarations`, `currentExecutableDeclaration`, the
 * coherence check that judges an armed offer a render later, the target-click
 * dispatch, and `TargetSurface`'s member-targeted set — and NONE OF THEM
 * FAILED CLOSED. A verb missing from one list gave a different symptom each
 * time, and every symptom looked like a different bug:
 *
 *   - missing from a row filter: no button at all, dropped before anything
 *     downstream ever saw it;
 *   - missing from a label function: a row drawn as "Move", because Move is
 *     what both label functions default to;
 *   - missing from the coherence check: a row that arms and then tears itself
 *     down one render later as "That option changed";
 *   - missing from the dispatch: a button that clicks and sends no RPC.
 *
 * Bardic Inspiration shipped one of these. Thunderwave shipped another.
 * Intimidate would have shipped a third. Adding Persuade — a verb that is
 * Intimidate's twin in every respect — would have meant six more edits with
 * six more chances to miss one, so this is the slice that pays it down.
 *
 * # The shape, and why it is a table rather than a switch
 *
 * One row per verb, keyed by the proto's own `Verb`. The six sites ask this
 * table a question instead of restating a list, so a new verb is ONE ROW and a
 * forgotten row is a red test rather than a dead button on a walk.
 *
 * IT IS EXHAUSTIVE BY TEST, not by type. `verbRegistry.test.ts` walks every
 * value the proto enum defines and fails on any the table does not know, which
 * is the half TypeScript cannot give us: the enum is generated and grows
 * without this file being recompiled against it.
 *
 * # What is NOT in here
 *
 * The RPC each verb sends, and the label and icon it draws. Dispatch bodies
 * differ enough per verb to be worth reading in full at the call site — Attack
 * echoes a selector, the social verbs send none, Cast carries a chosen option
 * — and hiding that behind a table row would trade six visible lists for one
 * invisible indirection. What the table answers is the four questions whose
 * WRONG ANSWER IS SILENT.
 */
export interface VerbBehavior {
  /**
   * Whether the dock DRAWS a row for this verb, and whether the row is
   * resolvable at dispatch time.
   *
   * False is the loud answer here: END_TURN has its own separate control and
   * REACT is answered through the interrupt window, so neither belongs in the
   * priced row list. UNSPECIFIED is false because a verb this build cannot
   * name must not be drawn as anything.
   */
  executable: boolean;

  /**
   * What this verb waits for once armed, or null for a verb that does not arm
   * and fires on click.
   *
   * MEMBER means the offer carries a candidate list the server ruled and the
   * player picks one of them. CELL means it waits for a place. Null means the
   * click IS the whole interaction.
   *
   * This is the field whose absence produced the ugliest symptom: a verb that
   * arms but is not listed as arming is judged incoherent one render later and
   * torn down as "That option changed", which reads to a player as a dead
   * button.
   */
  arms: TargetKind | null;

  /**
   * Whether this verb's row draws on the WORLD clock as well as the turn clock
   * (rpg-project#457 R3).
   *
   * Afford is the authority and this client decides nothing: the server sends
   * the rows it sends. What this flag records is the consequence for
   * PRESENTATION — a world-clock row has no turn economy behind it, so it
   * shows no cost badge, because a price of nothing rendered as a price is a
   * claim about an economy that does not exist on that clock.
   */
  freeOnWorldClock: boolean;
}

/**
 * The table. Every value of the proto `Verb` enum has a row, and
 * `verbRegistry.test.ts` fails if one ever does not.
 */
export const VERB_REGISTRY: Readonly<Record<Verb, VerbBehavior>> =
  Object.freeze({
    // A verb this build cannot name is drawn as nothing, armed for nothing and
    // dispatched to nothing. THE ZERO VALUE TELLS THE TRUTH: the wire adds
    // verbs over time and an old client meeting a new one must go quiet about
    // it rather than guess, which is what the six default-to-'Move' label
    // functions did instead.
    [Verb.UNSPECIFIED]: {
      executable: false,
      arms: null,
      freeOnWorldClock: false,
    },

    // The swing. Arms, waits for a candidate Afford ruled, echoes its selector
    // back on dispatch.
    [Verb.ATTACK]: {
      executable: true,
      arms: TargetKind.MEMBER,
      freeOnWorldClock: false,
    },

    // Move is drawn, and it does NOT arm: the path is picked on the map
    // through its own surface rather than from a candidate list. It is also
    // deliberately not a world-clock ROW even though moving on the world clock
    // is free — free roam has its own movement affordance.
    [Verb.MOVE]: { executable: true, arms: null, freeOnWorldClock: false },

    // End Turn has its own separate control in the dock and is never a priced
    // row. Listing it as executable would draw it twice.
    [Verb.END_TURN]: {
      executable: false,
      arms: null,
      freeOnWorldClock: false,
    },

    // An ability. Arms and waits for a member, like a swing.
    [Verb.ACTIVATE]: {
      executable: true,
      arms: TargetKind.MEMBER,
      freeOnWorldClock: false,
    },

    // A death save is drawn but never armed: there is nobody to point it at,
    // and the click IS the roll. Its own shape check gates it further at each
    // site, which is a fact about the SHAPE of one declaration rather than
    // about the verb, so it stays where it is.
    [Verb.DEATH_SAVE]: {
      executable: true,
      arms: null,
      freeOnWorldClock: false,
    },

    // The D&D reaction — the interrupt window. Answered through its own
    // window, never as a dock row, which is exactly why the answer table one
    // slice over is called an ANSWER and not a reaction.
    [Verb.REACT]: { executable: false, arms: null, freeOnWorldClock: false },

    // A spell. Arms, and what it waits for depends on the spell: a cast aimed
    // at a creature carries MEMBER, one aimed at a place carries CELL. The
    // declaration's own targetKind decides, so the row records MEMBER as the
    // candidate-list case and the CELL case is read off the declaration.
    [Verb.CAST]: {
      executable: true,
      arms: TargetKind.MEMBER,
      freeOnWorldClock: false,
    },

    // The threat (rpg-project#454). Arms like a swing against a candidate list
    // that points the OTHER WAY — the members who can see the actor, not the
    // ones the actor can see — which nothing in this client needs to know,
    // because it reads the list and never the direction.
    //
    // FREE ON THE WORLD CLOCK as of R3: the front room has no fight, so it has
    // no economy to fall short of.
    [Verb.INTIMIDATE]: {
      executable: true,
      arms: TargetKind.MEMBER,
      freeOnWorldClock: true,
    },

    // The appeal (rpg-project#458). Intimidate's twin, and its row here is
    // identical on purpose: the whole point of this table is that adding the
    // second social verb is one row rather than six edits.
    [Verb.PERSUADE]: {
      executable: true,
      arms: TargetKind.MEMBER,
      freeOnWorldClock: true,
    },
  });

/** Every value the proto `Verb` enum defines, for the exhaustiveness test. */
export const ALL_VERBS: readonly Verb[] = Object.freeze(
  Object.values(Verb).filter(
    (value): value is Verb => typeof value === 'number'
  )
);

/**
 * Whether the dock draws a priced row for this verb.
 *
 * ASK THIS RATHER THAN LISTING VERBS. An unlisted verb is not a dead button —
 * it is no button at all, dropped before the arm, the click, or anything
 * downstream ever sees it.
 */
export function isExecutableVerb(verb: Verb): boolean {
  return VERB_REGISTRY[verb]?.executable ?? false;
}

/**
 * Whether an armed offer of this verb is waiting for a MEMBER the server named.
 *
 * This is the coherence check's question. A verb that arms and is not listed
 * here is judged incoherent one render later and torn down as "That option
 * changed" — clickable, then gone, with no RPC ever sent.
 */
export function promptsForMember(verb: Verb | undefined): boolean {
  return verb === undefined
    ? false
    : VERB_REGISTRY[verb]?.arms === TargetKind.MEMBER;
}

/**
 * Whether this verb is offered free on the world clock (R3).
 *
 * PRESENTATION ONLY. Afford decides what rows exist and what they cost; this
 * says a row that arrived on the world clock has no price to draw, because the
 * world clock has no economy — which is Move's own rule and not a discount.
 */
export function isFreeOnWorldClock(verb: Verb): boolean {
  return VERB_REGISTRY[verb]?.freeOnWorldClock ?? false;
}

/**
 * The two social verbs, as one list, for the sites that genuinely mean "a
 * social verb" rather than "a verb that arms for a member".
 *
 * A DERIVED LIST RATHER THAN A SEVENTH HAND-WRITTEN ONE: it reads the table's
 * own `freeOnWorldClock` flag, so a third social verb joins it by adding its
 * row above and nothing else.
 */
export const SOCIAL_VERBS: readonly Verb[] = Object.freeze(
  ALL_VERBS.filter((verb) => VERB_REGISTRY[verb].freeOnWorldClock)
);
