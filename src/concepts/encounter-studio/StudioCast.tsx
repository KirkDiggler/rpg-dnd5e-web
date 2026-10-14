import { ABILITIES, APPROACH_ABILITIES } from '@/author/types';
import { useEffect, useState } from 'react';
import {
  applyCastEdit,
  castOf,
  removeCastMember,
  RULEBOOK_MONSTER_REFS,
  rulebookMonsterName,
  shuffleCastLooks,
  type CastEdit,
  type CastMember,
} from '../world-building/cast';
import { authoredActorName } from '../world-building/creaturePalette';
import {
  TEMPLATE_ABILITIES,
  type MonsterTemplate,
  type TemplateAbility,
} from '../world-building/monsterTemplates';
import { NpcLookPicker } from './NpcLookPicker';
import type { EncounterStudioSession } from './studioSession';

/** The eighteen skill ids a stat block may be proficient in. */
export const SKILL_IDS: readonly string[] = APPROACH_ABILITIES.filter(
  (id) => !(ABILITIES as readonly string[]).includes(id)
);
const MONSTER_PREFIX = 'dnd5e:monsters:';
const SHADOW_WARNING =
  'This id also names a rulebook monster; the rulebook decides which is used.';

/** Staged values: present keys are the author's edits, absent keys show the
 * document. Nothing here is document state. */
interface Stage {
  id?: string;
  name?: string;
  base?: string;
  abilities?: Partial<Record<TemplateAbility, string>>;
  hitDice?: string;
  proficiency?: string;
  experience?: string;
  armor?: string;
  actions?: string[];
  skills?: string[];
  modelRef?: string;
  /** '' is no default faction. */
  faction?: string;
}

const OVERRIDES = [
  'base',
  'abilities',
  'hitDice',
  'proficiency',
  'experience',
  'armor',
  'actions',
  'skills',
] as const;

function stagedTemplate(
  current: Readonly<MonsterTemplate>,
  stage: Stage,
  withName: boolean
): MonsterTemplate {
  const next: MonsterTemplate = structuredClone(current) as MonsterTemplate;
  const text = (
    key: 'name' | 'hitDice' | 'armor',
    value: string | undefined
  ): void => {
    if (value === undefined) return;
    if (value.trim()) next[key] = value.trim();
    else delete next[key];
  };
  if (withName) text('name', stage.name);
  text('hitDice', stage.hitDice);
  text('armor', stage.armor);
  if (stage.base !== undefined) next.base = stage.base;
  for (const key of ['proficiency', 'experience'] as const) {
    const value = stage[key];
    if (value === undefined) continue;
    if (value.trim()) next[key] = Number(value);
    else delete next[key];
  }
  if (stage.abilities) {
    const scores = { ...next.abilities };
    for (const [key, value] of Object.entries(stage.abilities)) {
      if (value?.trim()) scores[key as TemplateAbility] = Number(value);
      else delete scores[key as TemplateAbility];
    }
    if (Object.keys(scores).length) next.abilities = scores;
    else delete next.abilities;
  }
  if (stage.actions) {
    const actions = stage.actions.map((ref) => ref.trim()).filter(Boolean);
    if (actions.length) next.actions = actions;
    else delete next.actions;
  }
  if (stage.skills) {
    const skills = SKILL_IDS.filter((id) => stage.skills!.includes(id));
    if (skills.length) next.skills = skills;
    else delete next.skills;
  }
  return next;
}

