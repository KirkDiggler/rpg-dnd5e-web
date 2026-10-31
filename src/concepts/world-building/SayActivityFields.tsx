import { NPC_ACTIVITY_PROFILES } from '@/generated/npcAppearanceCatalog';
import type { AnswerEntryShape } from './answerTableShape';

// Shared answers can be used by several appearances. Offer published vocabulary,
// not a promise that every body supports it; the renderer checks the actual body.
const choices = new Map(
  NPC_ACTIVITY_PROFILES.flatMap((profile) =>
    Object.entries(profile.activities)
      .filter(([, activity]) => !activity.moving)
      .map(([ref, activity]) => [ref, activity.label] as const)
  )
);

/** Author a cue beside its spoken line; do not invent a cue from that line. */
export function SayActivityFields({
  entry,
  label,
  onCommit,
}: {
  readonly entry: AnswerEntryShape;
  readonly label: string;
  readonly onCommit: (entry: AnswerEntryShape) => void;
}) {
  if (!entry.say && !entry.activity) return null;
  const cue = entry.activity;
  const unavailable = cue !== undefined && !choices.has(cue.ref);
  return (
    <div className="wb-entry-secondary">
      <label>
        <span>Activity with reply</span>
        <select
          aria-label={`Activity for ${label} entry`}
          value={cue?.ref ?? ''}
          onChange={(event) => {
            const ref = event.target.value;
            const next = { ...entry };
            if (!ref) delete next.activity;
            else next.activity = { ref, cycles: cue?.cycles ?? 1 };
            onCommit(next);
          }}
        >
          <option value="">No activity cue</option>
          {unavailable && (
            <option value={cue.ref}>Unavailable activity: {cue.ref}</option>
          )}
          {[...choices].map(([ref, name]) => (
            <option key={ref} value={ref}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {cue && (
        <label>
          <span>Sustain cycles</span>
          <input
            type="number"
            min={1}
            max={4294967295}
            step={1}
            aria-label={`Sustain cycles for ${label} entry`}
            value={cue.cycles}
            onChange={(event) => {
              const cycles = Number(event.target.value);
              if (
                !Number.isInteger(cycles) ||
                cycles < 1 ||
                cycles > 4294967295
              )
                return;
              onCommit({ ...entry, activity: { ...cue, cycles } });
            }}
          />
        </label>
      )}
      {cue && (
        <p className="wb-help">
          Enter and exit are not counted. Movement cancels remaining cycles.
          Requires a supporting NPC appearance.
        </p>
      )}
      {cue && !entry.say && (
        <p role="status">Add a Say line or clear its activity cue.</p>
      )}
    </div>
  );
}
