import { Button } from '../ui/Button';

export interface SneakToggleProps {
  /** The server's `GetViewResponse.sneaking` for this seat. */
  sneaking: boolean;
  disabled?: boolean;
  /** Called with the mode the player asked for: always `!sneaking`. */
  onChange: (next: boolean) => void;
}

/**
 * The free-roam sneak declaration (rpg-project#606, sneaking R1, R6).
 *
 * THE PRESSED STATE IS THE SERVER'S. It renders `sneaking` as read from the
 * view and holds no flag of its own, so a refused or failed declaration
 * leaves it showing what the server holds.
 *
 * IT SENDS ONLY ON CHANGE. A press always asks for the opposite of what the
 * server holds, so it never re-declares the held mode (a no-op server-side).
 * The caller disables it while a declaration is in flight, so a second press
 * cannot repeat the first before the view is re-read.
 *
 * WHETHER IT IS SHOWN IS THE CALLER'S. Sneaking is a world-clock mode only,
 * so the session view renders this only on the world clock.
 */
export function SneakToggle({
  sneaking,
  disabled,
  onChange,
}: SneakToggleProps) {
  return (
    <Button
      variant={sneaking ? 'secondary' : 'ghost'}
      size="sm"
      aria-pressed={sneaking}
      aria-label="Sneak"
      data-testid="session-sneak-toggle"
      disabled={disabled}
      onClick={() => onChange(!sneaking)}
    >
      {sneaking ? 'Sneaking' : 'Sneak'}
    </Button>
  );
}
