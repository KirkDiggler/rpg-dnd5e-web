import { PALETTE_MONSTERS, thumbForRef } from '@/author/paletteData';
import { npcAppearanceOptions } from '@/npc-appearances/npcAppearanceChoices';
import { useEffect, useState } from 'react';
import {
  castOf,
  hasStandardCastLook,
  removeCastMember,
  rulebookMonsterName,
  shuffleCastLooks,
  type CastMember,
} from '../world-building/cast';
import { documentPlacementNames } from '../world-building/placementNames';
import { NpcLookPicker } from './NpcLookPicker';
import type { EncounterStudioSession } from './studioSession';

/** Presentation defaults only: never writes a template, equipment or actions. */
export function StudioCastAppearance({
  session,
  member,
  onDone,
  onShowPlacement,
}: {
  session: EncounterStudioSession;
  member: CastMember | null;
  onDone(): void;
  onShowPlacement?(id: string): void;
}): React.JSX.Element {
  const cast = castOf(session.document);
  const first = PALETTE_MONSTERS.find(
    (monster) => !cast.some((entry) => entry.ref === monster.ref)
  );
  const [ref, setRef] = useState(member?.ref ?? first?.ref ?? '');
  const defaultName =
    member?.source === 'template'
      ? (member.defaults?.name ?? member.name)
      : (member?.name ?? (first ? rulebookMonsterName(first.ref) : ''));
  const [name, setName] = useState(defaultName);
  const [look, setLook] = useState(member?.defaults?.modelRef ?? '');
  const [choosingLook, setChoosingLook] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLook(member?.defaults?.modelRef ?? '');
    setName(defaultName);
    setRef(member?.ref ?? first?.ref ?? '');
    setChoosingLook(false);
    setError(null);
  }, [
    session.document,
    session.intentEpoch,
    member?.ref,
    member?.name,
    member?.defaults?.modelRef,
    first?.ref,
    defaultName,
  ]);
  const standard = member ? hasStandardCastLook(member) : !!ref;
  const appearance = npcAppearanceOptions(look);
  const placementNames = documentPlacementNames(session.document);
  const save = (): void => {
    if (!ref || !name.trim()) {
      setError('Choose a monster and give it a cast name.');
      return;
    }
    if (!member && cast.some((entry) => entry.ref === ref)) {
      setError(
        'That monster is already in the cast. Select it to change its appearance.'
      );
      return;
    }
    if (!standard && !look) {
      setError('Choose a published look for this cast member.');
      return;
    }
    if (look && !appearance.family) {
      setError('This appearance is unavailable. Choose a published look.');
      return;
    }
    if (
      !session.cast.save({
        ref,
        defaults: {
          name: name.trim(),
          ...(look ? { modelRef: look } : {}),
          ...(member?.defaults?.faction
            ? { faction: member.defaults.faction }
            : {}),
        },
      })
    ) {
      setError(
        'Could not save the cast appearance. The document notice says why.'
      );
      return;
    }
    onDone();
  };
  return (
    <form
      aria-label={
        member ? `Appearance for ${member.name}` : 'Add monster to cast'
      }
      className="es-cast-appearance"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h3>{member ? member.name : 'Add monster'}</h3>
      {member ? (
        <p className="es-help">
          Monster: {member.ref}. Appearance does not change its rules.
        </p>
      ) : (
        <label>
          Monster
          <select
            aria-label="Monster"
            value={ref}
            onChange={(event) => {
              const monster = PALETTE_MONSTERS.find(
                (entry) => entry.ref === event.target.value
              );
              setRef(event.target.value);
              setName(monster ? rulebookMonsterName(monster.ref) : '');
              setLook('');
              setError(null);
            }}
          >
            {!first && (
              <option value="">
                All configured monsters are already in the cast
              </option>
            )}
            {PALETTE_MONSTERS.map((monster) => (
              <option
                key={monster.ref}
                value={monster.ref}
                disabled={cast.some((entry) => entry.ref === monster.ref)}
              >
                {monster.refId === 'goblin-boss'
                  ? 'Goblin Boss (King)'
                  : rulebookMonsterName(monster.ref)}
                {cast.some((entry) => entry.ref === monster.ref)
                  ? ' — already in cast'
                  : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {member?.source !== 'template' && (
        <label>
          Cast name
          <input
            aria-label="Cast name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      )}
      <section aria-label="Appearance" className="es-cast-look-summary">
        <h4>Appearance</h4>
        {!look && standard && thumbForRef(ref) && (
          <img
            src={thumbForRef(ref)}
            alt="Standard monster look"
            width={96}
            height={96}
          />
        )}
        <p>
          {look
            ? (appearance.family?.defaultLook.displayName ??
              `Unavailable: ${look}`)
            : standard
              ? 'Standard monster look'
              : 'No default look selected'}
        </p>
        <div className="es-buttons">
          <button
            type="button"
            onClick={() => setChoosingLook(!choosingLook)}
            aria-expanded={choosingLook}
          >
            Change appearance
          </button>
          {standard && look && (
            <button
              type="button"
              onClick={() => {
                setLook('');
                setChoosingLook(false);
                setError(null);
              }}
            >
              Use standard monster look
            </button>
          )}
        </div>
        {choosingLook && (
          <NpcLookPicker
            label="Default look"
            value={look}
            onChange={(value) => {
              setLook(value);
              setError(null);
            }}
          />
        )}
        <p className="es-help">
          The look is used for new placements only. Creatures already on the
          board keep their own appearance.
        </p>
      </section>
      <div className="es-buttons">
        <button type="submit" disabled={session.publishing.busy || !ref}>
          {member ? 'Apply appearance' : 'Add to cast'}
        </button>
        <button
          type="button"
          onClick={() => {
            setLook(member?.defaults?.modelRef ?? '');
            setName(defaultName);
            setChoosingLook(false);
            setError(null);
            onDone();
          }}
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {member && (
        <>
          <section aria-label="Placements">
            <h4>On the board · {member.placements.length}</h4>
            {member.placements.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  try {
                    shuffleCastLooks(session.document, member.ref, Math.random);
                  } catch (caught) {
                    setError(
                      caught instanceof Error ? caught.message : String(caught)
                    );
                    return;
                  }
                  if (!session.cast.shuffle(member.ref))
                    setError('Could not shuffle these looks.');
                }}
              >
                Shuffle looks
              </button>
            )}
            {member.placements.length ? (
              <ul className="es-inspector-list">
                {member.placements.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => onShowPlacement?.(id)}
                      aria-label={`Select placement ${id}`}
                    >
                      {placementNames.get(id) ?? id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="es-help">
                Not placed yet. Choose this member in Build → Monsters &amp;
                NPCs to place it.
              </p>
            )}
          </section>
          <button
            type="button"
            onClick={() => {
              try {
                removeCastMember(session.document, member.ref);
              } catch (caught) {
                setError(
                  caught instanceof Error ? caught.message : String(caught)
                );
                return;
              }
              if (session.cast.remove(member.ref)) onDone();
              else setError('Could not remove this cast member.');
            }}
          >
            Delete cast member
          </button>
        </>
      )}
    </form>
  );
}
