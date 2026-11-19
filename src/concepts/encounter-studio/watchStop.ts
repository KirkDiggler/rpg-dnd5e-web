/**
 * WHY YOU STOPPED (rpg-project#1011, the operator's look: "i am trying to
 * see who held me and why when i tried walking away").
 *
 * What stops a step, as the engine says it (rpg-toolkit encounter):
 * - A BODY OR A POST holds the way (`step.go`, `barred.go`): the step is
 *   answered with `StepOutput.Stopped{Barrier, Cell, Reason}` — the api's
 *   Move `stopReason` is that public sentence — and the record writes
 *   `barred {mover, barrier, cell, door?, verb?}`, the barrier being the
 *   holder (for a held crossing: the nearest holder the mover sees, else the
 *   nearest). So WHO is on the record.
 * - A GUARD ADDRESSES the mover at the end of a step (`address.go`): the
 *   step lands and the host drops the walk's remaining legs; the record
 *   writes `addressed {interaction, member, guard}`.
 * - A wall, a shut door, a fight: the step's refusal sentence only (no
 *   `barred`: `barred.go` "never a wall, a door, a field").
 *
 * The banner shows the step's own sentence (the Move answer, Live only) and
 * the record's `barred` and `addressed` beats of the shown step, by name.
 */
import type { RecordRow } from '@/components/session/recordFeed';
import { barredLine, namedId } from './runSpeech';
import { barredOf } from './runView';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The shown step's held and addressed lines, from the record. */
export function stopLinesOf(
  rows: readonly RecordRow[],
  from: number,
  upTo: number,
  names?: ReadonlyMap<string, string>
): string[] {
  const lines = barredOf(rows, upTo, from).map((b) => barredLine(b, names));
  const limit = Math.min(upTo, rows.length);
  for (let i = Math.max(0, from); i < limit; i++) {
    const row = rows[i]!;
    if (row.beat !== 'addressed' || !row.fields) continue;
    const guard = str(row.fields.guard);
    const member = str(row.fields.member);
    if (!guard) continue;
    lines.push(
      `${namedId(guard, names)} addressed ${member ? namedId(member, names) : 'someone'}`
    );
  }
  return lines;
}
