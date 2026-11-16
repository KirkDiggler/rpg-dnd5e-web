/**
 * A PLACE'S RAW PATH, ONE KEY AWAY (rpg-project#983). A place is shown in
 * words (`placeName`); the path the engine wrote stays available: the
 * place's `title`, and this small "Copy path" control beside it, reachable
 * by keyboard. It writes the clipboard and says "Copied"; where the
 * clipboard cannot be written (no secure context, a refusal), the path is
 * shown in a small popover, selected, to copy by hand. One component for
 * every place the studio shows.
 */
import { useEffect, useState } from 'react';

export function CopyPath({ path }: { path: string }): React.JSX.Element {
  const [state, setState] = useState<'idle' | 'copied' | 'by-hand'>('idle');
  useEffect(() => {
    if (state !== 'copied') return;
    const timer = setTimeout(() => setState('idle'), 1500);
    return () => clearTimeout(timer);
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
    <span className="es-copy-path">
      <button
        type="button"
        className="es-copy-path-button"
        aria-label="Copy path"
        title={path}
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
            type="text"
            readOnly
            aria-label="Path to copy"
            value={path}
            size={Math.min(path.length, 48)}
            ref={(element) => {
              element?.focus();
              element?.select();
            }}
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
