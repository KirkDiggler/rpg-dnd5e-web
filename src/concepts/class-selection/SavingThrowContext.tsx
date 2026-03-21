interface SavingThrowContextProps {
  savingThrows: string[];
  context: string;
}

export function SavingThrowContext({
  savingThrows,
  context,
}: SavingThrowContextProps) {
  return (
    <div
      className="rounded-lg p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}
    >
      <h3
        className="text-lg font-bold mb-3"
        style={{ fontFamily: 'Cinzel, serif', color: 'var(--text-primary)' }}
      >
        Saving Throws
      </h3>
      <div className="flex gap-2 mb-3">
        {savingThrows.map((st) => (
          <span
            key={st}
            className="text-sm font-semibold px-3 py-1 rounded"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--text-primary)',
            }}
          >
            {st}
          </span>
        ))}
      </div>
      <p
        className="text-sm leading-relaxed"
        style={{
          color: 'var(--text-muted)',
          fontFamily: 'Crimson Text, serif',
        }}
      >
        {context}
      </p>
    </div>
  );
}
