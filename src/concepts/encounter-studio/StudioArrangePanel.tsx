import { paletteNameForRef } from '@/author/paletteData';
import { FACING_NAMES } from '@/components/hex-grid/facingYaw';
import { chooseNpcAppearance } from '@/npc-appearances/npcAppearanceChoices';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { castMemberOf } from '../world-building/cast';
import {
  deriveWallCornerFits,
  wallFitAsset,
} from '../world-building/wallCornerFits';
import { FieldHelp } from './FieldHelp';
import {
  arrangeFields,
  arrangeIntent,
  regionStatus,
  selectionName,
  type ArrangeDraft,
  type ArrangeField,
  type ArrangeFieldKey,
} from './StudioArrangeFields';
import { StudioSection } from './StudioSection';
import type {
  EncounterStudioSession,
  StudioArrangeSelection,
  StudioSocialSection,
} from './studioSession';
import { StudioWallAppearanceChoices } from './StudioWallAppearanceChoices';
import { StudioWallConstraints } from './StudioWallConstraints';
import { StudioWallFinishes } from './StudioWallFinishes';

function StudioArrangeField({
  field,
  draft,
  onChange,
}: {
  field: ArrangeField;
  draft: ArrangeDraft;
  onChange(key: ArrangeFieldKey, value: string): void;
}): React.JSX.Element {
  const row = (
    <label className="es-arrange-row">
      <span>{field.label}</span>
      {field.choices ? (
        <select
          aria-label={field.label}
          disabled={field.disabled}
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
  return field.help ? (
    <div className="es-arrange-field">
      {row}
      <FieldHelp field={field.label}>{field.help}</FieldHelp>
    </div>
  ) : (
    row
  );
}

/** How an inspector view composes the one-transaction form. */
export interface ArrangeComposition {
  /** An "Arrange · name" heading; the inspector names the selection in its
   * own heading. */
  heading?: boolean;
  /** Region boundary and lighting controls, for a region label. */
  regionControls?: boolean;
  /** The owner's configuration forms and the definition links. */
  configuration?: boolean;
  /** Replaces the scene's arrange extras below the form. */
  extras?: ReactNode;
  /** Leads the Placement section, above the form: the creature's cast
   * member summary. */
  lead?: ReactNode;
  /** The form section's title; Placement unless the view names it. */
  sectionTitle?: string;
}

/** Local form tokens only; all canonical updates cross the atomic owner seam. */
function SelectedArrange({
  session,
  selection,
  expanded,
  activeRegionId,
  onMakeActive,
  onConfigure,
  onMoveCreature,
  heading = true,
  regionControls = true,
  configuration = true,
  extras,
  lead,
  sectionTitle = 'Placement',
}: {
  session: EncounterStudioSession;
  selection: StudioArrangeSelection;
  onMoveCreature?(): void;
  expanded: boolean;
  /** The region paint lands in, and how to make another one it. */
  activeRegionId?: string;
  onMakeActive?(regionId: string): void;
  onConfigure?(section: StudioSocialSection): void;
} & ArrangeComposition): React.JSX.Element {
  const [draft, setDraft] = useState<ArrangeDraft>({});
  const [error, setError] = useState<string | null>(null);
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const preview =
    (selection.kind === 'scene' ||
      selection.kind === 'wall' ||
      selection.kind === 'door') &&
    !!selection.preview;
  const reset = (): void => {
    setDraft({});
    setError(null);
  };
  /** Set while this form's own picker commits: the document it produces
   * keeps the other staged fields rather than discarding them. */
  const pickerCommit = useRef(false);
  useEffect(() => {
    if (pickerCommit.current) {
      pickerCommit.current = false;
      return;
    }
    setDraft({});
    setError(null);
  }, [session.document, session.intentEpoch]);
  /** A self-contained picker applies on change, as its own history entry
   * (S5-Q1). Text and number fields stay staged behind Apply. */
  const commitPicker = (patch: ArrangeDraft): void => {
    let intent;
    try {
      intent = arrangeIntent(selection, patch);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return;
    }
    if (!intent) return;
    pickerCommit.current = true;
    if (session.commitArrange(intent)) setError(null);
    else {
      pickerCommit.current = false;
      setError(
        'Edit refused. Review the document notice; your inputs are unchanged.'
      );
    }
  };
  const cornerInfo = useMemo(
    () => deriveWallCornerFits(session.document.draft.room.walls ?? []),
    [session.document.draft.room.walls]
  );
  const fields = arrangeFields(selection, FACING_NAMES, draft).filter(
    (field) => regionControls || field.key !== 'background'
  );
  const region =
    regionControls && selection.kind === 'region'
      ? selection.region
      : undefined;
  const renderField = (field: ArrangeField): React.JSX.Element => (
    <StudioArrangeField
      key={field.key}
      field={field}
      draft={draft}
      onChange={(key, value) => {
        if (
          selection.kind === 'actor' &&
          (key === 'appearanceFamily' ||
            key === 'appearanceStyle' ||
            key === 'appearanceSkinPalette')
        ) {
          try {
            const appearanceRef = chooseNpcAppearance({
              currentRef: selection.monster.appearanceRef,
              control:
                key === 'appearanceFamily'
                  ? 'family'
                  : key === 'appearanceStyle'
                    ? 'style'
                    : 'skinPalette',
              value,
            });
            commitPicker({ appearanceRef });
          } catch (error) {
            setError(error instanceof Error ? error.message : String(error));
          }
          return;
        }
        if (field.applyOnChange) {
          commitPicker({ [key]: value });
          return;
        }
        setDraft((previous) => {
          const next = { ...previous, [key]: value };
          if (key === 'background') delete next.baseline;
          return next;
        });
        setError(null);
      }}
    />
  );
  return (
    <section
      hidden={!expanded}
      id="studio-arrange-panel"
      className="es-context-panel es-arrange"
      aria-label="Arrange selection"
    >
      {heading && <h2>{selectionName(selection, session)}</h2>}
      <StudioSection
        title={sectionTitle}
        level="section"
        about={
          <>
            {selection.kind === 'wall' && (
              <p>
                Heading is Start → End: 0° and −180° can be parallel. Hover an
                endpoint in Layout for X/Z.
              </p>
            )}
            <p>
              {selection.kind === 'scene'
                ? selection.rootCount === 1
                  ? 'World position · world units'
                  : 'Selection pivot · world units'
                : selection.kind === 'wall'
                  ? 'Wall line endpoints · world X/Z units'
                  : selection.kind === 'door'
                    ? 'Along owning wall · world units'
                    : selection.kind === 'label'
                      ? 'World position · world units'
                      : 'Starting hex · q / r'}
            </p>
          </>
        }
      >
        {lead}
        {selection.kind === 'wall' && (
          <StudioWallConstraints editing={session.wallEditing} />
        )}
        {selection.kind === 'wall' && (
          <p className="es-help">
            {!wallFitAsset(selection.wall.appearance.assetRef)
              ? 'This appearance has no verified miter fit. Choose Castle Wall Fit 01 on both walls for automatic flush corners.'
              : (cornerInfo.reasons.get(selection.wall.id) ??
                'Supported joined corners fit automatically.')}
          </p>
        )}
        {preview && (
          <p role="status">
            Preview · Finish or cancel the canvas gesture before applying.
          </p>
        )}
        {selection.kind === 'actor' && (
          <>
            <dl className="es-facts">
              <div>
                <dt>Kind</dt>
                <dd title={selection.monster.ref}>
                  {castMemberOf(session.document, selection.monster.ref)
                    ?.name ?? paletteNameForRef(selection.monster.ref)}
                </dd>
              </div>
            </dl>
            {onMoveCreature && (
              <button type="button" onClick={onMoveCreature}>
                Move creature
              </button>
            )}
            <button
              type="button"
              disabled={session.publishing.busy || preview}
              onClick={() => {
                if (
                  !session.commitArrange({
                    kind: 'actor-remove',
                    target: selection.target,
                  })
                )
                  setError(
                    'Could not remove this placement. Select it again or check the document notice.'
                  );
              }}
            >
              Remove from board
            </button>
            <p className="es-help">
              Removes this placement only. The cast member remains available;
              Undo restores the placement.
            </p>
          </>
        )}
        {selection.kind === 'region' && region && (
          <div className="es-region-controls" aria-label="Region cells">
            <p role="status">{regionStatus(selection.resolution)}</p>
            {onMakeActive && (
              <div className="es-buttons">
                <button
                  type="button"
                  aria-pressed={activeRegionId === region.id}
                  onClick={() => onMakeActive(region.id)}
                >
                  {activeRegionId === region.id
                    ? 'Active · Paint lands here'
                    : 'Make active'}
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
                  'Edit refused. Review the document notice; your inputs are unchanged.'
                );
            } catch (caught) {
              setError(
                caught instanceof Error ? caught.message : String(caught)
              );
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
          {selection.kind === 'wall' && (
            <StudioWallFinishes
              session={session}
              wall={selection.wall}
              draft={draft}
              onChange={(patch) => {
                setDraft((previous) => ({ ...previous, ...patch }));
                setError(null);
              }}
            />
          )}
          <div className="es-arrange-fields">
            {fields.filter((field) => !field.secondary).map(renderField)}
            {fields.some((field) => field.secondary) && (
              <details>
                <summary>Position · whole wall</summary>
                {fields.filter((field) => field.secondary).map(renderField)}
              </details>
            )}
          </div>
          {selection.kind === 'region' && region && (
            <p className="es-help">
              The region's encounter lighting · placed lights stay independent.
              Its name is its label on the map.
            </p>
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
              Apply
            </button>
            <button type="button" onClick={reset}>
              Cancel
            </button>
            {(selection.kind === 'wall' ||
              selection.kind === 'label' ||
              (selection.kind === 'region' && !selection.implicit) ||
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
                        : selection.kind === 'region'
                          ? session.commitArrange({
                              kind: 'region-remove',
                              target: selection.target,
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
                    : selection.kind === 'region'
                      ? 'Remove region'
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
        {extras !== undefined
          ? extras
          : selection.kind === 'scene' && session.propControls.arrangeExtras}
      </StudioSection>
      {configuration &&
        (selection.kind === 'actor' || selection.kind === 'scene') && (
          <StudioSection
            title="Behaviour"
            level="section"
            className="es-selection-configuration"
          >
            {session.socialControls.selection}
            {onConfigure && (
              <nav
                className="es-buttons"
                aria-label="Open encounter definitions"
              >
                <button type="button" onClick={() => onConfigure('intel')}>
                  Edit intel definitions
                </button>
                {selection.kind === 'actor' && (
                  <>
                    <button
                      type="button"
                      onClick={() => onConfigure('factions')}
                    >
                      Edit factions
                    </button>
                    <button
                      type="button"
                      onClick={() => onConfigure('dispositions')}
                    >
                      Edit dispositions
                    </button>
                    <button type="button" onClick={() => onConfigure('tables')}>
                      Edit behavior tables
                    </button>
                  </>
                )}
              </nav>
            )}
          </StudioSection>
        )}
    </section>
  );
}

/** The selected noun's one-transaction form, or nothing: the room view is
 * the inspector's, not this form's. */
export function StudioArrangePanel({
  session,
  expanded,
  activeRegionId,
  onMakeActive,
  onConfigure,
  onMoveCreature,
  ...composition
}: {
  session: EncounterStudioSession;
  onMoveCreature?(): void;
  expanded: boolean;
  /** The region paint lands in, and how to make another one it. */
  activeRegionId?: string;
  onMakeActive?(regionId: string): void;
  onConfigure?(section: StudioSocialSection): void;
} & ArrangeComposition): React.JSX.Element | null {
  return session.arrange ? (
    <SelectedArrange
      key={`${session.arrange.selectionKey}:${session.arrange.selectionRevision}`}
      session={session}
      selection={session.arrange}
      expanded={expanded}
      activeRegionId={activeRegionId}
      onMakeActive={onMakeActive}
      onConfigure={onConfigure}
      onMoveCreature={onMoveCreature}
      {...composition}
    />
  ) : null;
}
