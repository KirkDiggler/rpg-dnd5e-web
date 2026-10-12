import { PALETTE_MONSTERS, paletteNameForRef } from '@/author/paletteData';
import {
  NPC_APPEARANCE_FAMILIES,
  chooseNpcAppearance,
  npcAppearanceOptions,
} from '@/npc-appearances/npcAppearanceChoices';
import { useEffect, useState } from 'react';
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
  onPlace,
  onConfigure,
}: {
  session: EncounterStudioSession;
  onShowMap(): void;
  onConfigure?(section: StudioSocialSection): void;
  onPlace(id: string, appearanceRef: string): void;
}): React.JSX.Element {
  const [name, setName] = useState('');
  const [ref, setRef] = useState('dnd5e:monsters:human');
  const [modelRef, setModelRef] = useState('');
  const [editingId, setEditingId] = useState<string | undefined>();
  const [recipeId, setRecipeId] = useState('');
  const [appearanceRef, setAppearanceRef] = useState('');
  const [definition, setDefinition] = useState('');
  const [showPlacedEditor, setShowPlacedEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = session.arrange?.kind === 'actor' ? session.arrange : null;
  const palette = session.document.draft.scene.creaturePalette ?? [];
  const recipe =
    palette.find((entry) => entry.id === recipeId) ?? palette.at(-1);
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
  useEffect(() => {
    setAppearanceRef(recipe?.modelRef ?? '');
  }, [recipe?.id, recipe?.modelRef, session.document, session.intentEpoch]);
  const look = npcAppearanceOptions(appearanceRef);
  const lookReady =
    !!recipe && look.family?.ref === recipe.modelRef && !!look.current;
  const changeLook = (
    control: 'style' | 'skinPalette',
    value: string
  ): void => {
    try {
      setAppearanceRef(
        chooseNpcAppearance({ currentRef: appearanceRef, control, value })
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
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
        Create a reusable named creature, then choose a look and skin tone for
        each placement. Nothing is placed until you click the map.
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
          setRecipeId(editingId ?? '');
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
      <h3>Creature list</h3>
      {!palette.length && (
        <p>
          No reusable creatures yet. Choose a name, stat block and model above.
        </p>
      )}
      <ul>
        {palette.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              aria-pressed={recipe?.id === entry.id}
              onClick={() => {
                setRecipeId(entry.id);
                setShowPlacedEditor(false);
              }}
            >
              {entry.name} · {options.get(entry.ref) ?? entry.ref}
            </button>
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
      {recipe && (
        <section aria-label="Placement appearance" className="es-context-panel">
          <h3>Place {recipe.name}</h3>
          <p>
            These choices apply only to the next instance, not the recipe or
            other creatures.
          </p>
          {lookReady && look.current?.look ? (
            <>
              <label>
                Look
                <select
                  aria-label="Placement look"
                  value={look.current.look.style}
                  onChange={(event) => changeLook('style', event.target.value)}
                >
                  {look.styles.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Skin tone
                <select
                  aria-label="Placement skin tone"
                  value={look.current.look.skinPalette}
                  onChange={(event) =>
                    changeLook('skinPalette', event.target.value)
                  }
                >
                  {look.skinPalettes.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p role="status">
              {lookReady
                ? 'This model has one published look.'
                : `Model unavailable: ${recipe.modelRef}. Edit the creature to choose a published model.`}
            </p>
          )}
          <button
            type="button"
            disabled={!lookReady}
            onClick={() => onPlace(recipe.id, appearanceRef)}
          >
            Place on map
          </button>
        </section>
      )}
      <h3>Placed instances</h3>
      <ul>
        {session.document.draft.room.monsterDeclarations.map((actor) => (
          <li key={actor.id}>
            <button
              type="button"
              aria-pressed={
                showPlacedEditor && selected?.monster.id === actor.id
              }
              onClick={() => {
                if (!session.creatures.select(actor.id))
                  setError('Creature selection is no longer available.');
                else setShowPlacedEditor(true);
              }}
            >
              {options.get(actor.ref) ?? actor.ref} · {actor.id}
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
          />
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
