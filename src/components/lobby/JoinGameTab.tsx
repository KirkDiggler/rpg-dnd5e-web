import { useState } from 'react';

interface JoinGameTabProps {
  onJoinLobby: (code: string) => void;
  loading: boolean;
  error?: string | null;
}

/**
 * JoinGameTab - Tab content for joining an existing lobby
 *
 * Shows:
 * - Join code input field
 * - Join button
 * - Error message if join fails
 */
export function JoinGameTab({ onJoinLobby, loading, error }: JoinGameTabProps) {
  const [code, setCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim()) {
      onJoinLobby(code.trim().toUpperCase());
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convert to uppercase and limit to 6 characters
    const value = e.target.value.toUpperCase().slice(0, 6);
    setCode(value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="join-code"
          className="block text-sm font-medium mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          Enter Join Code
        </label>
        <input
          id="join-code"
          type="text"
          value={code}
          onChange={handleCodeChange}
          placeholder="ABC123"
          className="w-full px-4 py-3 rounded-lg text-center text-2xl font-mono font-bold tracking-widest uppercase"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
          autoComplete="off"
          autoFocus
        />
        <p
          className="mt-2 text-sm text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          Ask the host for their 6-character code
        </p>
      </div>

      {error && (
        <div
          className="p-3 rounded-lg text-sm"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#fca5a5',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || code.length < 6}
        className="w-full px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
        style={{
          backgroundColor:
            loading || code.length < 6
              ? 'var(--bg-secondary)'
              : 'var(--accent-primary)',
          color: 'white',
        }}
      >
        {loading ? 'Joining...' : 'Join Game'}
      </button>
    </form>
  );
}
