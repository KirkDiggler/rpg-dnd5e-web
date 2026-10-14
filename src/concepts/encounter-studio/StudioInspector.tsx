import { useState, type ReactNode } from 'react';
import {
  castMemberOf,
  castOf,
  rulebookMonsterName,
  statBlockIsKnown,
  type CastMember,
} from '../world-building/cast';
import { concealmentHiding } from '../world-building/concealmentEdits';
import {
  addDoorApproach,
  doorBindingState,
  patchDoorApproach,
  removeDoorApproach,
  setDoorBindingState,
  type DoorBindingState,
} from '../world-building/doorBindingEdits';
import { exitAt, setExitAt } from '../world-building/exitEdits';
import type { ReadBackTarget } from '../world-building/readBack';
import { PLAY_CONTRACT } from '../world-building/singleRoomDungeon';
import { CopyId } from './CopyId';
import { FieldHelp } from './FieldHelp';
import { ReadBack } from './ReadBack';
import { selectionName } from './StudioArrangeFields';
import {
  StudioArrangePanel,
  type ArrangeComposition,
} from './StudioArrangePanel';
import { CastMemberForm } from './StudioCast';
import { StudioCheckRows } from './StudioCheckRows';
import { StudioDimensions } from './StudioDimensions';
import { StudioRegionFinishes } from './StudioRegionFinishes';
import { StudioSection } from './StudioSection';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
  LayoutTool,
  RoomHexCell,
  StudioArrangeSelection,
  StudioInspection,
  StudioSelection,
  StudioSocialSection,
} from './studioSession';

export interface StudioInspectorProps {
  session: EncounterStudioSession;
  /** studioInspectionOf(session.arrange, scene): derived, never stored. */
  inspection: StudioInspection;
  view: EncounterStudioView;
  layoutTool: LayoutTool;
  /** The armed Wall, Door or Note tool's options; transient, not document. */
  armedTool: ReactNode | null;
  onConfigure(section: StudioSocialSection): void;
  /** Open the Facts section on one fact, from a read-back ref. */
  onOpenFact?(fact: string): void;
  onMoveCreature(): void;
  onFrameChange(frame: LayoutFrame): void;
  onArmTool(tool: 'wall' | 'door' | 'label'): void;
  /** Select the region's label: its label view holds the region. */
  onOpenRegion(labelId: string): void;
  /** Arm the region tool in Layout for the selected region label. Absent
   * outside Layout. */
  onDefineRegion?(): void;
  /** Arm the party-start gesture; the next 3D floor click places it. */
  onPlacePartyStart(): void;
  /** Open one cast member, by its monster ref (rpg-project#575). */
  onOpenCastMember?(ref: string): void;
  /** Select one placement from a cast member's list. */
  onShowPlacement?(id: string): void;
}

/** The Build home's only sidebar content: one view for the one selected
 * thing. Presentation over the session; it holds no document copy and no
 * selection store. A view shows only its own selection's fields: a
 * faction's table, a table's rows and intel records are edited on the
 * Encounter home, reached by link. */
export function StudioInspector(
  props: StudioInspectorProps
): React.JSX.Element {
  const { session, inspection, armedTool } = props;
  const heading =
    inspection.pick !== null
      ? `${inspection.pick.length} props picked`
      : inspection.selection.kind === 'nothing' || !session.arrange
        ? 'Room'
        : selectionName(session.arrange, session);
  return (
    <section aria-label="Inspector" className="es-inspector">
      {armedTool && <div className="es-inspector-tool">{armedTool}</div>}
      <div className="es-inspector-title">
        <h2>{heading}</h2>
        {inspection.pick === null &&
          inspection.selection.kind === 'creature' &&
          session.arrange?.kind === 'actor' && (
            <CopyId id={session.arrange.monster.id} label="placement" />
          )}
      </div>
      <InspectorBody {...props} />
    </section>
  );
}

