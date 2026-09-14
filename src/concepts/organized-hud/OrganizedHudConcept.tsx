import { CombatExperience } from '@/components/session/combat-experience/CombatExperience';
import type { CombatExperiencePresentationState } from '@/components/session/combat-experience/types';
import {
  Verb,
  type Declaration,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useCallback, useEffect, useState } from 'react';
import { SessionCombatMap } from '../session-combat/SessionCombatMap';
import { ORGANIZED_HUD_FIXTURES, ORGANIZED_HUD_PRESENTATION } from './fixtures';
import './organizedHud.css';

const EMPTY: CombatExperiencePresentationState = {
  armedDeclarationId: null,
  selectedCandidateMember: null,
  changedOptionNotice: null,
};

/** Fixture-only composition: real CombatExperience + action organizer, no RPC writes. */
export function OrganizedHudConcept() {
  const [scenarioId, setScenarioId] = useState('full-slots');
  const [frame, setFrame] = useState<'pc' | 'phone'>('pc');
  const [state, setState] = useState<CombatExperiencePresentationState>(EMPTY);
  const [intent, setIntent] = useState(
    'No intent sent — fixture-only walkthrough.'
  );
  const preview =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === '1';
  const fixture =
    ORGANIZED_HUD_FIXTURES.find((item) => item.id === scenarioId) ??
    ORGANIZED_HUD_FIXTURES[0]!;
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
  const selectTarget = (member: string) => {
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

  return (
    <section
      className="organizedHudConcept"
      data-preview={preview}
      data-frame={frame}
      aria-labelledby="organized-hud-title"
    >
      <header>
        <div className="organizedHudTitle">
          <span>Concept #1054 · real shared shell</span>
          <h2 id="organized-hud-title">Organized HUD</h2>
          <p>{fixture.description}</p>
        </div>
        <details className="organizedHudControls" open={!preview}>
          <summary>Controls</summary>
          <div role="group" aria-label="Scenario controls">
            {ORGANIZED_HUD_FIXTURES.map((item) => (
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
          {!preview && (
            <a
              className="organizedHudPreviewLink"
              href="?concept=organized-hud&preview=1"
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
        className={`organizedHudFrame organizedHudFrame_${frame}`}
        data-testid="organized-hud-frame"
      >
        <CombatExperience
          layout="fill-parent"
          actionPresentation={{
            mode: 'organized-hud',
            ...ORGANIZED_HUD_PRESENTATION,
          }}
          viewerMember={fixture.viewerMember}
          viewerName={fixture.viewerName}
          viewerClassRefId={fixture.viewerClassRefId}
          memberNames={
            new Map(
              fixture.participants.map((participant) => [
                participant.member,
                participant.name,
              ])
            )
          }
          clock={fixture.clock}
          round={fixture.round}
          participants={fixture.participants}
          declarations={fixture.declarations}
          characterData={fixture.characterData}
          privateStatus="ready"
          authorityFresh={authorityFresh}
          presentationState={state}
          phase={state.armedDeclarationId ? 'targeting' : 'fresh'}
          showTurnNotice={false}
          logMode="story"
          streamState={fixture.streamState}
          story={fixture.story}
          debug={fixture.debug}
          diceEvents={[]}
          location={{ name: 'Reference Tomb', area: 'South reliquary' }}
          renderMap={({ attackableTargets, onTargetClick }) => (
            <SessionCombatMap
              attackableTargets={attackableTargets}
              onTargetClick={onTargetClick}
              interactionEnabled={!state.armedDeclarationId}
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
          onConfirmTargets={() =>
            setIntent(
              'Fixture-only targets confirmed; no RPC or rule execution was sent.'
            )
          }
          onEndTurn={(declaration) =>
            setIntent(
              `Fixture-only End Turn ${declaration.id}; no RPC or rule execution was sent.`
            )
          }
          onLogModeChange={() => {}}
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
