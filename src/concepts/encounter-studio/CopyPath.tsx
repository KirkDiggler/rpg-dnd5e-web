/**
 * A PLACE'S RAW PATH, ONE KEY AWAY (rpg-project#983). A place is shown in
 * words (`placeName`); the path the engine wrote stays available: the
 * place's `title`, and a small "Copy path" control beside it. It writes the
 * clipboard and says "Copied"; where the clipboard cannot be written (no
 * secure context, a refusal), the path is shown in a small popover,
 * selected once, to copy by hand. One component for every place shown.
 *
 * QUIET BESIDE A FOCUSABLE PLACE (`CopyPathGroup`): a creature's read-back
 * shows dozens of places, so their copy controls are not dozens of Tab
 * stops. The place and its copy control form one group; the control shows
 * on hover or while the group has focus, and it is the NEXT Tab stop only
 * while the place (or the control) has focus: Tab from a place link reaches
 * its Copy path, and leaving the group takes it out of the Tab order again.
 * Beside a place that takes no focus (an unmapped refusal, a not-yet-said
 * entry) the control stays a plain button, so it is reachable by keyboard.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

export function CopyPath({
  path,
  tabbable = true,
}: {
  path: string;
  /** False keeps it out of the Tab order (its group decides). */
  tabbable?: boolean;
}): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'by-hand'>('idle');
  const field = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  // The hand-copy field takes focus and selects once, when it opens.
  useEffect(() => {
    if (state !== 'by-hand') return;
    field.current?.focus();
    field.current?.select();
  }, [state]);
  const copy = async (): Promise<void> => {
    try {
      const clipboard = navigator.clipboard;
      if (!clipboard?.writeText) throw new Error('no clipboard');
      await clipboard.writeText(path);
      setState('copied');
    } catch {
      setState('by-hand');
    }
  };
  return (
    <span className="es-copy-path" data-state={state}>
      <button
        type="button"
        className="es-copy-path-button"
        aria-label="Copy path"
        title={path}
        tabIndex={tabbable ? 0 : -1}
        onClick={() => void copy()}
      >
        <span aria-hidden="true">⧉</span>
      </button>
      {state === 'copied' && (
        <span role="status" className="es-copy-path-said">
          Copied
        </span>
      )}
      {state === 'by-hand' && (
        <span className="es-copy-path-popover">
          <input
            ref={field}
            type="text"
            readOnly
            aria-label="Path to copy"
            value={path}
            size={Math.min(path.length, 48)}
            onBlur={() => setState('idle')}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setState('idle');
            }}
          />
        </span>
      )}
    </span>
  );
}

/** A focusable place and its quiet Copy path, as one group. */
export function CopyPathGroup({
  path,
  children,
}: {
  path: string;
  /** The place itself: a link or button. */
  children: ReactNode;
}): React.JSX.Element {
  const [within, setWithin] = useState(false);
  return (
    <span
      className="es-copy-group"
      data-active={within || undefined}
      onFocus={() => setWithin(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setWithin(false);
      }}
    >
      {children}
      <CopyPath path={path} tabbable={within} />
    </span>
  );
}
