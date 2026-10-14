import {
  chooseNpcAppearance,
  npcAppearanceOptions,
} from '@/npc-appearances/npcAppearanceChoices';
import { useState } from 'react';
import { castOf, type CastMember } from '../world-building/cast';
import type { EncounterStudioSession } from './studioSession';

function PlacementChoice({
  member,
  session,
  onPlace,
}: {
  member: CastMember;
  session: EncounterStudioSession;
  onPlace(ref: string, appearanceRef: string): boolean;
}): React.JSX.Element {
  const modelRef = member.defaults?.modelRef ?? '';
  const [appearanceRef, setAppearanceRef] = useState(modelRef);
  const [error, setError] = useState<string | null>(null);
  const look = npcAppearanceOptions(appearanceRef);
  const available =
    !!modelRef && !!look.current && look.family?.ref === modelRef;
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
      <h3>{member.name}</h3>
      <p className="es-help">{member.ref}</p>
      {modelRef && <p>{look.family?.defaultLook.displayName ?? modelRef}</p>}
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
          {!modelRef
            ? 'Choose a default look in the cast to place it.'
            : available
              ? 'This model has one published look.'
              : 'Model unavailable. Choose a published default look in the cast.'}
        </p>
      )}
      <button
        type="button"
        disabled={!available}
        onClick={() => {
          if (!onPlace(member.ref, appearanceRef))
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

/** Lists the cast. Only picker state is local; placement stays
 * owner-controlled and writes a ref to the stat block, never its fields. */
export function StudioCreaturePalette({
  session,
  onConfigure,
  onPlace,
}: {
  session: EncounterStudioSession;
  onConfigure(): void;
  onPlace(ref: string, appearanceRef: string): boolean;
}): React.JSX.Element {
  const [selectedRef, setSelectedRef] = useState('');
  const cast = castOf(session.document);
  const selected = cast.find((member) => member.ref === selectedRef) ?? cast[0];
  return (
    <section
      aria-label="Monsters and NPCs palette"
      className="es-creature-palette"
    >
      <h2>Monsters &amp; NPCs</h2>
      {!cast.length && (
        <p>No cast yet. Add one in Encounter, then place it here.</p>
      )}
      <button type="button" onClick={onConfigure}>
        Configure creatures
      </button>
      <ul aria-label="Cast">
        {cast.map((member) => (
          <li key={member.ref}>
            <button
              type="button"
              aria-pressed={selected?.ref === member.ref}
              onClick={() => {
                session.cancelTransients();
                setSelectedRef(member.ref);
              }}
            >
              {member.name}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <PlacementChoice
          key={JSON.stringify([
            session.document.draft.id,
            selected.ref,
            selected.defaults?.modelRef,
          ])}
          member={selected}
          session={session}
          onPlace={onPlace}
        />
      )}
    </section>
  );
}
