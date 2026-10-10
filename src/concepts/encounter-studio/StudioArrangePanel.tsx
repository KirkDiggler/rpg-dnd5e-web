import { FACING_NAMES } from '@/components/hex-grid/facingYaw';
import { useEffect, useState } from 'react';
import {
  arrangeFields,
  arrangeIntent,
  regionStatus,
  type ArrangeDraft,
  type ArrangeField,
  type ArrangeFieldKey,
} from './StudioArrangeFields';
import type {
  EncounterStudioSession,
  StudioArrangeSelection,
} from './studioSession';
import { StudioWallAppearanceChoices } from './StudioWallAppearanceChoices';

function StudioArrangeField({
  field,
  draft,
  onChange,
}: {
  field: ArrangeField;
  draft: ArrangeDraft;
  onChange(key: ArrangeFieldKey, value: string): void;
}): React.JSX.Element {
  return (
    <label className="es-arrange-row">
      <span>{field.label}</span>
      {field.choices ? (
        <select
          aria-label={field.label}
          value={draft[field.key] ?? field.value}
          onChange={(event) => onChange(field.key, event.target.value)}
        >
          {field.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          inputMode={field.numeric ? 'decimal' : undefined}
          placeholder={field.placeholder}
          value={draft[field.key] ?? field.value}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      )}
    </label>
  );
}

function selectionName(
  selection: StudioArrangeSelection,
  session: EncounterStudioSession
): string {
  switch (selection.kind) {
    case 'scene': {
      const scene = session.document.draft.scene;
      const root = [...scene.items, ...scene.groups].find(
        (entity) => entity.id === selection.rootIds[0]
      );
      return selection.rootCount === 1
        ? root?.label || root?.id || 'Scenery'
        : `${selection.rootCount} scenery roots`;
    }
    case 'wall':
      return selection.wall.label || selection.wall.id;
    case 'door':
      return `Door · ${selection.door.assetRef}`;
    case 'label':
      return selection.label.text;
    case 'actor':
      return selection.monster.id;
    case 'start':
      return 'Party start';
  }
}

/** Local form tokens only; all canonical updates cross the atomic owner seam. */
function SelectedArrange({
  session,
  selection,
  expanded,
  onDefineRegion,
}: {
  session: EncounterStudioSession;
  selection: StudioArrangeSelection;
  expanded: boolean;
  onDefineRegion?(): void;
}): React.JSX.Element {
  const [draft, setDraft] = useState<ArrangeDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const linkedRegionId =
    selection.kind === 'label' ? selection.region?.id : undefined;
  const preview =
    (selection.kind === 'scene' ||
      selection.kind === 'wall' ||
      selection.kind === 'door') &&
    !!selection.preview;
  const reset = (): void => {
    setDraft({});
    setError(null);
  };
  useEffect(() => {
    setDraft({});
    setError(null);
  }, [session.document, session.intentEpoch]);
  useEffect(() => {
    // Linked-label lighting is staged with the whole noun, never retained behind
    // a collapsed panel. Other precision forms keep their existing tuck-away law.
    if (!expanded && linkedRegionId) {
      setDraft({});
      setError(null);
    }
  }, [expanded, linkedRegionId]);
  return (
    <section
      hidden={!expanded}
      id="studio-arrange-panel"
      className="es-context-panel es-arrange"
      aria-label="Arrange selection"
    >
      <h2>Arrange · {selectionName(selection, session)}</h2>
      <p className="es-help">
        {selection.kind === 'scene'
          ? selection.rootCount === 1
            ? 'World position · world units'
            : 'Selection pivot · world units'
          : selection.kind === 'wall'
            ? 'Wall midpoint and dimensions · world units'
            : selection.kind === 'door'
              ? 'Along owning wall · world units'
              : selection.kind === 'label'
                ? 'World position · world units'
                : 'Starting hex · q / r'}
      </p>
      {preview && (
        <p role="status">
          Preview · Finish or cancel the canvas gesture before applying.
        </p>
      )}
      {selection.kind === 'actor' && (
        <p className="es-help">{selection.monster.ref}</p>
      )}
      {selection.kind === 'label' && selection.region && (
        <div className="es-region-controls" aria-label="Room boundary">
          <p role="status">
            {regionStatus(selection.region, selection.resolution)}
          </p>
          {onDefineRegion && (
            <div className="es-buttons">
              <button
                type="button"
                onClick={() => {
                  if (
                    !session.commitArrange({
                      kind: 'region-bind',
                      target: selection.target,
                      regionId: selection.region!.id,
                    })
                  )
                    setError(
                      'Binding refused. No supported enclosure at this label; define an explicit area or repair the walls.'
                    );
                }}
              >
                Use enclosing walls
              </button>
              <button type="button" onClick={onDefineRegion}>
                Define explicit area
              </button>
            </div>
          )}
        </div>
      )}
      <form
        aria-label="Arrange selected noun"
        aria-describedby={error ? 'arrange-error' : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (preview) return;
          try {
            const intent = arrangeIntent(selection, draft);
            if (!intent) return;
            if (session.commitArrange(intent)) reset();
            else
              setError(
                'Arrange edit refused. Review the document notice; your inputs are unchanged.'
              );
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
          }
        }}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            event.target instanceof HTMLInputElement &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            reset();
          }
        }}
      >
        <div className="es-arrange-fields">
          {arrangeFields(selection, FACING_NAMES).map((field) => (
            <StudioArrangeField
              key={field.key}
              field={field}
              draft={draft}
              onChange={(key, value) => {
                setDraft((previous) => {
                  const next = { ...previous, [key]: value };
                  if (key === 'background') delete next.baseline;
                  return next;
                });
                setError(null);
              }}
            />
          ))}
        </div>
        {selection.kind === 'label' && selection.region && (
          <div className="es-region-controls" aria-label="Region lighting">
            <p className="es-help">
              {selection.region.lighting
                ? selection.resolution?.status === 'resolved'
                  ? 'Background lighting only · placed lights stay independent. Not gameplay visibility.'
                  : 'Lighting saved · not applied until boundary resolves'
                : 'Baseline · no region light authored'}
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft((previous) => ({
                  ...previous,
                  background: '',
                  baseline: 'reset',
                }));
                setError(null);
              }}
            >
              Use baseline appearance
            </button>
            {draft.baseline === 'reset' && (
              <p role="status">Baseline appearance staged · Apply to reset.</p>
            )}
          </div>
        )}
        {selection.kind === 'wall' && (
          <>
            {!appearanceVisible && (
              <p className="es-help">
                {session.wallEditing.options.some(
                  (option) => option.ref === selection.appearance.assetRef
                )
                  ? `Appearance: ${selection.appearance.assetRef}`
                  : `Unsupported imported appearance: ${selection.appearance.assetRef}. Preserved until you explicitly choose a replacement.`}
              </p>
            )}
            <button
              type="button"
              aria-expanded={appearanceVisible}
              aria-controls="arrange-wall-choices"
              onClick={() => setAppearanceVisible(!appearanceVisible)}
            >
              Change wall appearance
            </button>
            {appearanceVisible && (
              <div id="arrange-wall-choices">
                <StudioWallAppearanceChoices
                  options={session.wallEditing.options}
                  assetRef={draft.assetRef ?? selection.appearance.assetRef}
                  onChoose={(ref) =>
                    setDraft((previous) => ({ ...previous, assetRef: ref }))
                  }
                />
              </div>
            )}
            {draft.assetRef !== undefined && (
              <p className="es-help">Appearance staged · Apply to replace.</p>
            )}
          </>
        )}
        <div className="es-buttons">
          <button type="submit" disabled={preview}>
            Apply Arrange
          </button>
          <button type="button" onClick={reset}>
            Cancel Arrange
          </button>
          {(selection.kind === 'wall' ||
            selection.kind === 'label' ||
            selection.kind === 'door') && (
            <button
              type="button"
              disabled={preview}
              onClick={() => {
                const accepted =
                  selection.kind === 'wall'
                    ? session.commitArrange({
                        kind: 'wall-remove',
                        target: selection.target,
                      })
                    : selection.kind === 'door'
                      ? session.commitArrange({
                          kind: 'door-remove',
                          target: selection.target,
                        })
                      : selection.region
                        ? session.commitArrange({
                            kind: 'region-remove',
                            target: selection.target,
                            regionId: selection.region.id,
                          })
                        : session.commitArrange({
                            kind: 'label-remove',
                            target: selection.target,
                          });
                if (!accepted)
                  setError('Removal refused. Review the document notice.');
              }}
            >
              {selection.kind === 'wall'
                ? 'Remove wall'
                : selection.kind === 'door'
                  ? 'Delete doorway'
                  : selection.region
                    ? 'Delete region and label'
                    : 'Delete label'}
            </button>
          )}
        </div>
        {error && (
          <p role="alert" id="arrange-error">
            {error}
          </p>
        )}
      </form>
      {selection.kind === 'scene' && session.propControls.arrangeExtras}
    </section>
  );
}

export function StudioArrangePanel({
  session,
  expanded,
  onDefineRegion,
}: {
  session: EncounterStudioSession;
  expanded: boolean;
  onDefineRegion?(): void;
}): React.JSX.Element {
  return session.arrange ? (
    <SelectedArrange
      key={`${session.arrange.selectionKey}:${session.arrange.selectionRevision}`}
      session={session}
      selection={session.arrange}
      expanded={expanded}
      onDefineRegion={onDefineRegion}
    />
  ) : (
    <section
      hidden={!expanded}
      id="studio-arrange-panel"
      className="es-context-panel es-arrange"
      aria-label="Arrange selection"
    >
      <h2>Arrange</h2>
      <p className="es-help">
        Select an object to arrange its supported values.
      </p>
    </section>
  );
}
