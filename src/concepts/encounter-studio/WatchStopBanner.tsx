/** Always-visible: why the shown step stopped, and who held it
 * (`watchStop.ts`). */
export function WatchStopBanner({
  refusal,
  lines,
  testId = 'watch-stop-banner',
}: {
  /** The step's own sentence (the Move answer); Live only. */
  refusal?: string | null;
  lines: readonly string[];
  testId?: string;
}): React.JSX.Element | null {
  if (!refusal && lines.length === 0) return null;
  return (
    <p
      className="es-watch-stop"
      role={refusal ? 'alert' : 'status'}
      data-testid={testId}
    >
      {refusal ? (
        <strong>Stopped: {refusal}</strong>
      ) : (
        <strong>This step:</strong>
      )}
      {lines.map((line, i) => (
        <span key={i}> — {line}</span>
      ))}
    </p>
  );
}