function InspectorBody(props: StudioInspectorProps): React.JSX.Element {
  const { session, inspection } = props;
  const arrange = session.arrange;
  if (inspection.pick !== null) return <PickStrip {...props} />;
  const selection = inspection.selection;
  if (selection.kind === 'nothing' || !arrange) return <RoomView {...props} />;
  switch (selection.kind) {
    case 'wall':
      return <WallView {...props} />;
    case 'door':
      return <DoorView {...props} arrange={arrange} />;
    case 'creature':
      return <CreatureView {...props} />;
    case 'prop':
      return <PropView {...props} />;
    case 'group':
      return <GroupView {...props} selection={selection} />;
    case 'hex':
      return <HexView {...props} arrange={arrange} />;
    case 'label':
      return <LabelView {...props} arrange={arrange} />;
    case 'partyStart':
      return <PartyStartView {...props} />;
    case 'castMember':
      return <CastMemberView {...props} />;
  }
}

/** A selected cast member: its form, as on the Encounter home. Its
 * placements are highlighted on the map; it is one thing, not a set. */
function CastMemberView({
  session,
  onShowPlacement,
}: StudioInspectorProps): React.JSX.Element | null {
  const arrange = session.arrange;
  if (arrange?.kind !== 'cast') return null;
  return (
    <div className="es-context-panel es-creature-panel">
      <CastMemberForm
        key={arrange.member.ref}
        session={session}
        member={arrange.member}
        onShowPlacement={(id) =>
          onShowPlacement ? onShowPlacement(id) : session.creatures.select(id)
        }
      />
    </div>
  );
}

/** The one-transaction form for the selected noun, under the inspector's
 * own heading. */
function Form({
  session,
  onConfigure,
  onMoveCreature,
  onDefineRegion,
  ...composition
}: Pick<StudioInspectorProps, 'session'> &
  Partial<
    Pick<
      StudioInspectorProps,
      'onConfigure' | 'onMoveCreature' | 'onDefineRegion'
    >
  > &
  ArrangeComposition): React.JSX.Element | null {
  return (
    <StudioArrangePanel
      session={session}
      expanded
      heading={false}
      onConfigure={onConfigure}
      onMoveCreature={onMoveCreature}
      onDefineRegion={onDefineRegion}
      {...composition}
    />
  );
}

