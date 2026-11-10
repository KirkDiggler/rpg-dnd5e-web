import { useMemo } from 'react';
import { formatRecordJSON } from '../recordCapture';
import type { RecordRow } from '../recordFeed';
import {
  readBehaviorTrace,
  type BehaviorSymbolIndex,
  type GuardReading,
} from './behaviorSymbols';
import styles from './BehaviorTrace.module.css';
import { answeredOf, readAnswer, type TableSymbol } from './recordSymbols';

interface BehaviorTraceProps {
  row: RecordRow;
  symbols: BehaviorSymbolIndex;
  records: ReadonlyMap<string, RecordRow>;
  tableSymbols: ReadonlyMap<string, TableSymbol>;
  showLinkedDecision?: boolean;
}

/** Inspection only: every verdict, choice and state comes from captured values.
 * Configuration explains what a node means; this component never runs it. */
export function BehaviorTrace({
  row,
  symbols,
  records,
  tableSymbols,
  showLinkedDecision = true,
}: BehaviorTraceProps) {
  const reading = useMemo(
    () => readBehaviorTrace({ row, symbols, records }),
    [row, symbols, records]
  );
  if (!reading) return null;
  const answer = answeredOf(reading.pick?.fields ?? reading.inlinePick);
  const pick = answer
    ? readAnswer(
        answer,
        reading.pick ? tableSymbols.get(reading.pick.id) : undefined
      )
    : undefined;
  const original = reading.work?.decisionRecord
    ? records.get(reading.work.decisionRecord)
    : undefined;
  return (
    <section className={styles.trace} aria-label="Behavior inspection">
      <h4>{reading.title}</h4>
      {reading.warnings.length > 0 && (
        <p role="status" className={styles.warning}>
          {reading.warnings.join(' ')}
        </p>
      )}
      {reading.configuration && (
        <details>
          <summary>Original bound configuration</summary>
          <p>
            <code>{reading.configuration.id}</code>
          </p>
          <pre>{formatRecordJSON(reading.configuration.raw)}</pre>
        </details>
      )}
      {reading.roles.length > 0 && (
        <ol className={styles.roles} aria-label="Roles considered">
          {reading.roles.map((role) => (
            <li key={role.id} className={styles.role}>
              <h5>
                {role.id} <small>{role.ref}</small>
              </h5>
              <p>
                <strong>{role.status}</strong>
              </p>
              <p>
                State <code>{role.before}</code> → <code>{role.after}</code>
              </p>
              {role.proposedAfter && role.proposedAfter !== role.after && (
                <p>
                  Proposed state <code>{role.proposedAfter}</code> — not
                  committed
                </p>
              )}
              {role.requested && (
                <p>
                  Requested table <code>{role.requested}</code>
                </p>
              )}
              <ol aria-label={`Transitions of ${role.id}`}>
                {role.transitions.map((transition) => (
                  <li key={transition.index}>
                    <p>
                      Transition {transition.index + 1}: on{' '}
                      <code>{transition.on}</code>
                      {transition.to && (
                        <>
                          {' '}
                          → <code>{transition.to}</code>
                        </>
                      )}
                      {transition.chosen && ' · matched proposal'}
                    </p>
                    <GuardView guard={transition.guard} />
                    {transition.acts.length > 0 && (
                      <details>
                        <summary>Configured actions</summary>
                        <pre>{formatRecordJSON(transition.acts)}</pre>
                      </details>
                    )}
                  </li>
                ))}
              </ol>
              {role.table !== undefined && (
                <details>
                  <summary>
                    Configured table {role.requested} — not reevaluated
                  </summary>
                  <pre>{formatRecordJSON(role.table)}</pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
      {pick && (
        <div className={styles.picker} aria-label="Picker evidence">
          <h5>Actual weighted choice</h5>
          <p>{pick.sentence}</p>
          <ul>
            {pick.lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {reading.work && (
        <div>
          <p>
            Role <code>{reading.work.instance}</code> · table{' '}
            <code>{reading.work.key}</code>
          </p>
          {reading.work.goal !== undefined && (
            <p>
              Goal <code>{formatRecordJSON(reading.work.goal)}</code>
            </p>
          )}
          {reading.work.reason && <p>Reason: {reading.work.reason}</p>}
          <p>
            Decision record{' '}
            <code>{reading.work.decisionRecord || 'unavailable'}</code>
          </p>
          {showLinkedDecision && original?.beat === 'behavior_decision' && (
            <details>
              <summary>Original recorded decision</summary>
              <BehaviorTrace
                row={original}
                symbols={symbols}
                records={records}
                tableSymbols={tableSymbols}
                showLinkedDecision={false}
              />
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function GuardView({ guard }: { guard: GuardReading }) {
  return (
    <div className={styles.guard}>
      <p>
        <code>{guard.label}</code> ·{' '}
        <strong data-verdict={guard.status}>{guard.status}</strong>
        {guard.observed !== undefined && (
          <>
            {' '}
            · <span>observed {guard.observed}</span>
          </>
        )}
        {guard.reason && (
          <>
            {' '}
            · <span>{guard.reason}</span>
          </>
        )}
      </p>
      {guard.children.length > 0 && (
        <ul>
          {guard.children.map((child, i) => (
            <li key={i}>
              <GuardView guard={child} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
