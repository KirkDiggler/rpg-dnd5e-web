import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * A change of standing an act caused (Family STATE): a fall, a stance, a
 * concentration ended, a condition lifted, experience paid. It rolled
 * nothing of its own: the deed above it holds the roll.
 */
export function StateForm({
  act,
  size,
  context,
}: {
  act: Act;
  size: FormSize;
  context: DescribeContext;
}) {
  const lines = formLines(act, context, false);
  if (!lines) return null;
  return <FormShell size={size} lines={lines} kind="state" />;
}
