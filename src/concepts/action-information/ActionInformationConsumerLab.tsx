import type { Declaration } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useState, type CSSProperties } from 'react';
import { ActionDock } from '../../components/session/combat-experience/ActionDock';
import hudStyles from '../../components/session/combat-experience/CombatExperience.module.css';
import {
  actionInformationOffers,
  INFORMATION_CLOCK,
  INFORMATION_PARTICIPANTS,
} from './fixtures';

/** Real consumer components on generated fixtures; callbacks record intent only. */
export function ActionInformationConsumerLab() {
  const [desktop, setDesktop] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [longText, setLongText] = useState(false);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [option, setOption] = useState<string>();
  const [intents, setIntents] = useState(0);
  const [lastIntent, setLastIntent] = useState('None');
  const offers = actionInformationOffers(unavailable, longText);
  if (missing) {
    for (const offer of offers) {
      offer.information = undefined;
      for (const choice of offer.options) choice.description = '';
    }
  }
  const record = (text: string): void => {
    setIntents((count) => count + 1);
    setLastIntent(text);
  };
  const choose = (offer: Declaration): void => {
    setSelected(offer.id);
    setOption(offer.options.length ? offer.id : undefined);
    record(`Selected ${offer.id}`);
  };
  return (
    <section
      aria-label="Offer renderer fixture lab"
      style={{ margin: '1rem 0', color: '#dce5e6' }}
    >
      <h2>Real action dock · generated fixture data</h2>
      <p>
        No API commands. Hover/focus reads; buttons below record intent only.
      </p>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem',
          margin: '1rem 0',
        }}
      >
        <label>
          <input
            type="checkbox"
            checked={desktop}
            onChange={(event) => {
              setDesktop(event.target.checked);
              setOption(undefined);
            }}
          />{' '}
          Desktop renderer
        </label>
        <label>
          <input
            type="checkbox"
            checked={unavailable}
            onChange={(event) => setUnavailable(event.target.checked)}
          />{' '}
          Offers unavailable
        </label>
        <label>
          <input
            type="checkbox"
            checked={longText}
            onChange={(event) => setLongText(event.target.checked)}
          />{' '}
          Long provider text
        </label>
        <label>
          <input
            type="checkbox"
            checked={missing}
            onChange={(event) => setMissing(event.target.checked)}
          />{' '}
          Provider metadata absent
        </label>
      </div>
      <div
        data-testid="information-consumer-frame"
        className={hudStyles.combatExperience}
        data-action-presentation="organized-hud"
        style={
          {
            height: 'min(70vh, 600px)',
            minHeight: 260,
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-end',
            padding: 12,
            containerType: 'size',
            containerName: 'organized-hud',
            background: '#18232a',
            border: '1px solid #d6b57340',
            fontFamily: 'Inter, system-ui, sans-serif',
            '--sc-ink': '#eee9dd',
            '--sc-muted': '#aab9c0',
            '--sc-line': '#ffffff30',
            '--sc-gold-bright': '#f0d99f',
          } as CSSProperties
        }
      >
        <ActionDock
          clock={INFORMATION_CLOCK}
          participants={INFORMATION_PARTICIPANTS}
          viewerMember="viewer"
          declarations={offers}
          authorityFresh
          actionPresentation={{
            mode: 'organized-hud',
            desktopIcons: desktop ? {} : undefined,
            desktopSpellKindByDeclarationId: {
              'info-bane': 'leveled',
              'info-command': 'leveled',
            },
          }}
          armedDeclarationId={selected}
          optionDeclarationId={option}
          onSelectDeclaration={choose}
          onSelectCastOption={(id) => {
            record(`Option ${id}`);
            setOption(undefined);
          }}
          onCancelCastOption={() => setOption(undefined)}
          onCancelSelection={() => {
            setSelected(undefined);
            setOption(undefined);
          }}
          onEndTurn={() => record('End turn')}
        />
      </div>
      <p data-testid="information-intents">
        Recorded intents: {intents} · {lastIntent}
      </p>
    </section>
  );
}
