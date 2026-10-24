import styles from './CombatExperience.module.css';
import type { CombatExperienceLogMode } from './types';

export function StoryLogModeSwitch({
  hud,
  debugEnabled,
  mode,
  onModeChange,
  panelId,
  hidden,
}: {
  hud: boolean;
  debugEnabled: boolean;
  mode: CombatExperienceLogMode;
  onModeChange: (mode: CombatExperienceLogMode) => void;
  panelId: string;
  hidden: boolean;
}) {
  if (!hud && !debugEnabled) return null;
  const modes: CombatExperienceLogMode[] = debugEnabled
    ? ['story', 'debug']
    : ['story'];
  return (
    <footer
      hidden={hidden}
      className={hud ? styles.hudLogTabs : undefined}
      role={hud ? 'tablist' : undefined}
      aria-label={hud ? 'Encounter log views' : undefined}
      onKeyDown={(event) => {
        if (
          !hud ||
          !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
        )
          return;
        const buttons = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]'
          )
        );
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index +
                  (event.key === 'ArrowRight' ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
        onModeChange(modes[next]);
      }}
    >
      {modes.map((value) => (
        <button
          key={value}
          type="button"
          id={`${panelId}-${value}-tab`}
          role={hud ? 'tab' : undefined}
          aria-selected={hud ? mode === value : undefined}
          aria-controls={hud ? panelId : undefined}
          tabIndex={hud ? (mode === value ? 0 : -1) : undefined}
          className={mode === value ? '' : styles.quietButton}
          aria-pressed={hud ? undefined : mode === value}
          onClick={() => onModeChange(value)}
        >
          {value === 'story' ? (hud ? 'History' : 'Story') : 'Debug'}
        </button>
      ))}
    </footer>
  );
}
