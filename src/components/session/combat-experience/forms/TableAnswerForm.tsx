import type { Act } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';

/**
 * A table roll's answer (Family TABLE_ANSWER): a creature's pick, a line's
 * answer, a temperament deal. Its formula is the table die, `d100: 75`.
 */
export function TableAnswerForm({
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
  return <FormShell size={size} lines={lines} kind="table-answer" />;
}