/** The staged form as one cast edit, or the sentence that refuses it. */
function castEditOf(
  member: CastMember | null,
  stage: Stage
): CastEdit | string {
  // A new member's base is which monster it is, not an override.
  const overridden = OVERRIDES.some(
    (key) => stage[key] !== undefined && (member || key !== 'base')
  );
  const id = stage.id?.trim();
  const templateBacked =
    member?.source === 'template' || overridden || (!member && !!id);
  if (templateBacked && !member?.template && !id)
    return member
      ? `An override gives ${member.name} its own stat block. Choose its id.`
      : 'Give the cast member an id, or choose a default look to add the rulebook monster as it is.';
  const base: MonsterTemplate = member?.template ?? {
    base: member?.ref ?? stage.base ?? 'dnd5e:monsters:human',
  };
  const template = templateBacked
    ? stagedTemplate(base, stage, true)
    : undefined;
  const ref = member
    ? member.ref
    : templateBacked
      ? `${MONSTER_PREFIX}${id}`
      : (stage.base ?? 'dnd5e:monsters:human');
  const modelRef = stage.modelRef ?? member?.defaults?.modelRef;
  const faction =
    stage.faction !== undefined
      ? stage.faction || undefined
      : member?.defaults?.faction;
  const defaultsChanged =
    stage.modelRef !== undefined ||
    stage.faction !== undefined ||
    (!templateBacked && stage.name !== undefined);
  if (defaultsChanged && !modelRef)
    return 'Choose a default look first: the defaults are a look and a faction for new placements.';
  const name =
    (!templateBacked && stage.name?.trim()) ||
    template?.name ||
    member?.defaults?.name ||
    member?.name ||
    id ||
    rulebookMonsterName(ref);
  return {
    ref,
    ...(member && id && id !== member.id ? { id } : {}),
    ...(template ? { template } : {}),
    ...(defaultsChanged || (!member && modelRef)
      ? {
          defaults: {
            name,
            modelRef: modelRef!,
            ...(faction ? { faction } : {}),
          },
        }
      : {}),
  };
}

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** One cast member's form, or a new member's when member is null. Every
 * change is staged; Apply is one transaction; Cancel discards. */
