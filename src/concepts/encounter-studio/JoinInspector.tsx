import type { ReadBackConnection } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/authoring/v1alpha1/service_pb';
import type { RoomDraftDocument } from '../world-building/roomDraft';
import { connectionJump } from './engineReadBack';
import {
  barHeading,
  methodLabel,
  waySectionsOf,
  type PlaceJoin,
  type PlaceWay,
} from './placesView';
import { STALE_READ_BACK_SENTENCE } from './ReadBack';
import type { RefusalTarget } from './refusalJump';
import { StudioSection } from './StudioSection';

export interface JoinInspectorProps {
  join: PlaceJoin;
  document: Readonly<RoomDraftDocument>;
  /** False while the read-back is from an earlier draft. */
  current: boolean;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string): void;
}

/** The studio's own words on this screen: the headings. Every sentence is
 * the engine's. */
export const EVERY_BAR_SENTENCE =
  'Every bar must be passed: one way from each list below.';
export const NO_WAY_SENTENCE = 'The engine names no way through this join.';

/** A selected join (rpg-project#972): the engine's sentence for it, then
 * its ways under each bar they say they lift, then ways that lift no bar,
 * then what helps without being enough, then a bar nothing lifts. */
export function JoinInspector({
  join,
  document,
  current,
  onJump,
  onOpenFact,
}: JoinInspectorProps): React.JSX.Element {
  const sections = waySectionsOf(join);
  const wayList = (ways: readonly PlaceWay[]) => (
    <ul className="es-join-ways">
      {ways.map((way, index) => (
        <Way
          key={`${way.statement.about?.id ?? ''}:${index}`}
          way={way}
          document={document}
          onJump={onJump}
          onOpenFact={onOpenFact}
        />
      ))}
    </ul>
  );
  return (
    <section aria-label="Inspector" className="es-inspector es-join">
      <div className="es-inspector-title">
        <h2>Join</h2>
      </div>
      <div className="es-readback">
        {!current && (
          <p role="status" className="es-help es-readback-notice">
            {STALE_READ_BACK_SENTENCE}
          </p>
        )}
        <p className="es-join-sentence" data-kind={join.kind}>
          {join.statement.sentence}
        </p>
        {sections.bars.length >= 2 && (
          <p className="es-help">{EVERY_BAR_SENTENCE}</p>
        )}
        {join.ways.length === 0 && <p className="es-help">{NO_WAY_SENTENCE}</p>}
        {sections.bars.map(({ bar, ways }) => (
          <StudioSection key={bar} title={barHeading(bar)} level="subsection">
            {wayList(ways)}
          </StudioSection>
        ))}
        {sections.free.length > 0 && (
          <StudioSection title="Other ways" level="subsection">
            {wayList(sections.free)}
          </StudioSection>
        )}
        {sections.partial.length > 0 && (
          <StudioSection title="Helps, not enough alone" level="subsection">
            {wayList(sections.partial)}
          </StudioSection>
        )}
        {sections.none.length > 0 && (
          <StudioSection title="Nothing lifts" level="subsection">
            {wayList(sections.none)}
          </StudioSection>
        )}
      </div>
    </section>
  );
}

function Way({
  way,
  document,
  onJump,
  onOpenFact,
}: {
  way: PlaceWay;
  document: Readonly<RoomDraftDocument>;
  onJump?(target: RefusalTarget): void;
  onOpenFact?(id: string): void;
}): React.JSX.Element {
  const jumps = (label: string, connections: readonly ReadBackConnection[]) => {
    const seen = new Set<string>();
    const buttons: React.JSX.Element[] = [];
    for (const connection of connections) {
      const name = `${connection.kind} ${connection.id}`;
      if (seen.has(name)) continue;
      seen.add(name);
      const jump = connectionJump(connection, document);
      const go = !jump
        ? undefined
        : jump.kind === 'fact'
          ? onOpenFact && (() => onOpenFact(jump.id))
          : onJump && (() => onJump(jump.target));
      if (!go) continue;
      buttons.push(
        <button
          key={name}
          type="button"
          className="es-link es-readback-ref"
          data-ref-kind={connection.kind}
          aria-label={`Open ${name}`}
          onClick={go}
        >
          {name}
        </button>
      );
    }
    return buttons.length > 0 ? (
      <div className="es-readback-links" data-role={label}>
        <span className="es-help">{label}</span>
        {buttons}
      </div>
    ) : null;
  };
  return (
    <li className="es-join-way" data-way={way.kind}>
      <p>{way.statement.sentence}</p>
      {way.methods.length > 0 && (
        <ul className="es-way-methods" aria-label="Method">
          {way.methods.map((method) => (
            <li key={method.id}>{methodLabel(method)}</li>
          ))}
        </ul>
      )}
      {jumps('By', way.carriers)}
      {jumps('Needs', way.needs)}
      {jumps('On a miss', way.onMiss)}
    </li>
  );
}
