import type { UseSeatedElsewhereResult } from '../../api/useSeatedElsewhere';
import { Button } from '../ui/Button';
import { ErrorDisplay } from '../ui/Feedback';

interface SeatNoticeProps {
  seated: UseSeatedElsewhereResult;
  /** Display name for the seated character, when the screen knows it. */
  name?: string;
  /** Runs after Exit freed the seat; `afterRefusal` marks a refused launch. */
  onAbandoned?: (afterRefusal: boolean) => void;
}

/**
 * "<Character> is still in another run." with the one way out. The lobby
 * refuses and the client offers; nothing leaves until the button is clicked.
 */
export function SeatNotice({ seated, name, onAbandoned }: SeatNoticeProps) {
  const { seat, abandon, abandoning, error } = seated;
  if (!seat) return null;

  const handleClick = async () => {
    const afterRefusal = seat.refused;
    if (await abandon()) onAbandoned?.(afterRefusal);
  };

  return (
    <div
      data-testid="seat-notice"
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <span>{name || 'Your character'} is still in another run.</span>
      <Button
        variant="secondary"
        size="sm"
        loading={abandoning}
        disabled={abandoning}
        onClick={() => void handleClick()}
        data-testid="abandon-run-button"
      >
        {abandoning ? 'Abandoning…' : 'Abandon run'}
      </Button>
      {error && <ErrorDisplay message={error} />}
    </div>
  );
}
