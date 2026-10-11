import { PALETTE_MONSTERS, paletteNameForRef } from '@/author/paletteData';
import { useEffect, useState } from 'react';
import { StudioArrangePanel } from './StudioArrangePanel';
import type { EncounterStudioSession } from './studioSession';

export function StudioCreatures({
  session,
  onShowMap,
}: {
  session: EncounterStudioSession;
  onShowMap(): void;
}): React.JSX.Element {
  const [ref, setRef] = useState('dnd5e:monsters:human');
  const [q, setQ] = useState('0');
  const [r, setR] = useState('0');
  const [definition, setDefinition] = useState('');
  const [error, setError] = useState<string | null>(null);
  const selected = session.arrange?.kind === 'actor' ? session.arrange : null;
  const options = new Map([
    ...PALETTE_MONSTERS.map(
      (monster) => [monster.ref, paletteNameForRef(monster.ref)] as const
    ),
    ['dnd5e:monsters:human', 'Human'] as const,
    ...Object.entries(session.document.scope.templates ?? {}).map(
      ([id, block]) =>
        [
          `dnd5e:monsters:${id}`,
          `${block.name || id} · authored stat block`,
        ] as const
    ),
  ]);
  if (selected && !options.has(selected.monster.ref))
    options.set(selected.monster.ref, selected.monster.ref);
  if (!options.has(ref)) options.set(ref, `${ref} · unavailable definition`);
  const renderOptions = (): React.JSX.Element[] =>
    [...options].map(([value, label]) => (
      <option key={value} value={value}>
        {label}
      </option>
    ));
  useEffect(() => {
    setDefinition(selected?.monster.ref ?? '');
    setError(null);
  }, [
    session.document,
    session.intentEpoch,
    selected?.monster.id,
    selected?.monster.ref,
  ]);
  return (
    <section aria-label="Creatures" className="es-creature-panel">
      <h2>Creatures</h2>
      <p>
        Rules come from a standard monster or an authored stat block. Appearance
        is independent: 17 Kingdom models, each with looks 01–04 and skin tones
        A–C.
      </p>
      <form
        aria-label="Add creature"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !q.trim() ||
            !r.trim() ||
            !Number.isInteger(Number(q)) ||
            !Number.isInteger(Number(r))
          ) {
            setError('Starting hex q and r must be integers.');
            return;
          }
          if (!session.creatures.place(ref, { q: Number(q), r: Number(r) }))
            setError('Placement refused. Check the document notice.');
          else setError(null);
        }}
      >
        <label>
          Creature definition
          <select
            aria-label="Creature definition"
            value={ref}
            onChange={(event) => setRef(event.target.value)}
          >
            {renderOptions()}
          </select>
        </label>
        <label>
          Starting hex q
          <input
            aria-label="Starting hex q"
            type="number"
            step="1"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label>
          Starting hex r
          <input
            aria-label="Starting hex r"
            type="number"
            step="1"
            value={r}
            onChange={(event) => setR(event.target.value)}
          />
        </label>
        <button type="submit">Add creature</button>
      </form>
      <h3>Placed creatures</h3>
      {!session.document.draft.room.monsterDeclarations.length && (
        <p>No creatures yet. Choose a definition and starting hex above.</p>
      )}
      <ul>
        {session.document.draft.room.monsterDeclarations.map((actor) => (
          <li key={actor.id}>
            <button
              type="button"
              aria-pressed={selected?.monster.id === actor.id}
              onClick={() => {
                if (!session.creatures.select(actor.id))
                  setError('Creature selection is no longer available.');
              }}
            >
              {options.get(actor.ref) ?? actor.ref} · {actor.id} · (
              {actor.startingCell.location.q}, {actor.startingCell.location.r})
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <>
          <form
            aria-label="Change creature definition"
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !session.creatures.setDefinition(
                  selected.monster.id,
                  definition
                )
              )
                setError('Definition edit refused. Check the document notice.');
            }}
          >
            <label>
              Selected creature definition
              <select
                aria-label="Selected creature definition"
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
              >
                {renderOptions()}
              </select>
            </label>
            <button type="submit">Apply creature definition</button>
          </form>
          <button type="button" onClick={onShowMap}>
            Show creature on map
          </button>
          <p>
            Appearance selects the model; Style selects its texture look; Skin
            palette selects its skin tone. Apply stages these together with
            location and facing. Clearing the override restores rules-based
            appearance.
          </p>
          <StudioArrangePanel session={session} expanded />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
