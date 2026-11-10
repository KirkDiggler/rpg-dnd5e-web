import {
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

/**
 * THE HAIL (rpg-project#923): a guard addressing this member, read off the
 * member's own Speak row.
 *
 * `Declaration.address` is present only on the addressed member's VERB_SPEAK
 * row while the address stands. It grants nothing; this module only names it.
 * Whether a guard may address anyone, and when the address ends, is the
 * encounter's ruling, never the client's.
 */
export interface StandingSpeakAddress {
  /** The Speak row carrying the address, the offer the panel arms. */
  readonly declaration: Declaration;
  /** The guard doing the addressing, a SpeakOption member id. */
  readonly guard: string;
  /** Guard and interaction together: "the same address" for dismissal. */
  readonly key: string;
}

/**
 * The one address on the current offer, or undefined when there is none or
 * the snapshot is incoherent (more than one addressed Speak row, which the
 * contract never sends: one acting character, one addressee per interaction).
 */
export function speakAddressOf(
  declarations: readonly Declaration[]
): StandingSpeakAddress | undefined {
  const addressed = declarations.filter(
    (declaration) =>
      declaration.verb === Verb.SPEAK &&
      declaration.targetKind === TargetKind.MEMBER &&
      declaration.id.length > 0 &&
      (declaration.address?.guardMemberId.length ?? 0) > 0
  );
  if (addressed.length !== 1) return undefined;
  const declaration = addressed[0]!;
  const address = declaration.address!;
  return {
    declaration,
    guard: address.guardMemberId,
    key: `${address.guardMemberId}\u0000${address.interactionId}`,
  };
}

/**
 * Where the camera goes when the hail opens the panel: the guard, under a key
 * that changes once per opening, so the canvas's keyed presentation focus
 * (the same path a monster's turn start takes) centres once and never chases.
 */
export interface HailFocus {
  readonly key: string;
  readonly guard: string;
}
