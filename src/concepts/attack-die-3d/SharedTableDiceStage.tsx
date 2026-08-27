import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import type { DiceRollGroupKey } from '../../components/ui/dice/diceRollGroup';
import type {
  DiceRollGroupEvent,
  DiceRollGroupReleasedEvent,
  DiceRollGroupRequestedEvent,
} from '../../components/ui/dice/diceRollGroupEvent';
import { DiceTrayPresentation } from '../../components/ui/dice/DiceTrayPresentation';
import {
  ROLL_GROUP_FEEL_PROFILES,
  type RollGroupFeelCandidateId,
} from '../../components/ui/dice/rollGroupMotionSolver';
import type {
  DiceRollGroupPresentationProps,
  RollGroupAttachmentDiagnostic,
} from '../../components/ui/dice/RollGroupPresentation';
import { createSharedTableDiceDeliveryHost } from './sharedTableDiceDelivery';
import {
  createSharedTableDiceEvidencePublisher,
  type SharedTableDiceEvidencePublisher,
} from './sharedTableDiceEvidence';
import { SHARED_TABLE_DICE_SCENARIOS } from './sharedTableDiceFixtures';
import {
  isSharedTableDiceScenarioId,
  parseSharedTableDiceScenarioRecord,
  SHARED_TABLE_DICE_SCENARIO_IDS,
  type SharedTableDiceScenario,
  type SharedTableDiceScenarioId,
  type SharedTableDiceScenarioRecord,
} from './sharedTableDiceScenario';
import {
  reduceSharedTableDice,
  type SharedTableDiceState,
} from './sharedTableDiceState';

const FEEL_IDS = Object.freeze([
  'weighty',
  'energetic',
  'physical',
] as const satisfies readonly RollGroupFeelCandidateId[]);
const VERDICT_HOLD_MS = 650;
const IMPACT_HOLD_MS = 800;

type CoordinatorAction = Parameters<typeof reduceSharedTableDice>[1];
type WitnessView = 'roller' | 'spectator';

export interface SharedTableDiceStageProps {
  readonly reducedMotion?: boolean;
  readonly scenarioRecords?: unknown;
}

function fixturePresentationId(
  scenarioId: SharedTableDiceScenarioId,
  run: number,
  groupKey: DiceRollGroupKey
) {
  return `concept:shared-table:${scenarioId}:run:${run}:${groupKey}`;
}

function requestEvent(
  scenario: SharedTableDiceScenario,
  run: number,
  groupKey: DiceRollGroupKey
): DiceRollGroupRequestedEvent {
  const presentationId = fixturePresentationId(scenario.id, run, groupKey);
  return Object.freeze({
    schemaVersion: 1,
    type: 'dice-roll-group-requested',
    eventId: `${presentationId}:request`,
    presentationId,
    roller: Object.freeze({
      memberId: scenario.rollerMemberId,
      role: 'player' as const,
    }),
    group:
      groupKey === 'damage' && scenario.damage
        ? scenario.damage
        : scenario.attack,
  });
}

function displayedGroupKey(
  state: SharedTableDiceState,
  scenario: SharedTableDiceScenario
): DiceRollGroupKey {
  if (state.phase === 'damage' || state.phase === 'impact') return 'damage';
  if (state.phase === 'complete' && scenario.hit && scenario.damage)
    return 'damage';
  return 'attack';
}

function phaseSummary(state: SharedTableDiceState, groupLabel?: string) {
  const completed = state.activePresentation
    ? Number(state.activePresentation.completed.roller) +
      Number(state.activePresentation.completed.spectator)
    : 0;
  if (state.phase === 'attack')
    return `Attack · ${completed} of 2 witnesses complete`;
  if (state.phase === 'attack-verdict')
    return `${groupLabel ?? 'Attack verdict'} · both witnesses complete`;
  if (state.phase === 'damage')
    return `Damage · ${completed} of 2 witnesses complete`;
  if (state.phase === 'impact')
    return `${groupLabel ?? 'Impact'} · both witnesses complete`;
  return `${groupLabel ?? 'Roll'} · playback complete`;
}

function rerollLabels(scenario: SharedTableDiceScenario) {
  const labels = new Set<string>();
  for (const group of [scenario.attack, scenario.damage]) {
    if (!group) continue;
    for (const die of group.dice)
      for (const reroll of die.rerolls) labels.add(reroll.displayLabel);
  }
  return [...labels];
}

