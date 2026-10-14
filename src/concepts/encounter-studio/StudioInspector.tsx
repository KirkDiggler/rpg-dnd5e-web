import type { ReactNode } from 'react';
import { selectionName } from './StudioArrangeFields';
import { StudioArrangePanel } from './StudioArrangePanel';
import { StudioDimensions } from './StudioDimensions';
import type {
  EncounterStudioSession,
  EncounterStudioView,
  LayoutFrame,
  LayoutTool,
  StudioInspection,
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
}

/** The Build home's only sidebar content: one view for the one selected
 * thing. Presentation over the session; it holds no document copy and no
 * selection store. */
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

function InspectorBody({
  session,
  inspection,
  view,
  onConfigure,
  onMoveCreature,
  onFrameChange,
  onOpenRegion,
}: StudioInspectorProps): React.JSX.Element {
  if (inspection.pick === null && inspection.selection.kind === 'nothing')
    return (
      <div className="es-context-panel">
        <StudioDimensions
          session={session}
          view={view}
          onFrameChange={onFrameChange}
        />
      </div>
    );
  if (inspection.selection.kind === 'hex' && session.arrange?.kind === 'hex')
    return (
      <p className="es-help">
        Hex {session.arrange.cell.q}, {session.arrange.cell.r}
      </p>
    );
  if (session.arrange?.kind === 'label' && session.arrange.region) {
    const labelId = session.arrange.label.id;
    return (
      <div className="es-context-panel">
        <p>
          This selection is a region. Its boundary and lighting settings live in
          Regions.
        </p>
        <button type="button" onClick={() => onOpenRegion(labelId)}>
          Edit region settings
        </button>
      </div>
    );
  }
  return (
    <StudioArrangePanel
      session={session}
      expanded
      onConfigure={onConfigure}
      onMoveCreature={onMoveCreature}
    />
  );
}
