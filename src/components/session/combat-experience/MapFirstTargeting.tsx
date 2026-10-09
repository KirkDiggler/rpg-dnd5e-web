import { Verb } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { ActionInformationContent } from './ActionInformationContent';
import {
  buildActionTooltip,
  effectLinesFor,
  heldEffectLinesFor,
} from './actionTooltip';
import styles from './MapFirstTargeting.module.css';
import {
  memberTargetingView,
  type MemberTargetingInput,
} from './memberTargeting';

interface LocalView {
  scope: string;
  list: boolean;
  preview: string | null;
  details: string | null;
}
const initial = (scope: string): LocalView => ({
  scope,
  list: false,
  preview: null,
  details: null,
});
export interface MapFirstTargetingProps {
  input: MemberTargetingInput;
  host: HTMLElement | null;
  memberNames: ReadonlyMap<string, string>;
  hoveredTarget?: string | null;
  optionId?: string;
  onChoose: (member: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  onChangeChoice?: () => void;
  onHeightChange?: (height: number) => void;
}

/** UI only. Map, list and chips all use the same guarded selection callback. */
export function MapFirstTargeting({
  input,
  host,
  memberNames,
  hoveredTarget,
  optionId,
  onChoose,
  onConfirm,
  onCancel,
  onChangeChoice,
  onHeightChange,
}: MapFirstTargetingProps) {
  const { declaration } = input;
  const view = memberTargetingView(input);
  const scope = declaration ? `offer:${declaration.id}` : 'missing';
  const [local, setLocal] = useState<LocalView>(() => initial(scope));
  const current = local.scope === scope ? local : initial(scope);
  const update = useCallback(
    (patch: Partial<Omit<LocalView, 'scope'>>) =>
      setLocal((prior) => ({
        ...(prior.scope === scope ? prior : initial(scope)),
        ...patch,
        scope,
      })),
    [scope]
  );
  const root = useRef<HTMLElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const targetsButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [height, setHeight] = useState(0);
  const prefix = useId();
  const candidates = [
    ...new Map(
      (declaration?.candidates ?? [])
        .filter((candidate) => candidate.member)
        .map((candidate) => [candidate.member, candidate])
    ).values(),
  ];
  const uniqueCandidate = (member: string) => {
    const matches =
      declaration?.candidates.filter(
        (candidate) => candidate.member === member
      ) ?? [];
    return matches.length === 1 ? matches[0] : undefined;
  };
  const nameFor = (member: string, index?: number): string =>
    memberNames.get(member) ||
    `Target ${
      (index ??
        Math.max(
          0,
          candidates.findIndex((candidate) => candidate.member === member)
        )) + 1
    }`;
  const selectedIds = view.selected.map((target) => target.member);
  const atLimit = Boolean(
    view.multi && selectedIds.length >= (declaration?.maxTargets ?? 0)
  );
  const optionMatches =
    declaration?.options.filter((option) => option.id === optionId) ?? [];
  const option = optionMatches.length === 1 ? optionMatches[0] : undefined;
  const actionInformation = declaration
    ? buildActionTooltip(declaration)
    : undefined;
  const action = actionInformation?.title ?? 'Action';
  const label = `${action}${option?.label ? ` · ${option.label}` : ''}`;
  const statusFor = (member: string): string => {
    const selected = view.selected.find((target) => target.member === member);
    if (selected)
      return selected.valid
        ? `Selected ${selectedIds.indexOf(member) + 1}`
        : selected.reason || 'Unavailable';
    const candidate = uniqueCandidate(member);
    if (!candidate) return 'Target information unavailable';
    if (!candidate.available) return candidate.why?.text || 'Unavailable';
    if (view.reason) return view.reason;
    if (view.selectionProblem) return view.selectionProblem;
    return atLimit ? 'Target limit reached' : 'Available';
  };
  const canChoose = (member: string): boolean =>
    selectedIds.includes(member) ||
    (view.canChoose &&
      !view.selectionProblem &&
      !atLimit &&
      view.availableMembers.includes(member));
  const preview =
    current.preview && uniqueCandidate(current.preview)
      ? current.preview
      : null;
  const details =
    current.details && uniqueCandidate(current.details)
      ? current.details
      : null;
  const hoveredIsCandidate = Boolean(
    hoveredTarget &&
    candidates.some((candidate) => candidate.member === hoveredTarget)
  );
  useEffect(() => {
    if ((current.details && !details) || (current.preview && !preview))
      update({ details: details, preview: preview });
  }, [current.details, current.preview, details, preview, update]);
  useEffect(() => {
    if (hoveredTarget)
      update({ preview: hoveredIsCandidate ? hoveredTarget : null });
  }, [hoveredTarget, hoveredIsCandidate, update]);
  useEffect(() => {
    const node = root.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const next = node.getBoundingClientRect().height;
      setHeight(next);
      onHeightChange?.(next);
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      onHeightChange?.(0);
    };
  }, [host, onHeightChange]);
  useEffect(() => {
    if (!host) return;
    const target = targetsButton.current?.disabled
      ? cancelButton.current
      : targetsButton.current;
    target?.focus({ preventScroll: true });
  }, [scope, host]);
  useEffect(() => {
    if (current.list)
      list.current
        ?.querySelector<HTMLElement>(
          'input:not(:disabled),button:not(:disabled)'
        )
        ?.focus({ preventScroll: true });
  }, [current.list, scope]);
  useEffect(() => {
    if (!details && !current.list) return;
    const outside = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        !root.current?.contains(event.target)
      ) {
        update({
          details: null,
          ...(event.target instanceof Element &&
          event.target.closest('[data-desktop-dock]')
            ? { list: false }
            : {}),
        });
      }
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  }, [details, current.list, update]);
  const closeDetails = (): void => {
    update({ details: null });
    targetsButton.current?.focus();
  };
  const choose = (member: string): void => {
    if (canChoose(member)) {
      update({ preview: member });
      onChoose(member);
    }
  };
  const actorLines =
    declaration && details ? effectLinesFor(declaration, details) : [];
  const heldLines =
    declaration && details ? heldEffectLinesFor(declaration, details) : [];
  if (!host) return null;
  return createPortal(
    <section
      ref={root}
      className={styles.targeting}
      data-testid="map-first-targeting"
      aria-label="Targeting"
      style={
        { '--targeting-strip-height': `${height || 84}px` } as CSSProperties
      }
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Element &&
          !event.currentTarget.contains(event.relatedTarget) &&
          event.relatedTarget.closest('[data-desktop-dock]')
        )
          update({ list: false, details: null });
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        if (details) closeDetails();
        else if (current.list) {
          update({ list: false });
          targetsButton.current?.focus();
        } else onCancel?.();
      }}
    >
      <div className={styles.strip}>
        <strong>{label}</strong>
        <span id={`${prefix}-instruction`} aria-live="polite">
          {view.multi
            ? `${selectedIds.length}/${declaration!.maxTargets} selected`
            : selectedIds.length
              ? `${selectedIds.length} selected`
              : 'Choose a target'}
        </span>
        {view.multi && (
          <button
            type="button"
            className={styles.confirm}
            disabled={!view.canConfirm || !onConfirm}
            onClick={() => {
              if (view.canConfirm) onConfirm?.();
            }}
          >
            {declaration?.verb === Verb.CAST
              ? `Cast ${label}`
              : `Confirm ${label}`}
          </button>
        )}
        <button
          ref={targetsButton}
          type="button"
          aria-expanded={current.list}
          aria-controls={`${prefix}-list`}
          aria-describedby={`${prefix}-instruction`}
          disabled={!candidates.length}
          onClick={() => update({ list: !current.list })}
        >
          Targets ({candidates.length})
        </button>
        {declaration?.options.length && onChangeChoice ? (
          <button
            type="button"
            disabled={
              !input.authorityFresh ||
              !input.turnAllowed ||
              !declaration.available
            }
            onClick={onChangeChoice}
          >
            {option?.label ? 'Change choice' : 'Choose option'}
          </button>
        ) : null}
        {onCancel && (
          <button
            ref={cancelButton}
            type="button"
            aria-label="Cancel action"
            onClick={onCancel}
          >
            Cancel
          </button>
        )}
      </div>
      {selectedIds.length > 0 && (
        <div className={styles.chips} aria-label="Selected targets">
          {view.selected.map((target, index) => (
            <div
              key={target.member}
              data-selected-member={target.member}
              data-valid={target.valid}
            >
              <button
                type="button"
                className={styles.chipName}
                aria-label={`Inspect selected ${nameFor(target.member, index)}`}
                disabled={!uniqueCandidate(target.member)}
                title={
                  target.valid
                    ? nameFor(target.member, index)
                    : `${nameFor(target.member, index)} — ${target.reason}`
                }
                onClick={() =>
                  update({ details: target.member, preview: target.member })
                }
              >
                <span aria-hidden="true">✓ {index + 1}</span>
                <span>{nameFor(target.member, index)}</span>
              </button>
              <button
                type="button"
                aria-label={`Remove ${nameFor(target.member, index)}`}
                onClick={() => onChoose(target.member)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {(view.reason ||
        view.selectionProblem ||
        !view.availableMembers.length) && (
        <p className={styles.notice} aria-live="polite">
          {view.reason ||
            view.selectionProblem ||
            'No available targets are currently offered.'}
        </p>
      )}
      {preview && !selectedIds.includes(preview) && (
        <div className={styles.preview}>
          <span>
            {nameFor(preview)} · {statusFor(preview)}
          </span>
          <button type="button" onClick={() => update({ details: preview })}>
            Inspect target
          </button>
        </div>
      )}
      {current.list && (
        <div
          ref={list}
          className={styles.list}
          id={`${prefix}-list`}
          role="region"
          aria-label={`${label} targets`}
        >
          <header>
            <strong>
              {view.multi
                ? `Select ${declaration!.minTargets}–${declaration!.maxTargets} targets`
                : 'Choose a target'}
            </strong>
            <button
              type="button"
              onClick={() => {
                update({ list: false });
                targetsButton.current?.focus();
              }}
            >
              Close targets
            </button>
          </header>
          {candidates.map((candidate, index) => (
            <div
              key={candidate.member}
              className={styles.targetRow}
              data-checked={selectedIds.includes(candidate.member)}
            >
              {view.multi ? (
                <label>
                  <input
                    type="checkbox"
                    aria-label={nameFor(candidate.member, index)}
                    aria-describedby={`${prefix}-reason-${index}`}
                    checked={selectedIds.includes(candidate.member)}
                    disabled={!canChoose(candidate.member)}
                    onFocus={() => update({ preview: candidate.member })}
                    onChange={() => choose(candidate.member)}
                  />
                  <span>
                    <strong>{nameFor(candidate.member, index)}</strong>
                    <small id={`${prefix}-reason-${index}`}>
                      {statusFor(candidate.member)}
                    </small>
                  </span>
                </label>
              ) : (
                <button
                  type="button"
                  className={styles.singleTarget}
                  disabled={!canChoose(candidate.member)}
                  onFocus={() => update({ preview: candidate.member })}
                  onClick={() => choose(candidate.member)}
                >
                  <strong>{nameFor(candidate.member, index)}</strong>
                  <small>{statusFor(candidate.member)}</small>
                </button>
              )}
              <button
                type="button"
                aria-label={`Inspect ${nameFor(candidate.member, index)} target`}
                disabled={!uniqueCandidate(candidate.member)}
                onClick={() =>
                  update({
                    details: candidate.member,
                    preview: candidate.member,
                  })
                }
              >
                Info
              </button>
            </div>
          ))}
        </div>
      )}
      {details && declaration && (
        <div
          className={styles.details}
          data-list-open={current.list}
          role="region"
          aria-label={`${nameFor(details)} target information`}
          tabIndex={0}
        >
          <header>
            <div>
              <strong>{nameFor(details)}</strong>
              <small>
                For {label} · {statusFor(details)}
              </small>
            </div>
            <button type="button" onClick={closeDetails}>
              Close information
            </button>
          </header>
          {!input.authorityFresh && (
            <p className={styles.notice}>
              Last received information — may be out of date.
            </p>
          )}
          {actionInformation && (
            <ActionInformationContent
              description={actionInformation.description}
              lines={actionInformation.lines}
              effects={actorLines}
              effectsLabel="Your action effects"
              targetEffects={heldLines}
              targetEffectsLabel="On this target"
            />
          )}
          {!actorLines.length && !heldLines.length && (
            <p>No effect information supplied for this target.</p>
          )}
        </div>
      )}
    </section>,
    host
  );
}
