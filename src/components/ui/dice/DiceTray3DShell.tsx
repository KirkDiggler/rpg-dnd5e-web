export interface DiceTray3DShellProps {
  label: string;
  phase: 'empty' | 'armed' | 'rolling' | 'settled';
  children?: React.ReactNode;
  controls?: React.ReactNode;
  className?: string;
}

export function DiceTray3DShell({
  label,
  phase,
  children,
  controls,
  className,
}: DiceTray3DShellProps) {
  return (
    <section
      role="region"
      aria-label={label}
      className={['dice-tray-3d-shell', className].filter(Boolean).join(' ')}
      data-phase={phase}
    >
      <div
        className="dice-tray-3d-shell__well"
        data-testid="dice-tray-3d-well"
      />
      <div
        className="dice-tray-3d-shell__motion-surface"
        data-testid="dice-tray-3d-motion-surface"
      >
        {children ?? <p>Your d20 will appear here</p>}
      </div>
      {controls && (
        <div className="dice-tray-3d-shell__controls">{controls}</div>
      )}
    </section>
  );
}
