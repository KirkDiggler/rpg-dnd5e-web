import { CombatExperience } from '@/components/session/combat-experience/CombatExperience';
import { buildActionTooltip } from '@/components/session/combat-experience/actionTooltip';
import type {
  DesktopHotbarLayout,
  HotbarRows,
} from '@/components/session/combat-experience/desktopHotbarLayout';
import {
  isMultiMemberDeclaration,
  memberTargetingView,
  toggleMemberTarget,
  type MemberTargetingInput,
} from '@/components/session/combat-experience/memberTargeting';
import type {
  ActionIconPresentation,
  OrganizedActionPresentation,
} from '@/components/session/combat-experience/organizedActionPresentation';
import type {
  CombatExperienceLogMode,
  CombatExperiencePresentationState,
  CombatExperienceStoryExchange,
} from '@/components/session/combat-experience/types';
import type { DebugFeedEntry } from '@/components/session/debugLogLine';
import { create } from '@bufbuild/protobuf';
import {
  ClockKind,
  ParticipantSchema,
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SessionCombatMap } from '../session-combat/SessionCombatMap';
import type { SessionCombatFixture } from '../session-combat/sessionCombatTypes';
import { ORGANIZED_HUD_PROFILES } from './fixtures';
import './organizedHud.css';

const EMPTY: CombatExperiencePresentationState = {
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
};

export interface HudConceptProfile {
  id: string;
  label: string;
  presentation: OrganizedActionPresentation;
  desktopIcons?: Readonly<Record<string, ActionIconPresentation>>;
  storySamples?: readonly Omit<CombatExperienceStoryExchange, 'id'>[];
  fixtures: readonly (Omit<SessionCombatFixture, 'debug'> & {
    authorityFresh?: boolean;
    debug: readonly DebugFeedEntry[];
  })[];
}