export function CastMemberForm({
  session,
  member,
  onSaved,
  onShowPlacement,
}: {
  session: EncounterStudioSession;
  member: CastMember | null;
  onSaved?(ref: string | null): void;
  onShowPlacement?(id: string): void;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({});
  const [error, setError] = useState<string | null>(null);
  const [idOpen, setIdOpen] = useState(false);
  useEffect(() => {
    setStage({});
    setError(null);
    setIdOpen(false);
  }, [session.document, session.intentEpoch, member?.ref]);
  const patch = (next: Partial<Stage>): void => {
    setStage((current) => ({ ...current, ...next }));
    setError(null);
  };
  const template = member?.template;
  const rulebook = member?.source === 'rulebook';
  const overridden = OVERRIDES.some((key) => stage[key] !== undefined);
  const idEditable = !rulebook || idOpen || overridden;
  const idValue =
    stage.id ?? (rulebook && idEditable ? '' : (member?.id ?? ''));
  const base =
    stage.base ?? template?.base ?? member?.ref ?? 'dnd5e:monsters:human';
  const baseChoices = RULEBOOK_MONSTER_REFS.includes(base)
    ? RULEBOOK_MONSTER_REFS
    : [...RULEBOOK_MONSTER_REFS, base];
  const nameValue =
    stage.name ??
    (rulebook ? (member?.defaults?.name ?? '') : (template?.name ?? ''));
  const actions = stage.actions ?? [...(template?.actions ?? [])];
  const skills = stage.skills ?? [...(template?.skills ?? [])];
  const factions = session.document.scope.factions ?? [];
  const faction = stage.faction ?? member?.defaults?.faction ?? '';
  const shadows =
    (stage.id !== undefined
      ? RULEBOOK_MONSTER_REFS.includes(`${MONSTER_PREFIX}${stage.id.trim()}`)
      : member?.shadowsRulebook) ?? false;
  const scoreText = (key: TemplateAbility): string =>
    stage.abilities?.[key] ??
    (template?.abilities?.[key] === undefined
      ? ''
      : String(template.abilities[key]));
  const numberText = (key: 'proficiency' | 'experience'): string =>
    stage[key] ?? (template?.[key] === undefined ? '' : String(template[key]));
  const apply = (): void => {
    const edit = castEditOf(member, stage);
    if (typeof edit === 'string') {
      setError(edit);
      if (rulebook) setIdOpen(true);
      return;
    }
    try {
      applyCastEdit(session.document, edit, () => 'preview');
    } catch (caught) {
      setError(message(caught));
      return;
    }
    if (!session.cast.save(edit)) {
      setError('The cast edit was refused. Check the document notice.');
      return;
    }
    onSaved?.(edit.id !== undefined ? `${MONSTER_PREFIX}${edit.id}` : edit.ref);
  };
  const remove = (): void => {
    if (!member) return;
    try {
      removeCastMember(session.document, member.ref);
    } catch (caught) {
      setError(message(caught));
      return;
    }
    if (session.cast.remove(member.ref)) onSaved?.(null);
    else setError('The delete was refused. Check the document notice.');
  };
  const names = session.document.draft.scene.actorNames;
  return (
    <form
      aria-label={member ? `Cast member ${member.name}` : 'New cast member'}
      className="es-cast-form"
      onSubmit={(event) => {
        event.preventDefault();
        apply();
      }}
    >
      <h3>{member ? member.name : 'New cast member'}</h3>
      {member && (
        <p className="es-help">
          {member.source === 'template'
            ? `Stat block ${member.id}. Changes reach every placement.`
            : `Rulebook monster ${member.ref}. It has no stat block of its own.`}
        </p>
      )}
      <label>
        Id
        <input
          aria-label="Cast member id"
          value={idValue}
          readOnly={!idEditable}
          placeholder={rulebook ? 'Choose an id for its stat block' : ''}
          onChange={(event) => patch({ id: event.target.value })}
        />
      </label>
      {rulebook && !idEditable && (
        <button type="button" onClick={() => setIdOpen(true)}>
          Give it a stat block
        </button>
      )}
      {rulebook && idEditable && (
        <p className="es-help">
          An override gives {member?.name} its own stat block. Its placements
          and defaults move to the new id.
        </p>
      )}
      {shadows && (
        <p role="status" className="es-warning">
          {SHADOW_WARNING}
        </p>
      )}
      <label>
        Name
        <input
          aria-label="Cast member name"
          value={nameValue}
          maxLength={120}
          onChange={(event) => patch({ name: event.target.value })}
        />
      </label>
      <label>
        Base
        <select
          aria-label="Base"
          value={base}
          onChange={(event) => patch({ base: event.target.value })}
        >
          {baseChoices.map((ref) => (
            <option key={ref} value={ref}>
              {RULEBOOK_MONSTER_REFS.includes(ref)
                ? rulebookMonsterName(ref)
                : `Unlisted: ${ref}`}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="es-stat-fields">
        <legend>Ability scores (blank is the base&apos;s)</legend>
        {TEMPLATE_ABILITIES.map((key) => (
          <label key={key}>
            {key.toUpperCase()}
            <input
              aria-label={key.toUpperCase()}
              type="number"
              min={1}
              max={30}
              value={scoreText(key)}
              onChange={(event) =>
                patch({
                  abilities: { ...stage.abilities, [key]: event.target.value },
                })
              }
            />
          </label>
        ))}
      </fieldset>
      <label>
        Hit dice
        <input
          aria-label="Hit dice"
          placeholder="2d8"
          value={stage.hitDice ?? template?.hitDice ?? ''}
          onChange={(event) => patch({ hitDice: event.target.value })}
        />
      </label>
      <label>
        Proficiency
        <input
          aria-label="Proficiency"
          type="number"
          min={0}
          value={numberText('proficiency')}
          onChange={(event) => patch({ proficiency: event.target.value })}
        />
      </label>
      <label>
        Experience
        <input
          aria-label="Experience"
          type="number"
          min={0}
          value={numberText('experience')}
          onChange={(event) => patch({ experience: event.target.value })}
        />
      </label>
      <label>
        Armor
        <input
          aria-label="Armor"
          placeholder="dnd5e:armor:chain-shirt"
          value={stage.armor ?? template?.armor ?? ''}
          onChange={(event) => patch({ armor: event.target.value })}
        />
      </label>
      <fieldset>
        <legend>Weapons, in order</legend>
        {actions.map((ref, index) => (
          <div key={index} className="es-buttons">
            <input
              aria-label={`Weapon ${index + 1}`}
              placeholder="dnd5e:weapons:spear"
              value={ref}
              onChange={(event) =>
                patch({
                  actions: actions.map((value, at) =>
                    at === index ? event.target.value : value
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label={`Remove weapon ${index + 1}`}
              onClick={() =>
                patch({ actions: actions.filter((_, at) => at !== index) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => patch({ actions: [...actions, ''] })}
        >
          Add a weapon
        </button>
        <p className="es-help">
          Weapons and armor are typed references. A pick-list waits for the
          rulebook catalog.
        </p>
      </fieldset>
      <fieldset className="es-skill-fields">
        <legend>Skills</legend>
        {SKILL_IDS.map((id) => (
          <label key={id}>
            <input
              type="checkbox"
              checked={skills.includes(id)}
              onChange={(event) =>
                patch({
                  skills: event.target.checked
                    ? [...skills, id]
                    : skills.filter((skill) => skill !== id),
                })
              }
            />
            {id}
          </label>
        ))}
      </fieldset>
      <NpcLookPicker
        label="Default look"
        value={stage.modelRef ?? member?.defaults?.modelRef ?? ''}
        onChange={(ref) => patch({ modelRef: ref })}
      />
      <label>
        Default faction
        <select
          aria-label="Default faction"
          value={faction}
          onChange={(event) => patch({ faction: event.target.value })}
        >
          <option value="">No default faction</option>
          {faction && !factions.some((entry) => entry.id === faction) && (
            <option value={faction}>Missing faction: {faction}</option>
          )}
          {factions.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.id}
            </option>
          ))}
        </select>
      </label>
      <p className="es-help">
        The default look and faction are stamped onto each new placement.
        Changing them later does not change a placed creature.
      </p>
      <div className="es-buttons">
        <button type="submit">Apply</button>
        <button
          type="button"
          onClick={() => {
            setStage({});
            setError(null);
            setIdOpen(false);
            if (!member) onSaved?.(null);
          }}
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {member && (
        <>
          <section aria-label="Placements">
            <h4>Placements</h4>
            {member.placements.length ? (
              <ul className="es-inspector-list">
                {member.placements.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      aria-label={`Select placement ${id}`}
                      onClick={() => onShowPlacement?.(id)}
                    >
                      {authoredActorName(names, id) ?? member.name} · {id}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="es-help">Not placed yet.</p>
            )}
          </section>
          {member.placements.length > 0 && (
            <div className="es-buttons">
              <button
                type="button"
                onClick={() => {
                  try {
                    shuffleCastLooks(session.document, member.ref, Math.random);
                  } catch (caught) {
                    setError(message(caught));
                    return;
                  }
                  if (!session.cast.shuffle(member.ref))
                    setError(
                      'The shuffle was refused. Check the document notice.'
                    );
                }}
              >
                Shuffle looks
              </button>
              <span className="es-help">
                Gives each placement a different look from the default look
                family.
              </span>
            </div>
          )}
          {member.unusedDefaults.length > 0 && (
            <section aria-label="Unused looks">
              <h4>Unused looks</h4>
              <p className="es-help">
                Later recipes on this stat block. New placements use the default
                look.
              </p>
              <ul className="es-inspector-list">
                {member.unusedDefaults.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {entry.name} · {entry.modelRef}
                    </span>{' '}
                    <button
                      type="button"
                      aria-label={`Remove unused look ${entry.name}`}
                      onClick={() =>
                        session.cast.removeUnusedLook(member.ref, entry.id)
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <button type="button" onClick={remove}>
            Delete {member.name}
          </button>
        </>
      )}
    </form>
  );
}

/** The Encounter home's Cast: the derived member list and one member's form.
 * The selected member is the studio's one selection (R11): selecting it here
 * highlights its placements on the map, and a selected placement presses its
 * member's row. Only the "adding a member" state is local. */
export function StudioCast({
  session,
  onShowPlacement,
}: {
  session: EncounterStudioSession;
  onShowPlacement?(id: string): void;
}): React.JSX.Element {
  const cast = castOf(session.document);
  const [adding, setAdding] = useState(false);
  const arrange = session.arrange;
  const member =
    !adding && arrange?.kind === 'cast'
      ? (cast.find((entry) => entry.ref === arrange.target.ref) ?? null)
      : null;
  const pressedRef =
    arrange?.kind === 'cast'
      ? arrange.target.ref
      : arrange?.kind === 'actor'
        ? arrange.monster.ref
        : null;
  return (
    <section aria-label="Cast" className="es-creature-panel">
      <h2>Cast</h2>
      <p className="es-help">
        A cast member is a stat block, or a rulebook monster as it is, plus the
        look and faction new placements start with. Selecting one highlights its
        placements on the map.
      </p>
      {cast.length ? (
        <ul aria-label="Cast members" className="es-inspector-list">
          {cast.map((entry) => (
            <li key={entry.ref}>
              <button
                type="button"
                aria-pressed={!adding && pressedRef === entry.ref}
                onClick={() => {
                  if (session.cast.select(entry.ref)) setAdding(false);
                }}
              >
                {entry.name} ·{' '}
                {entry.source === 'template' ? 'stat block' : 'rulebook'} ·{' '}
                {entry.placements.length} placement
                {entry.placements.length === 1 ? '' : 's'}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No cast yet. Add a stat block or a rulebook monster.</p>
      )}
      <button
        type="button"
        aria-pressed={adding}
        onClick={() => setAdding(true)}
      >
        Add a cast member
      </button>
      {(adding || member) && (
        <CastMemberForm
          key={member?.ref ?? 'new'}
          session={session}
          member={member}
          onShowPlacement={onShowPlacement}
          onSaved={() => setAdding(false)}
        />
      )}
    </section>
  );
}
