/**
 * MoveKind — how a body moved on a walk (rpg-project#825, design R1).
 *
 * `own` is a walk the creature chose; `compelled` is its own legs under
 * somebody else's order (Command, Dissonant Whispers); `displaced` is a body
 * moved without its legs (Thunderwave). Only `displaced` slides with no walk
 * cycle and no turn; `own` and `compelled` walk.
 */
export type MoveKind = 'own' | 'compelled' | 'displaced';
