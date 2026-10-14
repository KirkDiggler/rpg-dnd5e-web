import type { ReactNode } from 'react';
import { PLAY_CONTRACT } from '../world-building/singleRoomDungeon';
import { selectionName } from './StudioArrangeFields';
import {
  StudioArrangePanel,
  type ArrangeComposition,
} from './StudioArrangePanel';
import { StudioDimensions } from './StudioDimensions';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
  LayoutTool,
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
  onMoveCreature(): void;
  onFrameChange(frame: LayoutFrame): void;
  onArmTool(tool: 'wall' | 'door' | 'label'): void;
  /** Open the Regions home on the region linked to this label. */
  onOpenRegion(labelId: string): void;
  /** Arm the party-start gesture; the next 3D floor click places it. */
  onPlacePartyStart(): void;
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
      <h2>{heading}</h2>
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
  }
}

/** The one-transaction form for the selected noun, without the Regions
 * home's heading. */
function Form({
  session,
  onConfigure,
  onMoveCreature,
  ...composition
}: Pick<StudioInspectorProps, 'session'> &
  Partial<Pick<StudioInspectorProps, 'onConfigure' | 'onMoveCreature'>> &
  ArrangeComposition): React.JSX.Element | null {
  return (
    <StudioArrangePanel
      session={session}
      expanded
      heading={false}
      onConfigure={onConfigure}
      onMoveCreature={onMoveCreature}
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
      <section aria-label="Room size">
        <h3>Size</h3>
        <StudioDimensions
          session={session}
          view={view}
          onFrameChange={onFrameChange}
        />
      </section>
      <section aria-label="Notes">
        <h3>Notes</h3>
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
      </section>
      <section aria-label="Party start">
        <h3>Party start</h3>
        <p>{start ? `Hex ${start.q}, ${start.r}` : 'Not placed'}</p>
        <button type="button" onClick={onPlacePartyStart}>
          {start ? 'Move party start' : 'Place party start'}
        </button>
      </section>
      <section aria-label="Room-default wall finishes">
        <h3>Room-default wall finishes</h3>
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
      </section>
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
        <p className="es-help">Model: {arrange.door.assetRef}</p>
      )}
      <Form session={session} />
    </>
  );
}

function CreatureView({
  session,
  onConfigure,
  onMoveCreature,
}: StudioInspectorProps): React.JSX.Element {
  return (
    <Form
      session={session}
      onConfigure={onConfigure}
      onMoveCreature={onMoveCreature}
    />
  );
}

function PropView({
  session,
  onConfigure,
}: StudioInspectorProps): React.JSX.Element {
  return <Form session={session} onConfigure={onConfigure} />;
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
          <section aria-label="Group members">
            <h3>Members</h3>
            <ul className="es-inspector-list">
              {members.map((member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    aria-label={`Select member ${member.label || member.id}`}
                    onClick={() => session.viewportProps.onSelect([member.id])}
                  >
                    {member.label || member.id}
                  </button>
                </li>
              ))}
            </ul>
          </section>
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
      <p>
        Cell q {arrange.cell.q}, r {arrange.cell.r}
      </p>
      <p>
        {arrange.walkable
          ? 'Walkable floor.'
          : 'Not walkable: no floor is painted here.'}
      </p>
      <section aria-label="Regions at this hex">
        <h3>Region</h3>
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
        <p className="es-help">
          A drawn region names this hex for authoring. It is not membership for
          a rule.
        </p>
      </section>
      <section aria-label="Play">
        <h3>Play</h3>
        <p>
          Void: {PLAY_CONTRACT.void} · Lighting: {PLAY_CONTRACT.lighting} ·
          Standing: {PLAY_CONTRACT.standing}
        </p>
        <p className="es-help">
          The encounter document accepts only these values. Editing them is a
          toolkit change.
        </p>
      </section>
    </div>
  );
}

function LabelView({
  session,
  arrange,
  onOpenRegion,
}: StudioInspectorProps & {
  arrange: StudioArrangeSelection;
}): React.JSX.Element {
  const region = arrange.kind === 'label' ? arrange.region : undefined;
  return (
    <>
      <Form session={session} regionControls={false} />
      {region && arrange.kind === 'label' && (
        <div className="es-context-panel">
          <p>
            This selection is a region. Its boundary and lighting settings live
            in Regions.
          </p>
          <button type="button" onClick={() => onOpenRegion(arrange.label.id)}>
            Edit region settings
          </button>
        </div>
      )}
    </>
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
          <span className="es-help">The next floor click in 3D places it.</span>
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
