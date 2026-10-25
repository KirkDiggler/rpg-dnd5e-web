/**
 * SAVE AND PLAY IN THE STUDIO (rpg-project#545 R15–R18). The header's one
 * control saves the encoder's bytes under the draft's one key and launches
 * them with the character picked on Home, through the publishing and launch
 * hooks World Builder already uses (`useRoomPublishing`,
 * `usePlayAuthoredDungeon`). This file is the studio's own presentation of
 * that hook: the header button and its status, and the panel the button
 * opens — the key, Save to server, the overwrite ask, the refusals as jumps,
 * and one sentence per failure. It holds no transaction state of its own.
 */
import { useEffect, useRef } from 'react';
import { FieldHelp } from './FieldHelp';
import type { RefusalJump, RefusalTarget } from './refusalJump';
import {
  keyRefusalOf,
  NO_CHARACTER_SENTENCE,
  playUnavailableReason,
  publishStatusText,
  serverUnavailableReason,
  type StudioPublishGate,
  type StudioPublishing,
} from './studioPublishing';

/** The header control: one Save & Play on every home and view (R15). */
export function StudioPlayButton({
  publishing,
  gate,
  characterId,
  roomId,
  panelOpen,
  onPress,
  disabledReason,
}: {
  publishing: StudioPublishing;
  gate: StudioPublishGate;
  characterId: string | null;
  roomId: string;
  panelOpen: boolean;
  onPress(): void;
  disabledReason?: string;
}): React.JSX.Element {
  const reason =
    disabledReason ?? playUnavailableReason(gate.state, characterId);
  return (
    <>
      <button
        type="button"
        disabled={reason !== null || publishing.busy}
        title={reason ?? undefined}
        aria-describedby={reason ? 'studio-play-reason' : undefined}
        aria-expanded={panelOpen}
        aria-controls="studio-site"
        onClick={onPress}
      >
        Play
      </button>
      <span aria-live="polite" className="es-publish-status">
        {publishStatusText(publishing, roomId)}
      </span>
      {reason && (
        <span id="studio-play-reason" className="es-help">
          {reason}
        </span>
      )}
      {gate.state === 'unreachable' && (
        <button type="button" onClick={gate.retry}>
          Retry server
        </button>
      )}
    </>
  );
}

export interface StudioPublishProps {
  publishing: StudioPublishing;
  gate: StudioPublishGate;
  characterId: string | null;
  /** From `refusalJumps` over `currentRefusals`, computed by the surface. */
  jumps: readonly RefusalJump[];
  /** The noun a jump lands on, in words, for its button. */
  nameOf(target: RefusalTarget): string;
  /** The surface routes a jump to the selection or home section. */
  onJump(target: RefusalTarget): void;
  onClose?(): void;
  copy?: boolean;
  copySourceKey?: string | null;
}

/** The panel the header's Save & Play opens, under the header beside the
 * Draft file panel (S6-Q5). */
export function StudioPublish({
  publishing,
  gate,
  characterId,
  jumps,
  nameOf,
  onJump,
  onClose,
  copy = false,
  copySourceKey = null,
}: StudioPublishProps): React.JSX.Element {
  const {
    key,
    setKey,
    busy,
    overwritePending,
    saver,
    launch,
    error,
    encodeError,
  } = publishing;
  const replaceRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (overwritePending) replaceRef.current?.focus();
  }, [overwritePending]);
  const serverReason = serverUnavailableReason(gate.state);
  const copyRefusal =
    copy && copySourceKey === key.trim()
      ? 'Choose a different key for the copy. The original must stay unchanged.'
      : null;
  const keyRefusal = copyRefusal ?? keyRefusalOf(publishing);
  const saveFailed =
    saver.status === 'error' && !keyRefusal
      ? `Save failed: ${saver.message ?? 'the server did not answer'}. Your draft is unchanged.`
      : null;
  return (
    <section
      className="es-draft-file-panel es-publish-panel"
      aria-label="Save and Play"
    >
      <h3>{copy ? 'Save a copy' : 'Save to My World'}</h3>
      <p className="es-help">
        {copy
          ? 'Save this site under a different key. The original stays unchanged.'
          : 'Save this site to your world. Download YAML instead to keep a file on your computer.'}
      </p>
      <form
        aria-label="Save to server"
        className="es-buttons"
        onSubmit={(event) => {
          event.preventDefault();
          if (!copyRefusal) void publishing.save();
        }}
      >
        <label className="es-field">
          <span>
            File key{' '}
            <FieldHelp field="Server key">
              The key the server saves this draft under, the same key the draft
              file is named for. Lowercase letters, digits and dashes.
            </FieldHelp>
          </span>
          <input
            aria-label="File key"
            value={key}
            disabled={busy}
            onChange={(event) => setKey(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || serverReason !== null || copyRefusal !== null}
        >
          {copy ? 'Save copy to My World' : 'Save to My World'}
        </button>
        {onClose && (
          <button type="button" onClick={onClose}>
            Close Save and Play
          </button>
        )}
        {keyRefusal && (
          <span role="alert" className="es-warning">
            {keyRefusal}
          </span>
        )}
      </form>
      {serverReason && gate.state !== 'probing' && (
        <p className="es-help" role="status">
          {serverReason}{' '}
          {gate.state === 'unreachable' && (
            <button type="button" onClick={gate.retry}>
              Retry
            </button>
          )}
        </p>
      )}
      {!serverReason && characterId === null && (
        <p className="es-help">
          {NO_CHARACTER_SENTENCE} You can still save to My World.
        </p>
      )}
      {overwritePending && (
        <div
          className="es-buttons"
          role="alertdialog"
          aria-label={`Replace ${overwritePending.key}`}
        >
          <span>
            {overwritePending.key} already exists on the server. Replace it?
          </span>
          <button
            type="button"
            ref={replaceRef}
            disabled={busy}
            onClick={() => void publishing.confirmOverwrite()}
          >
            Replace
          </button>
          <button type="button" onClick={publishing.cancelOverwrite}>
            Keep
          </button>
        </div>
      )}
      {encodeError && (
        <p role="alert" className="es-warning">
          This draft cannot be written as a file yet: {encodeError}
        </p>
      )}
      {error && !keyRefusal && (
        <p role="alert" className="es-warning">
          {error}
        </p>
      )}
      {saveFailed && (
        <p role="alert" className="es-warning">
          {saveFailed}
        </p>
      )}
      {launch.error && (
        <p role="alert" className="es-warning">
          {launch.error}
        </p>
      )}
      {jumps.length > 0 && (
        <div role="group" aria-label="Server refusals">
          <p className="es-help">
            The server refused this draft. Each refusal opens the thing to fix.
          </p>
          <ul className="es-refusals">
            {jumps.map((jump, index) => (
              <li key={`${jump.path}:${index}`}>
                {jump.target ? (
                  <button
                    type="button"
                    title={jump.path}
                    onClick={() => onJump(jump.target!)}
                  >
                    {nameOf(jump.target)}: {jump.message}
                  </button>
                ) : (
                  <span>
                    {jump.message}
                    {jump.path && (
                      <>
                        {' '}
                        <small>{jump.path}</small>
                      </>
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
