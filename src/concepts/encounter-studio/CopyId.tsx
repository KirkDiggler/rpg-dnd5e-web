import { useEffect, useState } from 'react';

/** An id kept off the page and one click from the clipboard
 * (rpg-project#579). The id stays in `title` for hover and in the button's
 * name for tests and assistive tools; it is never the line's text. */
export function CopyId({
  id,
  label,
}: {
  id: string;
  /** What the id belongs to: "placement" reads "Copy placement id". */
  label: string;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="es-copy-id"
      title={id}
      aria-label={`Copy ${label} id`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(id)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? 'Copied' : 'Copy id'}
    </button>
  );
}