/** Fixture-only composition: real CombatExperience + action organizer, no RPC writes. */
export function OrganizedHudConcept({
  profiles = ORGANIZED_HUD_PROFILES,
  title = 'Organized HUD',
  conceptId = 'organized-hud',
  iconExperiment = false,
}: {
  profiles?: readonly HudConceptProfile[];
  title?: string;
  conceptId?: string;
  iconExperiment?: boolean;
} = {}) {
  const [scenarioId, setScenarioId] = useState(profiles[0]!.fixtures[0]!.id);
  const [profileId, setProfileId] = useState(profiles[0]!.id);
  const profile =
    profiles.find((item) => item.id === profileId) ?? profiles[0]!;
  const frameRef = useRef<HTMLDivElement>(null);
  const [desktopFrame, setDesktopFrame] = useState(false);
  const [iconsEnabled, setIconsEnabled] = useState(true);
  const desktopMode = iconExperiment && iconsEnabled && desktopFrame;
  const [barRows, setBarRows] = useState<HotbarRows>(1);
  const [preferences, setPreferences] = useState<{
    kind: 'favorites-v1';
    byProfile: Record<string, DesktopHotbarLayout['favoriteIdsBySection']>;
  }>({ kind: 'favorites-v1', byProfile: {} });
  // HMR must not reinterpret a prior drag-order array as chosen favorites.
  const barFavorites =
    preferences.kind === 'favorites-v1' ? preferences.byProfile : {};
  const [logMode, setLogMode] = useState<CombatExperienceLogMode>('story');
  const demoSequence = useRef(0);
  const [demoStory, setDemoStory] = useState<{
    scope: string;
    entries: readonly CombatExperienceStoryExchange[];
  }>({ scope: '', entries: [] });
  useEffect(() => {
    if (
      !iconExperiment ||
      !frameRef.current ||
      typeof ResizeObserver === 'undefined'
    )
      return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setDesktopFrame(
          entry.contentRect.width >= 1000 && entry.contentRect.height > 500
        );
    });
    observer.observe(frameRef.current);
    return () => observer.disconnect();
  }, [iconExperiment]);
  const [frame, setFrame] = useState<'pc' | 'phone'>('pc');
  const [crowdedInitiative, setCrowdedInitiative] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [hoveredTarget, setHoveredTarget] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(
    Boolean(document.fullscreenElement)
  );
  const [fullscreenError, setFullscreenError] = useState('');
  const fullscreenSupported =
    typeof document.documentElement.requestFullscreen === 'function';
  useEffect(() => {
    const previousTitle = document.title;
    document.title =
      title === 'Organized HUD'
        ? 'RPG — HUD Preview'
        : `RPG — ${title} Preview`;
    const updateFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => {
      document.title = previousTitle;
      document.removeEventListener('fullscreenchange', updateFullscreen);
    };
  }, [title]);
  const toggleFullscreen = async () => {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError(
        'Full screen could not start or exit. You can keep using the preview in Chrome.'
      );
    }
  };
  const [state, setState] = useState<CombatExperiencePresentationState>(EMPTY);
  const [intent, setIntent] = useState(
    'No intent sent — fixture-only walkthrough.'
  );
  const preview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';
  const fixture =
    profile.fixtures.find((item) => item.id === scenarioId) ??
    profile.fixtures[0]!;
  const storyScope = `${profile.id}:${fixture.id}`;
  const demoEntries = demoStory.scope === storyScope ? demoStory.entries : [];
  const nextEvent = (): void => {
    const id = `hotbar-demo:${++demoSequence.current}`;
    setDemoStory((current) => {
      const entries = current.scope === storyScope ? current.entries : [];
      const samples = profile.storySamples ?? [];
      const sample = samples[entries.length % samples.length];
      return sample
        ? {
            scope: storyScope,
            entries: [...entries, { ...sample, id, deliverySource: 'live' }],
          }
        : current;
    });
  };
  // Tracker-only stress fixture; these extras do not create map actors or actions.
  const participants = useMemo(
    () =>
      crowdedInitiative
        ? [
            ...fixture.participants,
            ...Array.from({ length: 8 }, (_, index) =>
              create(ParticipantSchema, {
                ...fixture.participants[1],
                member: `initiative-preview-${index}`,
                name: `Skeleton ${index + 3}`,
                active: false,
              })
            ),
          ]
        : fixture.participants,
    [crowdedInitiative, fixture.participants]
  );
  const authorityFresh = fixture.authorityFresh ?? true;
  const cancel = useCallback(() => {
    setState(EMPTY);
    setIntent(
      'Fixture-only selection cancelled; no RPC or rule execution was sent.'
    );
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        (state.armedDeclarationId || state.optionDeclarationId)
      ) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancel, state.armedDeclarationId, state.optionDeclarationId]);
  const reset = (id: string) => {
    setScenarioId(id);
    setState(EMPTY);
    setIntent('No intent sent — fixture-only walkthrough.');
  };
  const selectDeclaration = (declaration: Declaration) => {
    if (declaration.verb === Verb.CAST && declaration.options.length > 0) {
      setState({ ...EMPTY, optionDeclarationId: declaration.id });
      setIntent(
        `Fixture-only ${declaration.id} options opened; no RPC or rule execution was sent.`
      );
      return;
    }
    setState({
      ...EMPTY,
      armedDeclarationId: declaration.id,
      movementSelected: declaration.verb === Verb.MOVE,
    });
    setIntent(
      `Fixture-only selected ${declaration.id}; no RPC or rule execution was sent.`
    );
  };
  const targetingInputFor = useCallback(
    (current: CombatExperiencePresentationState): MemberTargetingInput => {
      const matches = fixture.declarations.filter(
        (offer) => offer.id === current.armedDeclarationId
      );
      return {
        declaration: matches.length === 1 ? matches[0] : undefined,
        selectedMembers: current.selectedCandidateMembers ?? [],
        authorityFresh,
        turnAllowed:
          fixture.clock !== ClockKind.TURN ||
          participants.find((participant) => participant.active)?.member ===
            fixture.viewerMember,
        optionId: current.selectedOption,
      };
    },
    [
      fixture.declarations,
      fixture.clock,
      fixture.viewerMember,
      authorityFresh,
      participants,
    ]
  );
  // Canvas commits can trail the DOM HUD. An old map callback must consult
  // the current local choice/fixture, not resurrect a cancelled action.
  const targetingSnapshot = useRef({
    state,
    inputFor: targetingInputFor,
    desktopMode,
    scope: storyScope,
    participants,
  });
  useLayoutEffect(() => {
    targetingSnapshot.current = {
      state,
      inputFor: targetingInputFor,
      desktopMode,
      scope: storyScope,
      participants,
    };
  }, [state, targetingInputFor, desktopMode, storyScope, participants]);
  const selectTarget = (member: string) => {
    const snapshot = targetingSnapshot.current;
    if (snapshot.desktopMode !== desktopMode || snapshot.scope !== storyScope)
      return;
    if (desktopMode) {
      const input = snapshot.inputFor(snapshot.state);
      const next = toggleMemberTarget(input, member);
      if (!next.changed) return;
      const multi =
        !input.declaration || isMultiMemberDeclaration(input.declaration);
      setState((current) => {
        if (current.armedDeclarationId !== snapshot.state.armedDeclarationId)
          return current;
        const latest = toggleMemberTarget(
          targetingSnapshot.current.inputFor(current),
          member
        );
        if (!latest.changed) return current;
        return multi
          ? {
              ...current,
              selectedCandidateMembers: latest.members,
              selectedCandidateMember: latest.members.at(-1) ?? null,
            }
          : EMPTY;
      });
      const name =
        snapshot.participants.find(
          (participant) => participant.member === member
        )?.name ?? member;
      const option = input.declaration?.options.find(
        (entry) => entry.id === input.optionId
      );
      const label = `${input.declaration ? buildActionTooltip(input.declaration).title : 'action'}${option?.label ? ` · ${option.label}` : ''}`;
      setIntent(
        multi
          ? `Selection only: request for ${name}; no RPC or rule execution was sent.`
          : `Fixture-only ${label} → ${name} requested; no RPC or rule execution was sent.`
      );
      return;
    }
    setState((current) => {
      const selected = current.selectedCandidateMembers ?? [];
      const next = selected.includes(member)
        ? selected.filter((id) => id !== member)
        : [...selected, member];
      return {
        ...current,
        selectedCandidateMember: member,
        selectedCandidateMembers: next,
      };
    });
    setIntent(
      `Fixture-only target ${member} selected; confirm or cancel without an RPC.`
    );
  };

  const confirmTargets = (): void => {
    if (!desktopMode) {
      setIntent(
        'Fixture-only targets confirmed; no RPC or rule execution was sent.'
      );
      return;
    }
    const input = targetingInputFor(state);
    const view = memberTargetingView(input);
    if (!view.canConfirm || !input.declaration) return;
    const option = input.declaration.options.find(
      (entry) => entry.id === state.selectedOption
    );
    const label = `${buildActionTooltip(input.declaration).title}${option?.label ? ` · ${option.label}` : ''}`;
    const names = view.selected.map(
      (target) =>
        participants.find((participant) => participant.member === target.member)
          ?.name ?? target.member
    );
    setIntent(
      `Fixture-only ${input.declaration.verb === Verb.CAST ? 'cast' : 'confirm'} ${label} → ${names.join(', ') || 'no targets'} requested; no RPC or rule execution was sent.`
    );
    setState(EMPTY);
  };

  return (
    <section
      className="organizedHudConcept"
      data-preview={preview}
      data-frame={frame}
      aria-labelledby="organized-hud-title"
    >
      <header>
        <div className="organizedHudTitle">
          <span>Concept · real shared shell · fixture data</span>
          <h2 id="organized-hud-title">{title}</h2>
          <p>{fixture.description}</p>
        </div>
        <details className="organizedHudControls" open={!preview}>
          <summary>
            Controls · {profile.label} · {frame === 'pc' ? 'PC' : 'Phone'}
          </summary>
          <div role="group" aria-label="Character profile">
            {profiles.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === profileId}
                onClick={() => {
                  setProfileId(item.id);
                  reset(item.fixtures[0]!.id);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Scenario controls">
            {profile.fixtures.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={item.id === fixture.id}
                onClick={() => reset(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {iconExperiment && (
            <div role="group" aria-label="Layout comparison">
              <button
                type="button"
                aria-pressed={iconsEnabled}
                onClick={() => setIconsEnabled(true)}
              >
                Icon hotbar
              </button>
              <button
                type="button"
                aria-pressed={!iconsEnabled}
                onClick={() => setIconsEnabled(false)}
              >
                Current layout
              </button>
              <small>
                {desktopFrame
                  ? 'Desktop frame'
                  : 'Compact frame — existing touch layout'}
              </small>
            </div>
          )}
          {iconExperiment && profile.storySamples?.length ? (
            <div role="group" aria-label="Activity preview">
              <button type="button" onClick={nextEvent}>
                Next event
              </button>
              <small>
                Sample narration only · six seconds on screen, retained in Log.
              </small>
            </div>
          ) : null}
          <div role="group" aria-label="Frame controls">
            <button
              type="button"
              aria-pressed={frame === 'pc'}
              onClick={() => setFrame('pc')}
            >
              PC
            </button>
            <button
              type="button"
              aria-pressed={frame === 'phone'}
              onClick={() => setFrame('phone')}
            >
              Landscape phone
            </button>
          </div>
          <div>
            <button
              type="button"
              aria-pressed={crowdedInitiative}
              onClick={() => setCrowdedInitiative((value) => !value)}
            >
              Crowded initiative
            </button>
            <button
              type="button"
              disabled={!fullscreenSupported}
              onClick={toggleFullscreen}
            >
              {fullscreen ? 'Exit full screen' : 'Full screen'}
            </button>
          </div>
          {!fullscreenSupported && (
            <small>Full screen is not available in this browser.</small>
          )}
          {fullscreenError && <p role="alert">{fullscreenError}</p>}
          {!preview && (
            <a
              className="organizedHudPreviewLink"
              href={`?concept=${conceptId}&preview=1`}
            >
              Open viewport preview
            </a>
          )}
        </details>
      </header>
      {!preview && (
        <p className="organizedHudIntent" role="status">
          {intent}
        </p>
      )}
      <div
        ref={frameRef}
        className={`organizedHudFrame organizedHudFrame_${frame}`}
        data-testid="organized-hud-frame"
      >
        <CombatExperience
          layout="fill-parent"
          actionPresentation={{
            mode: 'organized-hud',
            ...profile.presentation,
            desktopIcons: desktopMode ? profile.desktopIcons : undefined,
            desktopFavorites: iconExperiment,
            desktopCustomization: iconExperiment
              ? {
                  layout: {
                    rows: barRows,
                    favoriteIdsBySection: barFavorites[profile.id] ?? {},
                  },
                  onChange: (next) => {
                    setBarRows(next.rows);
                    setPreferences((current) => ({
                      kind: 'favorites-v1',
                      byProfile: {
                        ...(current.kind === 'favorites-v1'
                          ? current.byProfile
                          : {}),
                        [profile.id]: next.favoriteIdsBySection,
                      },
                    }));
                  },
                }
              : undefined,
            // The same offers feed every frame; measured space owns overflow.
            quickDeclarationIds: profile.presentation.quickDeclarationIds,
          }}
          viewerMember={fixture.viewerMember}
          viewerName={fixture.viewerName}
          viewerClassRefId={fixture.viewerClassRefId}
          memberNames={
            new Map(
              participants.map((participant) => [
                participant.member,
                participant.name,
              ])
            )
          }
          clock={fixture.clock}
          round={fixture.round}
          participants={participants}
          declarations={fixture.declarations}
          characterData={fixture.characterData}
          privateStatus="ready"
          authorityFresh={authorityFresh}
          presentationState={state}
          phase={state.armedDeclarationId ? 'targeting' : 'fresh'}
          showTurnNotice={false}
          logMode={iconExperiment ? logMode : 'story'}
          diagnosticsEnabled={iconExperiment}
          streamState={fixture.streamState}
          story={
            iconExperiment ? [...fixture.story, ...demoEntries] : fixture.story
          }
          storyFeedback={iconExperiment ? { scopeKey: storyScope } : undefined}
          debug={fixture.debug}
          diceEvents={[]}
          location={{ name: 'Reference Tomb', area: 'South reliquary' }}
          hoveredTarget={hoveredTarget}
          renderMap={({
            attackableTargets,
            selectedTargets,
            onTargetClick,
          }) => (
            <SessionCombatMap
              attackableTargets={attackableTargets}
              selectedTargets={selectedTargets}
              onTargetClick={onTargetClick}
              onHoverTarget={setHoveredTarget}
              touchPanEnabled
              touchPinchEnabled
              touchRotateEnabled
              focusRequest={focusRequest}
            />
          )}
          onSelectDeclaration={selectDeclaration}
          onSelectCastOption={(option) => {
            const declaration = fixture.declarations.find(
              (candidate) => candidate.id === state.optionDeclarationId
            );
            if (!declaration || !declaration.available) return;
            setState({
              ...EMPTY,
              armedDeclarationId: declaration.id,
              selectedOption: option,
            });
            setIntent(
              `Fixture-only ${option} option selected; choose target or cancel without an RPC.`
            );
          }}
          onCancelCastOption={cancel}
          onCancelSelection={cancel}
          onTargetClick={selectTarget}
          onConfirmTargets={confirmTargets}
          onEndTurn={(declaration) =>
            setIntent(
              `Fixture-only End Turn ${declaration.id}; no RPC or rule execution was sent.`
            )
          }
          onLogModeChange={iconExperiment ? setLogMode : () => {}}
          onCenterView={() => setFocusRequest((request) => request + 1)}
          onOpenEquipment={() =>
            setIntent(
              'Fixture-only equipment surface requested; no inventory action exists in this fixture.'
            )
          }
          onSearch={() =>
            setIntent(
              'Fixture-only Search intent; no RPC or rule execution was sent.'
            )
          }
          onLeave={() =>
            setIntent(
              'Fixture-only Leave intent; no RPC or rule execution was sent.'
            )
          }
          diceWitnessRole="spectator"
        />
      </div>
      {preview && (
        <p className="organizedHudPreviewIntent" role="status">
          {intent}
        </p>
      )}
    </section>
  );
}