function RoomView({
  session,
  view,
  onFrameChange,
  onArmTool,
  onOpenRegion,
  onPlacePartyStart,
}: StudioInspectorProps): React.JSX.Element {
  const draft = session.document.draft;
  const regions = draft.scene.authoringRegions ?? [];
  const regionLabels = new Set(regions.map((region) => region.labelId));
  const labelText = (id: string): string =>
    draft.scene.mapLabels?.find((label) => label.id === id)?.text ?? id;
  const notes = (draft.scene.mapLabels ?? []).filter(
    (label) => !regionLabels.has(label.id)
  );
  const materials = session.regionEditing.finishes?.catalog.catalog?.materials;
  const finishes = regions.filter((region) => region.wallFinish);
  const start = draft.room.partyStart;
  return (
    <div className="es-context-panel es-room-view">
      <StudioSection title="Size" level="section">
        <StudioDimensions
          session={session}
          view={view}
          onFrameChange={onFrameChange}
        />
      </StudioSection>
      <StudioSection title="Notes" level="section">
        {notes.length ? (
          <ul className="es-inspector-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  aria-label={`Select note ${note.text}`}
                  onClick={() => session.mapLabelSelection.select(note.id)}
                >
                  {note.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="es-help">No notes yet.</p>
        )}
        {view === 'layout' ? (
          <button type="button" onClick={() => onArmTool('label')}>
            Add a note
          </button>
        ) : (
          <p className="es-help">Switch to Layout to add notes.</p>
        )}
      </StudioSection>
      <StudioSection title="Party start" level="section">
        <p>{start ? `Hex ${start.q}, ${start.r}` : 'Not placed'}</p>
        <button type="button" onClick={onPlacePartyStart}>
          {start ? 'Move party start' : 'Place party start'}
        </button>
      </StudioSection>
      <StudioSection title="Room-default wall finishes" level="section">
        {finishes.length ? (
          <ul className="es-inspector-list">
            {finishes.map((region) => {
              const ref = region.wallFinish!.materialRef;
              const name =
                materials?.find((material) => material.ref === ref)
                  ?.displayName ?? ref;
              const text = labelText(region.labelId);
              return (
                <li key={region.id}>
                  <span>
                    {text}: {name}
                  </span>{' '}
                  <button
                    type="button"
                    onClick={() => onOpenRegion(region.labelId)}
                  >
                    Edit region {text}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="es-help">No region sets a room-default wall finish.</p>
        )}
      </StudioSection>
    </div>
  );
}

function WallView({
  session,
  onArmTool,
}: StudioInspectorProps): React.JSX.Element {
  return (
    <Form
      session={session}
      extras={
        <div className="es-buttons">
          <button type="button" onClick={() => onArmTool('door')}>
            Place a door
          </button>
        </div>
      }
    />
  );
}

function DoorView({
  session,
  arrange,
}: StudioInspectorProps & {
  arrange: StudioArrangeSelection;
}): React.JSX.Element {
  return (
    <>
      {arrange.kind === 'door' && (
        <div className="es-context-panel es-door-view">
          <p className="es-help">Model: {arrange.door.assetRef}</p>
          <DoorState session={session} doorId={arrange.door.id} />
        </div>
      )}
      <Form session={session} />
    </>
  );
}

const DOOR_STATES: ReadonlyArray<{ value: DoorBindingState; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
  { value: 'locked', label: 'Locked' },
];

/** A wall door's state, its lock and the concealment that hides it
 * (rpg-project#578, H1, H2). Each pick applies at once; the fields are
 * `doorBindingEdits`' and `concealmentEdits`'. */
function DoorState({
  session,
  doorId,
}: {
  session: EncounterStudioSession;
  doorId: string;
}): React.JSX.Element {
  const binding = session.document.draft.room.doorBindings?.[doorId];
  const state = doorBindingState(binding);
  const rows = binding?.locked ?? [];
  const concealments = Object.keys(session.document.scope.concealments ?? {});
  const hiddenBy = concealmentHiding(session.document.scope, doorId);
  return (
    <StudioSection title="Door" level="section">
      <label className="es-field">
        <span>State</span>
        <select
          aria-label="Door state"
          value={state === 'none' ? '' : state}
          onChange={(event) =>
            session.doors.setBinding(
              doorId,
              setDoorBindingState(
                binding,
                event.target.value as DoorBindingState
              )
            )
          }
        >
          {state === 'none' && (
            <option value="" disabled>
              No state
            </option>
          )}
          {DOOR_STATES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {state === 'locked' && (
        <StudioSection title="Lock" level="subsection">
          <p className="es-help">
            Any one of these beats the lock. A locked door is shut.{' '}
            <FieldHelp field="Lock">
              Removing the last check leaves the door closed and unlocked.
            </FieldHelp>
          </p>
          <StudioCheckRows
            owner="the lock"
            rows={rows}
            onPatch={(index, patch) =>
              session.doors.setBinding(
                doorId,
                patchDoorApproach(binding, index, patch)
              )
            }
            onRemove={(index) =>
              session.doors.setBinding(
                doorId,
                rows.length <= 1
                  ? setDoorBindingState(binding, 'closed')
                  : removeDoorApproach(binding, index)
              )
            }
            onAdd={() =>
              session.doors.setBinding(doorId, addDoorApproach(binding))
            }
          />
        </StudioSection>
      )}
      <label className="es-field">
        <span>
          Hidden by{' '}
          <FieldHelp field="Hidden by">
            Hiding a door hides only the door. Its wall and the floor stay in
            view.
          </FieldHelp>
        </span>
        <select
          aria-label="Hidden by"
          value={hiddenBy ?? ''}
          onChange={(event) =>
            session.concealments.setDoorHiddenBy(
              doorId,
              event.target.value || null
            )
          }
        >
          <option value="">Not hidden</option>
          {concealments.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </label>
      {concealments.length === 0 && (
        <p className="es-help">
          Add a concealment in Encounter, Concealments to hide this door.
        </p>
      )}
    </StudioSection>
  );
}

/** What a read-back ref opens: a definition on the Encounter home, or the
 * placement it names. */
function readBackRefHandler(
  session: EncounterStudioSession,
  onConfigure: StudioInspectorProps['onConfigure'],
  onOpenFact: StudioInspectorProps['onOpenFact']
): (target: ReadBackTarget) => void {
  return (target) => {
    if (target.kind === 'placement') session.creatures.select(target.id);
    else if (target.kind === 'table') onConfigure('tables');
    else if (target.kind === 'faction') onConfigure('factions');
    else if (target.kind === 'intel') onConfigure('intel');
    else if (onOpenFact) onOpenFact(target.id);
    else onConfigure('facts');
  };
}

function CreatureView({
  session,
  onConfigure,
  onOpenFact,
  onMoveCreature,
  onOpenCastMember,
}: StudioInspectorProps): React.JSX.Element {
  const arrange = session.arrange;
  return (
    <>
      {arrange?.kind === 'actor' && (
        <ReadBack
          document={session.document}
          selection={{ kind: 'creature', id: arrange.monster.id }}
          onRef={readBackRefHandler(session, onConfigure, onOpenFact)}
        />
      )}
      <Form
        session={session}
        onConfigure={onConfigure}
        onMoveCreature={onMoveCreature}
        lead={
          <CreatureCast session={session} onOpenCastMember={onOpenCastMember} />
        }
      />
    </>
  );
}

/** The stat block this placement follows, as one line of its authored
 * fields. Derived numbers are the rulebook's and are not shown. */
function statBlockSummary(member: CastMember): string {
  const template = member.template;
  if (!template) return `the rulebook's ${member.id}`;
  const parts = [`base ${rulebookMonsterName(template.base)}`];
  if (template.armor) parts.push(`armor ${template.armor}`);
  if (template.hitDice) parts.push(`hit dice ${template.hitDice}`);
  for (const [key, score] of Object.entries(template.abilities ?? {}))
    parts.push(`${key.toUpperCase()} ${score}`);
  if (template.actions?.length)
    parts.push(`weapons ${template.actions.join(', ')}`);
  return parts.join(' · ');
}

/** Which cast member a placement belongs to, and which of its values were
 * stamped at placement. The stat block is followed by id; the look and the
 * faction are this placement's own. */
function CreatureCast({
  session,
  onOpenCastMember,
}: Pick<
  StudioInspectorProps,
  'session' | 'onOpenCastMember'
>): React.JSX.Element | null {
  const arrange = session.arrange;
  const [reassign, setReassign] = useState('');
  if (arrange?.kind !== 'actor') return null;
  const { monster } = arrange;
  const document = session.document;
  if (!statBlockIsKnown(document, monster.ref)) {
    const choices = castOf(document).filter((member) =>
      statBlockIsKnown(document, member.ref)
    );
    return (
      <section aria-label="Cast member" className="es-cast-summary">
        <p role="alert" className="es-warning">
          This placement&apos;s stat block, {monster.ref}, is not in the cast.
        </p>
        <label>
          Cast member
          <select
            aria-label="Reassign to cast member"
            value={reassign}
            onChange={(event) => setReassign(event.target.value)}
          >
            <option value="" disabled>
              Choose a cast member
            </option>
            {choices.map((member) => (
              <option key={member.ref} value={member.ref}>
                {member.name} · {member.id}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={!reassign}
          onClick={() => session.creatures.setDefinition(monster.id, reassign)}
        >
          Reassign
        </button>
        <p className="es-help">
          The local draft still saves. Save &amp; Play reports the
          rulebook&apos;s refusal if the stat block resolves to nothing.
        </p>
      </section>
    );
  }
  const member = castMemberOf(document, monster.ref);
  if (!member) return null;
  const faction = document.draft.room.monsterBindings?.[monster.id]?.faction;
  const look = monster.appearanceRef;
  const defaultLook = member.defaults?.modelRef;
  return (
    <section aria-label="Cast member" className="es-cast-summary">
      <dl className="es-facts">
        <div>
          <dt>
            Cast member{' '}
            <FieldHelp field="Cast member">
              Changes to {member.name} reach every placement.
            </FieldHelp>
          </dt>
          <dd>
            <button
              type="button"
              className="es-link"
              aria-label={`Open cast member ${member.name}`}
              onClick={() => onOpenCastMember?.(member.ref)}
            >
              {member.name}
            </button>{' '}
            ·{' '}
            {member.source === 'template'
              ? `stat block ${member.id}`
              : `rulebook ${member.id}`}
          </dd>
        </div>
        <div>
          <dt>Stat block</dt>
          <dd>{statBlockSummary(member)}</dd>
        </div>
        <div>
          <dt>Look</dt>
          <dd>
            {!look
              ? 'Rules default appearance'
              : look === defaultLook
                ? "Cast member's default"
                : 'Stamped at placement'}
          </dd>
        </div>
        <div>
          <dt>
            Faction{' '}
            <FieldHelp field="Faction">
              Stamped at placement. Changing {member.name}&apos;s default
              faction does not change this.
            </FieldHelp>
          </dt>
          <dd>{faction ?? 'none'}</dd>
        </div>
      </dl>
    </section>
  );
}

function PropView({
  session,
  onConfigure,
  onOpenFact,
  inspection,
}: StudioInspectorProps): React.JSX.Element {
  const selection = inspection.selection;
  return (
    <>
      {selection.kind === 'prop' && (
        <ReadBack
          document={session.document}
          selection={{ kind: 'prop', id: selection.id }}
          onRef={readBackRefHandler(session, onConfigure, onOpenFact)}
        />
      )}
      <Form session={session} onConfigure={onConfigure} />
    </>
  );
}

function GroupView({
  session,
  selection,
}: StudioInspectorProps & {
  selection: Extract<StudioSelection, { kind: 'group' }>;
}): React.JSX.Element {
  const scene = session.document.draft.scene;
  const members = [...scene.items, ...scene.groups].filter(
    (entity) => entity.parentId === selection.id
  );
  return (
    <Form
      session={session}
      configuration={false}
      extras={
        <>
          <StudioSection title="Members" level="subsection">
            <ul className="es-inspector-list">
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    aria-label={`Select member ${member.label || member.id}`}
                    onClick={() => session.selectScene([member.id])}
                  >
                    {member.label || member.id}
                  </button>
                </li>
              ))}
            </ul>
          </StudioSection>
          {session.propControls.groupActions}
          {session.propControls.arrangeExtras}
        </>
      }
    />
  );
}

function HexView({
  session,
  arrange,
  onOpenRegion,
}: StudioInspectorProps & {
  arrange: StudioArrangeSelection;
}): React.JSX.Element | null {
  if (arrange.kind !== 'hex') return null;
  const labels = session.document.draft.scene.mapLabels ?? [];
  const labelText = (id: string): string =>
    labels.find((label) => label.id === id)?.text ?? id;
  return (
    <div className="es-context-panel es-hex-view">
      <StudioSection
        title="Cell"
        level="section"
        about={
          <>
            <p>
              A drawn region names this hex for authoring. It is not membership
              for a rule.
            </p>
            <p>
              The play values are the only ones the encounter document accepts.
              Editing them is a toolkit change.
            </p>
          </>
        }
      >
        <p>
          Cell q {arrange.cell.q}, r {arrange.cell.r}
        </p>
        <p>
          {arrange.walkable
            ? 'Walkable floor.'
            : 'Not walkable: no floor is painted here.'}
        </p>
        <StudioSection title="Region" level="subsection">
          {arrange.regions.length ? (
            <ul className="es-inspector-list">
              {arrange.regions.map((region) => {
                const text = labelText(region.labelId);
                return (
                  <li key={region.id}>
                    <span>
                      {text} · Lighting:{' '}
                      {region.lighting
                        ? `background ${Math.round(region.lighting.background * 100)}%`
                        : 'baseline'}
                    </span>{' '}
                    <button
                      type="button"
                      onClick={() => onOpenRegion(region.labelId)}
                    >
                      Edit region {text}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="es-help">No region is drawn here.</p>
          )}
        </StudioSection>
        <HexExit
          key={`${arrange.cell.q},${arrange.cell.r}`}
          session={session}
          cell={arrange.cell}
          walkable={arrange.walkable}
        />
        <StudioSection title="Play" level="subsection">
          <p>
            Void: {PLAY_CONTRACT.void} · Lighting: {PLAY_CONTRACT.lighting} ·
            Standing: {PLAY_CONTRACT.standing}
          </p>
        </StudioSection>
      </StudioSection>
    </div>
  );
}

/** The hex's exit (rpg-project#578, H3): add one with an id, rename it,
 * remove it. Offered on walkable floor only; whether the hex is standable
 * is the toolkit's call when the encounter is played (S4-Q6). */
function HexExit({
  session,
  cell,
  walkable,
}: {
  session: EncounterStudioSession;
  cell: RoomHexCell;
  walkable: boolean;
}): React.JSX.Element {
  const exit = exitAt(session.document.scope.exits, cell);
  const [editing, setEditing] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const close = (): void => {
    setEditing(null);
    setRefusal(null);
  };
  const apply = (): void => {
    if (editing === null) return;
    const id = editing.trim();
    try {
      setExitAt(session.document.scope.exits, cell, id);
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : String(error));
      return;
    }
    if (session.exits.set(cell, id)) close();
    else setRefusal('The exit was refused; the notice says why.');
  };
  return (
    <StudioSection title="Exit" level="subsection">
      <p className="es-help">
        {exit ? `Exit ${exit.id}` : 'No exit here.'}{' '}
        <FieldHelp field="Exit">
          An exit under a blocking prop is refused when the encounter is played.
        </FieldHelp>
      </p>
      {editing !== null ? (
        <form
          className="es-buttons"
          aria-label={exit ? 'Rename exit' : 'Add exit'}
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="es-field">
            <span>Exit id</span>
            <input
              aria-label="Exit id"
              value={editing}
              autoFocus
              onChange={(event) => {
                setEditing(event.target.value);
                setRefusal(null);
              }}
            />
          </label>
          <button type="submit">{exit ? 'Apply rename' : 'Apply exit'}</button>
          <button type="button" onClick={close}>
            Cancel
          </button>
          {refusal && (
            <p role="alert" className="es-warning">
              {refusal}
            </p>
          )}
        </form>
      ) : exit ? (
        <div className="es-buttons">
          <button type="button" onClick={() => setEditing(exit.id)}>
            Rename exit
          </button>
          <button type="button" onClick={() => session.exits.set(cell, null)}>
            Remove exit
          </button>
        </div>
      ) : walkable ? (
        <div className="es-buttons">
          <button type="button" onClick={() => setEditing('')}>
            Add exit
          </button>
        </div>
      ) : (
        <p className="es-help">An exit needs walkable floor.</p>
      )}
    </StudioSection>
  );
}

/** A map label. A region's label also holds the region: boundary mode
 * with Use enclosing walls, Define explicit area, Clear explicit area,
 * background light, the room wall finish and Remove region. */
function LabelView({
  session,
  arrange,
  onDefineRegion,
}: StudioInspectorProps & {
  arrange: StudioArrangeSelection;
}): React.JSX.Element {
  const region = arrange.kind === 'label' ? arrange.region : undefined;
  if (!region) return <Form session={session} regionControls={false} />;
  return (
    <Form
      session={session}
      sectionTitle="Region"
      onDefineRegion={onDefineRegion}
      extras={
        <>
          {region.boundary.kind === 'explicit' && (
            <div className="es-buttons">
              <button
                type="button"
                onClick={() =>
                  session.regionEditing.setExplicitRegionArea(region.id, [])
                }
              >
                Clear explicit area
              </button>
            </div>
          )}
          <StudioRegionFinishes region={region} session={session} />
        </>
      }
    />
  );
}

function PartyStartView({
  session,
  onPlacePartyStart,
}: StudioInspectorProps): React.JSX.Element {
  return (
    <Form
      session={session}
      extras={
        <div className="es-buttons">
          <button type="button" onClick={onPlacePartyStart}>
            Move party start
          </button>
          <FieldHelp field="Move party start">
            The next floor click in 3D places it.
          </FieldHelp>
        </div>
      }
    />
  );
}

/** Two or more scene roots picked for Group selection: a pick, not a
 * selection, so no room view shows under it. */
function PickStrip({ session }: StudioInspectorProps): React.JSX.Element {
  return (
    <Form
      session={session}
      configuration={false}
      extras={
        <>
          {session.propControls.groupActions}
          {session.propControls.arrangeExtras}
        </>
      }
    />
  );
}
