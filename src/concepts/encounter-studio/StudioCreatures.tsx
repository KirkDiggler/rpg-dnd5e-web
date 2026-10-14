import { PALETTE_MONSTERS, paletteNameForRef } from '@/author/paletteData';
import { NPC_APPEARANCE_FAMILIES } from '@/npc-appearances/npcAppearanceChoices';
import { useEffect, useState } from 'react';
import { authoredActorName } from '../world-building/creaturePalette';
import { StudioArrangePanel } from './StudioArrangePanel';
import type {
  EncounterStudioSession,
  StudioSocialSection,
} from './studioSession';

const MODELS = NPC_APPEARANCE_FAMILIES.filter(
  (family) => family.defaultLook.look
);
export function StudioCreatures({
  session,
  onShowMap,
  onOpenPalette,
  onConfigure,
  onMoveCreature,
}: {
  session: EncounterStudioSession;
  onShowMap(): void;
  onMoveCreature?(): void;
  onConfigure?(section: StudioSocialSection): void;
  onOpenPalette(): void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [ref, setRef] = useState('dnd5e:monsters:human');
  const [modelRef, setModelRef] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [definition, setDefinition] = useState('');
  const [showPlacedEditor, setShowPlacedEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = session.arrange?.kind === 'actor' ? session.arrange : null;
  const palette = session.document.draft.scene.creaturePalette ?? [];
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
  for (const current of [
    ref,
    selected?.monster.ref,
    ...palette.map((entry) => entry.ref),
  ])
    if (current && !options.has(current)) options.set(current, current);
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
  useEffect(() => {
    setEditingId(undefined);
    setName('');
    setRef('dnd5e:monsters:human');
    setModelRef('');
  }, [session.document, session.intentEpoch]);
  const resetForm = (): void => {
    setEditingId(undefined);
    setName('');
    setRef('dnd5e:monsters:human');
    setModelRef('');
    setError(null);
  };
  return (
    <section aria-label="Creatures" className="es-creature-panel">
      <h2>Creatures</h2>
      <p>
        Create and configure reusable creatures here. Choose per-instance looks
        and place them from the Monsters & NPCs list on the map.
      </p>
      <form
        aria-label="Create creature recipe"
        onSubmit={(event) => {
          event.preventDefault();
          if (
            !session.creatures.savePaletteEntry(
              { name: name.trim(), ref, modelRef },
              editingId
            )
          ) {
            setError('Creature edit refused. Check the document notice.');
            return;
          }
          setShowPlacedEditor(false);
          resetForm();
        }}
      >
        <label>
          Creature name
          <input
            aria-label="Creature name"
            value={name}
            maxLength={120}
            required
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          Stat block
          <select
            aria-label="Creature stat block"
            value={ref}
            onChange={(event) => setRef(event.target.value)}
          >
            {renderOptions()}
          </select>
        </label>
        <label>
          NPC model
          <select
            aria-label="NPC model"
            value={modelRef}
            required
            onChange={(event) => setModelRef(event.target.value)}
          >
            <option value="" disabled>
              Choose a model
            </option>
            {modelRef && !MODELS.some((family) => family.ref === modelRef) && (
              <option value={modelRef}>Unavailable: {modelRef}</option>
            )}
            {MODELS.map((family) => (
              <option key={family.ref} value={family.ref}>
                {family.defaultLook.displayName}
              </option>
            ))}
          </select>
        </label>
        <p>
          Use Stat blocks to author scores, armor and hit dice. This list name
          labels the recipe; custom in-game names belong to the named stat
          block. Changing a recipe affects future placements only.
        </p>
        <button type="submit">
          {editingId ? 'Save creature changes' : 'Add to creature list'}
        </button>
        {editingId && (
          <button type="button" onClick={resetForm}>
            Cancel creature changes
          </button>
        )}
      </form>
      <button type="button" onClick={onOpenPalette}>
        Open map creature list
      </button>
      <h3>Creature list</h3>
      {!palette.length && (
        <p>
          No reusable creatures yet. Choose a name, stat block and model above.
        </p>
      )}
      <ul>
        {palette.map((entry) => (
          <li key={entry.id}>
            <span>
              {entry.name} · {options.get(entry.ref) ?? entry.ref}
            </span>
            <button
              type="button"
              aria-label={`Edit creature ${entry.name}`}
              onClick={() => {
                setEditingId(entry.id);
                setName(entry.name);
                setRef(entry.ref);
                setModelRef(entry.modelRef);
                setError(null);
              }}
            >
              Edit
            </button>
          </li>
        ))}
      </ul>
      <h3>Placed instances</h3>
      <ul>
        {session.document.draft.room.monsterDeclarations.map((actor) => (
          <li key={actor.id}>
            <button
              type="button"
              aria-pressed={selected?.monster.id === actor.id}
              onClick={() => {
                if (!session.creatures.select(actor.id))
                  setError('Creature selection is no longer available.');
                else setShowPlacedEditor(true);
              }}
            >
              {authoredActorName(
                session.document.draft.scene.actorNames,
                actor.id
              ) ??
                options.get(actor.ref) ??
                actor.ref}{' '}
              · {actor.id}
            </button>
          </li>
        ))}
      </ul>
      {showPlacedEditor && selected && (
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
          <StudioArrangePanel
            session={session}
            expanded
            onConfigure={onConfigure}
            onMoveCreature={onMoveCreature}
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
