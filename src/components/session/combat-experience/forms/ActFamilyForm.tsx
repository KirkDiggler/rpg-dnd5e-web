import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * A verb's own deed (Family ACT), one case per act body. A deed decided by a
 * roll — a swing, a cast, a line, a save, a door forced, a sneak, a rest —
 * shows its formula and breakdown; a deed that rolled nothing is its line.
 */
export function ActFamilyForm({
  act,
  size,
  context,
}: {
  act: Act;
  size: FormSize;
  context: DescribeContext;
}) {
  const body = act.body;
  let rolled: boolean;
  switch (body.case) {
    case 'attack':
    case 'cast':
    case 'activate':
    case 'speak':
    case 'deathSave':
    case 'door':
    case 'sneak':
    case 'rest':
      rolled = true;
      break;
    case 'walk':
    case 'loot':
    case 'hold':
    case 'drop':
    case 'equip':
    case 'stay':
      rolled = false;
      break;
    case 'tableAnswer':
    case 'state':
    case 'perception':
    case 'clock':
    case undefined:
      // Another family's body under FAMILY_ACT: say what it is, no formula.
      rolled = false;
      break;
    default: {
      const never: never = body;
      return never;
    }
  }
  const lines = formLines(act, context, rolled);
  if (!lines) return null;
  return <FormShell size={size} lines={lines} kind={`act:${body.case}`} />;
}