function SharedTableDiceRun({
  scenario,
  feel,
  reducedMotion,
  run,
}: {
  readonly scenario: SharedTableDiceScenario;
  readonly feel: RollGroupFeelCandidateId;
  readonly reducedMotion: boolean;
  readonly run: number;
}) {
  const [events, setEvents] = useState<readonly DiceRollGroupEvent[]>(
    Object.freeze([])
  );
  const [delivery] = useState(() =>
    createSharedTableDiceDeliveryHost(setEvents)
  );
  const [evidence] = useState<SharedTableDiceEvidencePublisher>(() =>
    createSharedTableDiceEvidencePublisher()
  );
  const [witnessView, setWitnessView] = useState<WitnessView>('roller');
  const witnessTabsId = useId();
  const witnessTabId = (role: WitnessView) => `${witnessTabsId}-${role}-tab`;
  const witnessPaneId = (role: WitnessView) => `${witnessTabsId}-${role}-pane`;
  const [state, dispatch] = useReducer(
    (current: SharedTableDiceState, action: CoordinatorAction) =>
      reduceSharedTableDice(current, action, scenario),
    {
      scenarioId: scenario.id,
      phase: 'attack',
    } satisfies SharedTableDiceState
  );
  const groupKey = displayedGroupKey(state, scenario);
  const group =
    groupKey === 'damage' && scenario.damage
      ? scenario.damage
      : scenario.attack;
  const request = useMemo(
    () => requestEvent(scenario, run, groupKey),
    [groupKey, run, scenario]
  );
  const appearances = useMemo(() => {
    const setsById = new Map(scenario.sets.map((set) => [set.id, set]));
    const playersById = new Map(
      scenario.players.map((player) => [player.memberId, player])
    );
    return Object.freeze(
      group.dice.flatMap((die) => {
        const set = setsById.get(die.setId);
        const contributor = playersById.get(die.contributorMemberId);
        return set && contributor
          ? [
              Object.freeze({
                dieId: die.id,
                contributorLabel: contributor.name,
                treatment: set.treatment,
              }),
            ]
          : [];
      })
    );
  }, [group.dice, scenario.players, scenario.sets]);
  const dieIds = useMemo(
    () => Object.freeze(group.dice.map((die) => die.id)),
    [group.dice]
  );

  useLayoutEffect(() => {
    delivery.reset();
    delivery.append(request);
    const cancelMissingRelease =
      scenario.exercise === 'missing-release'
        ? delivery.scheduleMissingRelease({
            presentationId: request.presentationId,
            groupKey: request.group.key,
            presetSeed: run,
            graceMs: 3_000,
          })
        : undefined;
    return () => {
      cancelMissingRelease?.();
      delivery.reset();
    };
  }, [delivery, request, run, scenario.exercise]);

  useEffect(() => {
    if (state.phase !== 'attack-verdict') return;
    const timer = setTimeout(
      () => dispatch({ type: 'verdict-complete' }),
      VERDICT_HOLD_MS
    );
    return () => clearTimeout(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase !== 'impact') return;
    const timer = setTimeout(
      () => dispatch({ type: 'impact-complete' }),
      IMPACT_HOLD_MS
    );
    return () => clearTimeout(timer);
  }, [state.phase]);

  const handleMount = useCallback<
    NonNullable<DiceRollGroupPresentationProps['onMount']>
  >(
    (mount) => {
      evidence.activate({ ...mount, dieIds });
      dispatch({ type: 'presentation-mounted', ...mount });
    },
    [dieIds, evidence]
  );
  const handleComplete = useCallback<
    NonNullable<DiceRollGroupPresentationProps['onComplete']>
  >((completion) => {
    dispatch({ type: 'group-complete', ...completion });
  }, []);
  const handleAttachmentDiagnostic = useCallback(
    (diagnostic: RollGroupAttachmentDiagnostic) => {
      evidence.publish(diagnostic);
    },
    [evidence]
  );
  const handleReleaseRequest = useCallback(
    (release: DiceRollGroupReleasedEvent) => {
      delivery.append(release);
      if (scenario.exercise === 'duplicate-release')
        delivery.append(
          Object.freeze({
            ...release,
            eventId: `${release.eventId}:duplicate`,
          })
        );
    },
    [delivery, scenario.exercise]
  );

  const active = state.activePresentation;
  useLayoutEffect(() => {
    if (!active) return;
    for (const role of ['roller', 'spectator'] as const) {
      const rendererGeneration = active.generations[role];
      if (rendererGeneration === undefined) continue;
      evidence.activate({
        presentationId: active.presentationId,
        groupKey: active.groupKey,
        witnessRole: role,
        rendererGeneration,
        dieIds,
      });
    }
  }, [active, dieIds, evidence]);
  useLayoutEffect(
    () => () => {
      evidence.clear();
    },
    [evidence]
  );

  if (appearances.length !== group.dice.length) {
    return (
      <p role="alert">
        Fixture scenario refused: appearance consistency failed. No dice content
        was mounted.
      </p>
    );
  }

  const phaseLabel =
    state.phase === 'attack-verdict'
      ? scenario.attack.verdictLabel
      : state.phase === 'impact' || state.phase === 'complete'
        ? (scenario.impactLabel ?? scenario.attack.verdictLabel)
        : undefined;
  const forceFailure =
    scenario.exercise === 'provider-failure'
      ? ('provider' as const)
      : typeof WebGLRenderingContext === 'undefined'
        ? ('webgl' as const)
        : undefined;
  const sharedProps = {
    mode: 'roll-group' as const,
    events,
    feel,
    appearances,
    onMount: handleMount,
    onComplete: handleComplete,
    onAttachmentDiagnostic: handleAttachmentDiagnostic,
    reducedMotion,
    forceFailure,
  };

  return (
    <div className="shared-table-dice-stage__playback">
      <p
        className="shared-table-dice-stage__phase"
        data-testid="shared-table-dice-phase"
        aria-live="polite"
      >
        {phaseLabel ? <strong>{phaseLabel}</strong> : null}
        {phaseLabel ? ' · ' : null}
        {phaseSummary(state, phaseLabel).replace(
          phaseLabel ? `${phaseLabel} · ` : '',
          ''
        )}
      </p>
      <div
        className="shared-table-dice-stage__witness-tabs"
        role="tablist"
        aria-label="Shared table witness view"
      >
        {(
          [
            ['roller', 'Roller'],
            ['spectator', 'Witness'],
          ] as const
        ).map(([role, label]) => (
          <button
            key={role}
            id={witnessTabId(role)}
            type="button"
            role="tab"
            aria-selected={witnessView === role}
            aria-controls={witnessPaneId(role)}
            onClick={() => setWitnessView(role)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="shared-table-dice-stage__witnesses"
        data-active-witness={witnessView}
      >
        <section
          id={witnessPaneId('roller')}
          className="shared-table-dice-stage__witness"
          data-witness-pane="roller"
          role="tabpanel"
          aria-labelledby={witnessTabId('roller')}
        >
          <p className="shared-table-dice-stage__witness-label">Roller view</p>
          <DiceTrayPresentation
            {...sharedProps}
            mode="roll-group"
            label={`Shared table Roller ${group.key} dice`}
            witnessRole="roller"
            onReleaseRequest={
              scenario.exercise === 'missing-release'
                ? undefined
                : handleReleaseRequest
            }
          />
        </section>
        <section
          id={witnessPaneId('spectator')}
          className="shared-table-dice-stage__witness"
          data-witness-pane="spectator"
          role="tabpanel"
          aria-labelledby={witnessTabId('spectator')}
        >
          <p className="shared-table-dice-stage__witness-label">Witness view</p>
          <DiceTrayPresentation
            {...sharedProps}
            mode="roll-group"
            label={`Shared table Witness ${group.key} dice`}
            witnessRole="spectator"
          />
        </section>
      </div>
    </div>
  );
}

function ValidatedSharedTableDiceStage({
  inheritedReducedMotion,
  scenarios,
}: {
  readonly inheritedReducedMotion: boolean;
  readonly scenarios: SharedTableDiceScenarioRecord;
}) {
  const [scenarioId, setScenarioId] =
    useState<SharedTableDiceScenarioId>('single-d20');
  const [feel, setFeel] = useState<RollGroupFeelCandidateId>('physical');
  const [reducedMotion, setReducedMotion] = useState(inheritedReducedMotion);
  const [run, setRun] = useState(1);
  useEffect(() => {
    setReducedMotion(inheritedReducedMotion);
  }, [inheritedReducedMotion]);
  const scenario = scenarios[scenarioId];
  const rerolls = rerollLabels(scenario);
  const reset = () => setRun((current) => current + 1);

  return (
    <section
      className="shared-table-dice-stage"
      aria-labelledby="shared-table-dice-stage-title"
    >
      <header className="shared-table-dice-stage__header">
        <div className="shared-table-dice-stage__title">
          <p>Task 8 · local concept playback</p>
          <h3 id="shared-table-dice-stage-title">Shared table dice feel lab</h3>
        </div>
        <div
          className="shared-table-dice-stage__badges"
          aria-label="Concept boundaries"
        >
          <span>Fixture data</span>
          <span>Simulated delivery</span>
          <span>Provisional non-d20 assets</span>
        </div>
        <div className="shared-table-dice-stage__controls">
          <fieldset aria-label="Feel candidate">
            <legend>Feel candidate</legend>
            {FEEL_IDS.map((candidate) => (
              <label key={candidate}>
                <input
                  type="radio"
                  name="shared-table-dice-feel"
                  checked={feel === candidate}
                  onChange={() => {
                    setFeel(candidate);
                    reset();
                  }}
                />
                {ROLL_GROUP_FEEL_PROFILES[candidate].displayName}
              </label>
            ))}
          </fieldset>
          <label>
            Scenario
            <select
              aria-label="Scenario"
              value={scenarioId}
              onChange={(event) => {
                const nextScenarioId = event.target.value;
                if (!isSharedTableDiceScenarioId(nextScenarioId)) return;
                setScenarioId(nextScenarioId);
                reset();
              }}
            >
              {SHARED_TABLE_DICE_SCENARIO_IDS.map((id) => (
                <option key={id} value={id}>
                  {scenarios[id].label}
                </option>
              ))}
            </select>
          </label>
          <label className="shared-table-dice-stage__reduced-motion">
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => {
                setReducedMotion(event.target.checked);
                reset();
              }}
            />
            Reduced motion
          </label>
          <button type="button" onClick={reset}>
            Replay
          </button>
        </div>
        <div className="shared-table-dice-stage__fixture-facts">
          <p>
            Contributors ·{' '}
            {scenario.players.map((player, index) => {
              const set = scenario.sets.find(
                (candidate) => candidate.id === player.setId
              );
              return set ? (
                <span key={player.memberId}>
                  {index > 0 ? ' · ' : ''}
                  {player.name} — {set.displayName}
                </span>
              ) : null;
            })}
          </p>
          {rerolls.length > 0 ? <p>Reroll cue · {rerolls.join(', ')}</p> : null}
          <p aria-label="Fallback status">
            Fallback status ·{' '}
            {scenario.exercise === 'provider-failure'
              ? 'semantic fallback exercise'
              : '3D with truthful semantic fallback'}
          </p>
        </div>
      </header>
      <SharedTableDiceRun
        key={run}
        scenario={scenario}
        feel={feel}
        reducedMotion={reducedMotion || scenarioId === 'reduced-motion'}
        run={run}
      />
    </section>
  );
}

export function SharedTableDiceStage({
  reducedMotion: inheritedReducedMotion = false,
  scenarioRecords,
}: SharedTableDiceStageProps) {
  const scenarios = useMemo(
    () =>
      scenarioRecords === undefined
        ? SHARED_TABLE_DICE_SCENARIOS
        : parseSharedTableDiceScenarioRecord(scenarioRecords),
    [scenarioRecords]
  );
  if (!scenarios) {
    return (
      <section
        className="shared-table-dice-stage"
        aria-labelledby="shared-table-dice-refusal-title"
      >
        <h3 id="shared-table-dice-refusal-title">
          Shared table dice feel lab unavailable
        </h3>
        <p role="alert">
          Fixture scenario refused: strict validation failed. No dice content
          was mounted.
        </p>
      </section>
    );
  }
  return (
    <ValidatedSharedTableDiceStage
      inheritedReducedMotion={inheritedReducedMotion}
      scenarios={scenarios}
    />
  );
}
