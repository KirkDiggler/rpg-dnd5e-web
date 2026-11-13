/**
 * THE ENCOUNTER HOME'S PARTY SECTION (rpg-project#935): the sharing dial,
 * three stops in plain words, the line that says what the chosen stop means
 * for players (rpg-project#930 R5), and the site's sharing read back the way
 * the engine says it. The dial edits `party.sharing` alone; every other key
 * under `party` rides along as written.
 */
import {
  SHARING_STOPS,
  authoredSharing,
  sharingSentence,
  sharingStop,
} from '../world-building/partySharing';
import { AboutPanel } from './FieldHelp';
import type { EncounterStudioSession } from './studioSession';

export function StudioParty({
  session,
}: {
  session: EncounterStudioSession;
}): React.JSX.Element {
  const scope = session.document.scope;
  const stop = sharingStop(scope);
  const authored = authoredSharing(scope);
  return (
    <section aria-label="Party settings" className="es-social-panel">
      <h2>Party</h2>
      <AboutPanel>
        <p>
          One setting for this encounter: what each player is shown of what the
          rest of the party perceives. An encounter that does not set it is at
          shared view.
        </p>
      </AboutPanel>
      <h3 id="party-sharing-label">Sharing</h3>
      <div
        className="es-buttons"
        role="group"
        aria-labelledby="party-sharing-label"
      >
        {SHARING_STOPS.map((s) => (
          <button
            key={s.word}
            type="button"
            aria-pressed={stop?.word === s.word}
            onClick={() => {
              if (stop?.word !== s.word) session.commitPartySharing(s.word);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="es-help" aria-label="What the sharing stop means">
        {stop !== undefined
          ? stop.means
          : `The file says sharing: ${String(authored)}, which is not one of these stops.`}
      </p>
      {stop?.word === 'knowledge' && (
        <p role="alert">
          Shared knowledge is not built yet, so this site will be refused at
          launch.
        </p>
      )}
      <p aria-label="Party sharing read back">{sharingSentence(scope)}</p>
    </section>
  );
}
