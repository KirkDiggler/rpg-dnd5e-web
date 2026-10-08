import { useState } from 'react';
import { Button } from '../ui/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

export interface RestMember {
  id: string;
  name: string;
}

export interface RestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Every seated party member — the group rests together. */
  members: readonly RestMember[];
  /** Resolves when the server accepted; rejects with its refusal. */
  onRest: (
    resters: readonly { member: string; hitDice: number }[]
  ) => Promise<void>;
  /** The server's refusal, in its own words. */
  error?: string | null;
  pending?: boolean;
}

/**
 * The short-rest question: how many hit dice each member spends. The client
 * does not know how many a member has left, so it bounds nothing but "not
 * negative" — asking for more than they have is the server's refusal to make.
 */
export function RestDialog({
  open,
  onOpenChange,
  members,
  onRest,
  error,
  pending,
}: RestDialogProps) {
  const [dice, setDice] = useState<Record<string, number>>({});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Short rest</DialogTitle>
          <DialogDescription>
            The party rests together for an hour. Choose the hit dice each
            member spends.
          </DialogDescription>
        </DialogHeader>
        <div style={{ display: 'grid', gap: 8, margin: '12px 0' }}>
          {members.map((entry) => (
            <label
              key={entry.id}
              style={{ display: 'flex', justifyContent: 'space-between' }}
            >
              {entry.name}
              <input
                type="number"
                min={0}
                step={1}
                aria-label={`Hit dice for ${entry.name}`}
                value={dice[entry.id] ?? 0}
                onChange={(event) =>
                  setDice((current) => ({
                    ...current,
                    [entry.id]: Math.max(
                      0,
                      Math.floor(Number(event.target.value) || 0)
                    ),
                  }))
                }
              />
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" style={{ color: 'var(--color-error, #f87171)' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={pending || members.length === 0}
            onClick={() =>
              void onRest(
                members.map((entry) => ({
                  member: entry.id,
                  hitDice: dice[entry.id] ?? 0,
                }))
              ).catch(() => undefined)
            }
          >
            Rest
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
