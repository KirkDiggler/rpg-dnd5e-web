import { toJsonString } from '@bufbuild/protobuf';
import { EventSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/events_pb';
import { useMemo, useState, type ReactNode } from 'react';
import type { DebugEventEntry } from '../debugLogLine';
import styles from './DebugEventRow.module.css';

// Token coloring only: every character still renders as escaped React text.
// This never parses display text into game data or injects markup.
function highlightedJson(json: string): ReactNode[] {
  const token =
    /"(?:\\.|[^"\\])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  const parts: ReactNode[] = [];
  let end = 0;
  for (const match of json.matchAll(token)) {
    const start = match.index!;
    if (start > end) parts.push(json.slice(end, start));
    const text = match[0];
    const kind = text.startsWith('"')
      ? text.endsWith(':')
        ? 'key'
        : 'string'
      : text === 'null'
        ? 'null'
        : /^(true|false)$/.test(text)
          ? 'boolean'
          : 'number';
    parts.push(
      <span key={start} data-json-token={kind}>
        {text}
      </span>
    );
    end = start + text.length;
  }
  if (end < json.length) parts.push(json.slice(end));
  return parts;
}

export function DebugEventRow({
  entry,
  onInspect,
  onWiden,
}: {
  entry: DebugEventEntry;
  onInspect: () => void;
  onWiden: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  );
  // Format only inspected entries, directly from the retained typed event.
  // Protobuf JSON preserves uint64 as strings and bytes as base64; it omits
  // runtime $typeName metadata without dropping the wire's known fields.
  const json = useMemo(() => {
    if (!expanded) return undefined;
    try {
      return toJsonString(EventSchema, entry.event, {
        prettySpaces: 2,
        alwaysEmitImplicit: true,
      });
    } catch {
      return undefined;
    }
  }, [entry.event, expanded]);
  const tokens = useMemo(
    () => (json === undefined ? null : highlightedJson(json)),
    [json]
  );
  const copy = async () => {
    if (json === undefined) return;
    try {
      await navigator.clipboard.writeText(json);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  return (
    <details
      className={styles.row}
      open={expanded}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setExpanded(open);
        if (open) onInspect();
      }}
    >
      <summary
        role="button"
        aria-label={`Inspect event ${entry.summary}`}
        aria-expanded={expanded}
      >
        {entry.summary}
      </summary>
      {expanded &&
        (json !== undefined ? (
          <>
            <button
              type="button"
              className={styles.copy}
              onClick={() => void copy()}
            >
              {copyState === 'copied' ? 'Copied' : 'Copy JSON'}
            </button>
            {copyState === 'failed' && (
              <p className={styles.notice}>
                Copy failed — select the JSON to copy it.
              </p>
            )}
            <pre
              aria-label="Formatted event JSON"
              className={styles.json}
              tabIndex={0}
              onClick={onWiden}
              onFocus={onWiden}
            >
              <code>{tokens}</code>
            </pre>
          </>
        ) : (
          <>
            <p className={styles.notice}>
              JSON formatting unavailable; original diagnostic text follows.
            </p>
            <pre className={styles.fallback}>{entry.text}</pre>
          </>
        ))}
    </details>
  );
}
