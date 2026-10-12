import { useEffect, useState } from 'react';
import {
  TEMPLATE_ABILITIES,
  validateMonsterTemplates,
  type MonsterTemplate,
  type TemplateAbility,
} from '../world-building/monsterTemplates';
import type { EncounterStudioSession } from './studioSession';

const FIELDS = [
  ['name', 'Name'],
  ['base', 'Base monster reference'],
  ...TEMPLATE_ABILITIES.map((key) => [`abilities.${key}`, key.toUpperCase()]),
  ['hitDice', 'Hit dice'],
  ['armor', 'Armor reference'],
  ['proficiency', 'Proficiency bonus'],
  ['skills', 'Proficient skills'],
  ['actions', 'Weapon references'],
  ['experience', 'Experience award'],
] as const;

/** Edit only changed fields: untouched optional absence/empty overrides survive. */
function editTemplateFields(
  base: MonsterTemplate,
  changes: Record<string, string>
): MonsterTemplate {
  const next = structuredClone(base);
  for (const [key, raw] of Object.entries(changes)) {
    const value = raw.trim();
    if (key.startsWith('abilities.')) {
      const ability = key.slice('abilities.'.length) as TemplateAbility;
      next.abilities = { ...next.abilities };
      if (value === '') delete next.abilities[ability];
      else next.abilities[ability] = Number(value);
      if (!Object.keys(next.abilities).length) delete next.abilities;
    } else if (key === 'proficiency' || key === 'experience') {
      if (value === '') delete next[key];
      else next[key] = Number(value);
    } else if (key === 'skills' || key === 'actions') {
      if (value === '') delete next[key];
      else next[key] = value.split(',').map((part) => part.trim());
    } else if (key === 'base') next.base = value;
    else if (key === 'name' || key === 'hitDice' || key === 'armor') {
      if (value === '') delete next[key];
      else next[key] = value;
    }
  }
  return next;
}
function fieldText(template: MonsterTemplate, key: string): string {
  const value = key.startsWith('abilities.')
    ? template.abilities?.[key.slice('abilities.'.length) as TemplateAbility]
    : template[key as keyof MonsterTemplate];
  return Array.isArray(value)
    ? value.join(', ')
    : value === undefined
      ? ''
      : String(value);
}
export function StudioStatBlocks({
  session,
}: {
  session: EncounterStudioSession;
}): React.JSX.Element {
  const templates = session.document.scope.templates ?? {};
  const [editing, setEditing] = useState('');
  const [id, setId] = useState('');
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const reset = (): void => {
    setChanges({});
    setError(null);
  };
  useEffect(() => {
    setChanges({});
    setError(null);
    if (
      editing &&
      !Object.hasOwn(session.document.scope.templates ?? {}, editing)
    )
      setEditing('');
  }, [session.document, session.intentEpoch, editing]);
  const template = Object.hasOwn(templates, editing)
    ? templates[editing]
    : { base: 'dnd5e:monsters:human' };
  return (
    <section aria-label="Stat blocks" className="es-creature-panel">
      <h2>Stat blocks</h2>
      <p>
        Named blocks are shared by every creature referencing them. Standard
        monster definitions are unchanged. The engine derives HP, AC and
        attacks; these fields store authored inputs only.
      </p>
      <label>
        Stat block
        <select
          aria-label="Stat block"
          value={editing}
          onChange={(event) => {
            setEditing(event.target.value);
            setId('');
            reset();
          }}
        >
          <option value="">New stat block</option>
          {Object.entries(templates).map(([key, value]) => (
            <option key={key} value={key}>
              {value.name || key} · {key}
            </option>
          ))}
        </select>
      </label>
      <form
        aria-label="Edit stat block"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const key = editing || id.trim();
            if (!editing && Object.hasOwn(templates, key))
              throw new Error(
                'That stat block id already exists. Select it to edit.'
              );
            const next = {
              ...templates,
              [key]: editTemplateFields(template, changes),
            };
            const valid = validateMonsterTemplates(next);
            if (!session.commitTemplates(valid))
              throw new Error(
                'Stat block edit refused. Check the document notice.'
              );
            setEditing(key);
            reset();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
      >
        <label>
          Stat block id
          <input
            aria-label="Stat block id"
            value={editing || id}
            readOnly={!!editing}
            onChange={(event) => setId(event.target.value)}
            required
          />
        </label>
        <div className="es-stat-fields">
          {FIELDS.map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                aria-label={label}
                value={changes[key] ?? fieldText(template, key)}
                onChange={(event) =>
                  setChanges((previous) => ({
                    ...previous,
                    [key]: event.target.value,
                  }))
                }
              />
            </label>
          ))}
        </div>
        <p>
          Blank overrides inherit the base; an absent experience award means
          zero. Skills and weapon references are comma-separated. Hit dice
          example: 2d8 (no CON modifier). Armor example:
          dnd5e:armor:chain-shirt. Human is the released base for custom blocks;
          the engine resolves other base references.
        </p>
        <button type="submit">Apply stat block</button>{' '}
        <button type="button" onClick={reset}>
          Cancel stat block edits
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </section>
  );
}
