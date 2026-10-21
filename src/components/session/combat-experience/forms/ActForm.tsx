import {
  Family,
  type Act,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha2/act_pb';
import type { DescribeContext } from '../describeAct';
import { ActFamilyForm } from './ActFamilyForm';
import { ClockForm } from './ClockForm';
import { formLines } from './formLines';
import { FormShell, type FormSize } from './FormShell';
import { PerceptionForm } from './PerceptionForm';
import { ReactionForm } from './ReactionForm';
import { StateForm } from './StateForm';
import { TableAnswerForm } from './TableAnswerForm';

/**
 * ONE FORM PER FAMILY, AT TWO SIZES (rpg-dnd5e-web#1301, R16). The toast and
 * the story log draw the same form: `toast` is the describer line, `log` is
 * that line with the formula line and the breakdown folded under it. There is
 * no second renderer for either size. `context.viewerMember` is the member
 * the form is drawn for.
 */
export function ActForm({
  act,
  size,
  context,
}: {
  act: Act;
  size: FormSize;
  context: DescribeContext;
}) {
  const props = { act, size, context };
  switch (act.family) {
    case Family.ACT:
      return <ActFamilyForm {...props} />;
    case Family.REACTION:
      return <ReactionForm {...props} />;
    case Family.TABLE_ANSWER:
      return <TableAnswerForm {...props} />;
    case Family.STATE:
      return <StateForm {...props} />;
    case Family.PERCEPTION:
      return <PerceptionForm {...props} />;
    case Family.CLOCK:
      return <ClockForm {...props} />;
    default: {
      // A refused act, or a family this client does not know: its line.
      const lines = formLines(act, context, false);
      return lines ? (
        <FormShell size={size} lines={lines} kind="other" />
      ) : null;
    }
  }
}
