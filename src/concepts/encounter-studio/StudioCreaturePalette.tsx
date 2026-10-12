import {
  chooseNpcAppearance,
  npcAppearanceOptions,
} from '@/npc-appearances/npcAppearanceChoices';
import { useState } from 'react';
import type { CreaturePaletteEntry } from '../world-building/creaturePalette';
import type { EncounterStudioSession } from './studioSession';

function PlacementChoice({
  recipe,
  session,
  onPlace,
}: {
  recipe: CreaturePaletteEntry;
  session: EncounterStudioSession;
  onPlace(id: string, appearanceRef: string): boolean;
}): React.JSX.Element {
  const [appearanceRef, setAppearanceRef] = useState(recipe.modelRef);
  const [error, setError] = useState<string | null>(null);
  const look = npcAppearanceOptions(appearanceRef);
  const available = !!look.current && look.family?.ref === recipe.modelRef;
  const change = (control: 'style' | 'skinPalette', value: string): void => {
    session.cancelTransients();
    try {
      setAppearanceRef(
        chooseNpcAppearance({ currentRef: appearanceRef, control, value })
      );
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  return (
    <section aria-label="Placement appearance">
      <h3>{recipe.name}</h3>
      <p className="es-help">{recipe.ref}</p>
      <p>{look.family?.defaultLook.displayName ?? recipe.modelRef}</p>
      {available && look.current?.look ? (
        <>
          <label>
            Look
            <select
              aria-label="Placement look"
              value={look.current.look.style}
              onChange={(event) => change('style', event.target.value)}
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
              onChange={(event) => change('skinPalette', event.target.value)}
            >
              {look.skinPalettes.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <p role="status">
          {available
            ? 'This model has one published look.'
            : 'Model unavailable. Edit this creature in Encounter to choose a published model.'}
        </p>
      )}
      <button
        type="button"
        disabled={!available}
        onClick={() => {
          if (!onPlace(recipe.id, appearanceRef))
            setError(
              'Placement could not start. Select the creature and look again.'
            );
          else setError(null);
        }}
      >
        Place on map
      </button>
      <p className="es-help">
        Click a highlighted hex to place one instance. The list stays here for
        the next one; each keeps its own look.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

/** Reads the saved recipes. Only picker state is local; placement stays owner-controlled. */
export function StudioCreaturePalette({
  session,
  onConfigure,
  onPlace,
}: {
  session: EncounterStudioSession;
  onConfigure(): void;
  onPlace(id: string, appearanceRef: string): boolean;
}): React.JSX.Element {
  const [selectedId, setSelectedId] = useState('');
  const recipes = session.document.draft.scene.creaturePalette ?? [];
  const selected =
    recipes.find((entry) => entry.id === selectedId) ?? recipes[0];
  return (
    <section
      aria-label="Monsters and NPCs palette"
      className="es-creature-palette"
    >
      <h2>Monsters &amp; NPCs</h2>
      {!recipes.length && (
        <p>
          No named creatures yet. Create them in Encounter, then place them
          here.
        </p>
      )}
      <button type="button" onClick={onConfigure}>
        Configure creatures
      </button>
      <ul aria-label="Named creatures">
        {recipes.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              aria-pressed={selected?.id === entry.id}
              onClick={() => {
                session.cancelTransients();
                setSelectedId(entry.id);
              }}
            >
              {entry.name}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <PlacementChoice
          key={JSON.stringify([
            session.document.draft.id,
            selected.id,
            selected.ref,
            selected.modelRef,
          ])}
          recipe={selected}
          session={session}
          onPlace={onPlace}
        />
      )}
    </section>
  );
}
