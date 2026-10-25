import {
  chooseNpcAppearance,
  npcAppearanceOptions,
} from '@/npc-appearances/npcAppearanceChoices';
import { useState } from 'react';
import {
  castOf,
  castPlacementAppearanceAvailable,
  hasStandardCastLook,
  type CastMember,
} from '../world-building/cast';
import type { EncounterStudioSession } from './studioSession';

function PlacementChoice({
  member,
  session,
  onPlace,
  existingLooks,
}: {
  existingLooks: readonly string[];
  member: CastMember;
  session: EncounterStudioSession;
  onPlace(ref: string, appearanceRef: string): boolean;
}): React.JSX.Element {
  const modelRef = member.defaults?.modelRef ?? '';
  const standard = hasStandardCastLook(member);
  const [appearanceRef, setAppearanceRef] = useState(
    () =>
      modelRef ||
      (standard
        ? ''
        : (existingLooks.find((ref) => npcAppearanceOptions(ref).current) ??
          ''))
  );
  const [error, setError] = useState<string | null>(null);
  const look = npcAppearanceOptions(appearanceRef);
  const available = castPlacementAppearanceAvailable(member, appearanceRef);
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
      {!modelRef && existingLooks.length > 0 && (
        <>
          <label>
            Appearance for this placement
            <select
              aria-label="Appearance for this placement"
              value={appearanceRef}
              onChange={(event) => {
                session.cancelTransients();
                setAppearanceRef(event.target.value);
                setError(null);
              }}
            >
              <option value="" disabled={!standard}>
                {standard ? 'Standard monster look' : 'Choose an existing look'}
              </option>
              {[
                ...new Set([
                  ...existingLooks,
                  ...(appearanceRef ? [appearanceRef] : []),
                ]),
              ].map((ref) => {
                const current = npcAppearanceOptions(ref).current;
                return (
                  <option key={ref} value={ref} disabled={!current}>
                    {current?.displayName ?? `Unavailable: ${ref}`}
                  </option>
                );
              })}
            </select>
          </label>
          <p className="es-help">
            These looks are already used by this cast member in the site. This
            choice affects only the new placement, not the cast defaults.
          </p>
        </>
      )}
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
            ? available
              ? appearanceRef
                ? 'This model has one published look.'
                : 'Standard monster look.'
              : 'Choose a default look in the cast to place it.'
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
          existingLooks={[
            ...new Set(
              session.document.draft.room.monsterDeclarations
                .filter((entry) => entry.ref === selected.ref)
                .flatMap((entry) =>
                  entry.appearanceRef ? [entry.appearanceRef] : []
                )
            ),
          ]}
          session={session}
          onPlace={onPlace}
        />
      )}
    </section>
  );
}
