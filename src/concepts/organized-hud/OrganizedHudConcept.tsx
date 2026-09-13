import { CombatExperience } from '@/components/session/combat-experience/CombatExperience';
import type { CombatExperiencePresentationState } from '@/components/session/combat-experience/types';
import { useState } from 'react';
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
  const fixture =
    ORGANIZED_HUD_FIXTURES.find((item) => item.id === scenarioId) ??
    ORGANIZED_HUD_FIXTURES[0]!;
  const authorityFresh = fixture.authorityFresh ?? true;
  const reset = (id: string) => {
    setScenarioId(id);
    setState(EMPTY);
    setIntent('No intent sent — fixture-only walkthrough.');
  };

  return (
    <section
      className="organizedHudConcept"
      aria-labelledby="organized-hud-title"
    >
      <header>
        <div>
          <span>Concept #1054 · real shared shell</span>
          <h2 id="organized-hud-title">Organized HUD</h2>
          <p>{fixture.description}</p>
        </div>
        <div className="organizedHudControls" aria-label="Concept controls">
          <div>
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
          <div>
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
        </div>
      </header>
      <p className="organizedHudIntent" role="status">
        {intent}
      </p>
      <div className={`organizedHudFrame organizedHudFrame_${frame}`}>
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
            />
          )}
          onSelectDeclaration={(declaration) => {
            setState({ ...EMPTY, armedDeclarationId: declaration.id });
            setIntent(
              `Fixture-only selected ${declaration.id}; no RPC or rule execution was sent.`
            );
          }}
          onTargetClick={(member) =>
            setIntent(
              `Fixture-only target ${member}; no RPC or rule execution was sent.`
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
    </section>
  );
}
