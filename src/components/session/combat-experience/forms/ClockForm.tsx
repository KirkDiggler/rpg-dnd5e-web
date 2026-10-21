import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * The table's own bookkeeping (Family CLOCK): turns, a fight forming and
 * ending, arrivals and departures, windows. Only a roll window carries a
 * roll: the one it asks about.
 */
export function ClockForm({
  act,
  size,
  context,
}: {
  act: Act;
  size: FormSize;
  context: DescribeContext;
}) {
  const lines = formLines(act, context);
  if (!lines) return null;
  return <FormShell size={size} lines={lines} kind="clock" />;
}
