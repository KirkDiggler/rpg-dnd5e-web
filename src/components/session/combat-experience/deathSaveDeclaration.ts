import {
  Slot,
  TargetKind,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

export type DeathSaveDeclarationSeam = 'display' | 'execute';

/**
 * One shared structural gate for the explicit no-target Death Save verb.
 * Display may retain a provider-disabled compiled offer; execution additionally
 * requires the current non-empty selector and provider availability.
 */
export function isDeathSaveExecutableShape(
  declaration: Declaration,
  seam: DeathSaveDeclarationSeam
): boolean {
  const shaped =
    declaration.verb === Verb.DEATH_SAVE &&
    declaration.slot === Slot.NONE &&
    declaration.deathSave !== undefined &&
    declaration.targetKind === TargetKind.NONE &&
    declaration.candidates.length === 0;
  if (!shaped) return false;
  return (
    seam === 'display' || (declaration.id.length > 0 && declaration.available)
  );
}
