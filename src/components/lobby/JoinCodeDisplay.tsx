import { useState } from 'react';

interface JoinCodeDisplayProps {
  code: string;
}

/**
 * JoinCodeDisplay - Shows a join code with copy-to-clipboard functionality
 *
 * Features:
 * - Large monospace font for easy reading
 * - Copy button with "Copied!" feedback
 * - Auto-resets copied state after 2 seconds
 */
export function JoinCodeDisplay({ code }: JoinCodeDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div
      className="flex items-center justify-center gap-3 p-4 rounded-lg"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '2px solid var(--border-primary)',
      }}
    >
      <span
        className="text-3xl font-mono font-bold tracking-widest"
        style={{ color: 'var(--text-primary)' }}
      >
        {code}
      </span>
      <button
        onClick={handleCopy}
        className="px-3 py-1 rounded text-sm font-medium transition-colors"
        style={{
          backgroundColor: copied
            ? 'var(--accent-success, #22c55e)'
            : 'var(--accent-primary)',
          color: 'white',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}
