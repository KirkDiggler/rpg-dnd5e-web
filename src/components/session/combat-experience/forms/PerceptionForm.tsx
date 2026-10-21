import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * What one observer newly perceived (Family PERCEPTION): a sound heard, a
 * search and its check, a secret found. Sight and cells are the canvas's and
 * describe to nothing.
 */
export function PerceptionForm({
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
  return <FormShell size={size} lines={lines} kind="perception" />;
}
