import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * A deed done in answer to another act (Family REACTION, Law 6): an
 * opportunity attack inside the walk that provoked it. It reads as the deed
 * it is, with its formula; the eyebrow names the reaction.
 */
export function ReactionForm({
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
  return <FormShell size={size} lines={lines} kind="reaction" />;
}
