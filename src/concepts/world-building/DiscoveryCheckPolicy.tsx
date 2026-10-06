import type { SiteDiscoveryAttempts } from './siteScope';

export function DiscoveryCheckPolicy({
  id,
  value,
  onChange,
}: {
  id: string;
  value?: SiteDiscoveryAttempts;
  onChange: (value: SiteDiscoveryAttempts) => void;
}) {
  const attempts = value?.max ?? 1;
  return (
    <fieldset>
      <legend>Automatic discovery attempts</legend>
      <label>
        <span>Total attempts per character</span>
        <input
          aria-label={`Attempts for ${id}`}
          type="number"
          min={1}
          step={1}
          value={attempts}
          onChange={(event) => {
            if (event.target.value !== '')
              onChange({ ...value, max: Number(event.target.value) });
          }}
        />
      </label>
      <label>
        <span>Attempt lifetime</span>
        <select
          aria-label={`Attempt lifetime for ${id}`}
          value={value?.lifetime ?? 'character'}
          onChange={(event) =>
            onChange({
              ...value,
              lifetime: event.target.value as 'character' | 'run',
            })
          }
        >
          <option value="character">Across visits</option>
          <option value="run">Each run</option>
        </select>
      </label>
      <label>
        <span>Move this many hexes away before retrying</span>
        <input
          aria-label={`Retry distance for ${id}`}
          type="number"
          min={2}
          step={1}
          disabled={attempts <= 1}
          value={value?.reset_hexes ?? 3}
          onChange={(event) => {
            if (event.target.value !== '')
              onChange({ ...value, reset_hexes: Number(event.target.value) });
          }}
        />
      </label>
      <p className="wb-help">
        Rolls happen automatically within one hex. Repeat attempts require
        moving away and returning. Mandatory progress must remain possible if
        every check fails.
      </p>
    </fieldset>
  );
}
