/**
 * WATCH A RUN, DRAWN (rpg-project#1004): every member the run's record has,
 * at the cell the record last put it on, with its machine's state as a
 * small label. The cells and states are `foldRun`'s, read from the record;
 * nothing here decides where anyone is. A creature out of the player's
 * sight is drawn too: this is the unfiltered dev-mode record.
 *
 * Glyphs are world-space, labels screen-sized, as `LayoutPlacedOverlay`
 * draws the authored starts. A glyph carries `data-run-member`; the
 * viewport's watching click reads it to select the member.
 *
 * STEPS (rpg-project#1006): at the live step, the six cells next to the
 * seat are drawn as steps (`data-run-step`), under the members, so a click
 * on a creature in one of them selects the creature. Each is a focusable
 * button ("Step to q, r") that Enter or Space also takes. The step only
 * asks the server; the seat's glyph moves when the record says it did.
 */
import { axialNeighbors } from '@/author/hexOffset';
import {
  layoutCellCenter,
  layoutCellCorners,
  worldToClient,
  type LayoutTransform,
} from './layoutGeometry';
import type { RunMember } from './runView';
import type { LayoutSteps } from './studioSession';

const RING = 0.55;

export function LayoutRunOverlay({
  members,
  names,
  selectedId,
  steps,
  transform,
  worldTransform,
}: {
  members: readonly RunMember[];
  /** Display names by member id; the id when absent. */
  names?: ReadonlyMap<string, string>;
  selectedId: string | null;
  steps?: LayoutSteps;
  transform: LayoutTransform;
  worldTransform?: string;
}): React.JSX.Element {
  const placed = members.filter((m) => m.cell !== null);
  return (
    <>
      <g
        className="es-layout-run"
        transform={worldTransform}
        aria-label="The run"
        data-testid="run-overlay"
      >
        {steps && (
          <g
            className="es-layout-run-steps"
            aria-label="Steps you can take"
            data-busy={steps.busy || undefined}
          >
            {axialNeighbors(steps.from).map((cell) => {
              const name = `Step to ${cell.q}, ${cell.r}`;
              const take = (): void => {
                if (!steps.busy) steps.onStep(cell);
              };
              return (
                <g
                  key={`${cell.q},${cell.r}`}
                  data-run-step={`${cell.q},${cell.r}`}
                  data-step-q={cell.q}
                  data-step-r={cell.r}
                  role="button"
                  tabIndex={0}
                  aria-label={name}
                  aria-disabled={steps.busy || undefined}
                  style={{ cursor: steps.busy ? 'progress' : 'pointer' }}
                  onKeyDown={(event): void => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    take();
                  }}
                >
                  <title>{name}</title>
                  <polygon
                    points={layoutCellCorners(cell)
                      .map((p) => `${p.x},${p.z}`)
                      .join(' ')}
                    fill="#2dd4bf"
                    fillOpacity={steps.busy ? 0.06 : 0.14}
                    stroke="#2dd4bf"
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}
          </g>
        )}
        {placed.map((member) => {
          const centre = layoutCellCenter(member.cell!);
          const selected = member.id === selectedId;
          return (
            <g
              key={member.id}
              data-run-member={member.id}
              data-run-cell={`${member.cell!.q},${member.cell!.r}`}
              data-run-state={member.state}
              data-selected={selected || undefined}
              style={{ cursor: 'pointer' }}
            >
              <title>
                {`${names?.get(member.id) ?? member.id}${member.state ? `: ${member.state}` : ''}`}
              </title>
              <circle
                cx={centre.x}
                cy={centre.z}
                r={RING}
                fill={member.party ? '#2dd4bf' : '#f97316'}
                fillOpacity={0.55}
                stroke={selected ? '#ffffff' : '#101923'}
                strokeWidth={selected ? 3 : 1.5}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </g>
      <g className="es-layout-run-labels" pointerEvents="none">
        {placed.map((member) => {
          const point = worldToClient(
            layoutCellCenter(member.cell!),
            transform
          );
          if (!point) return null;
          const x = point.x - transform.bounds.left;
          const y = point.y - transform.bounds.top;
          return (
            <text
              key={member.id}
              data-run-label={member.id}
              x={x}
              y={y + RING * transform.scale + 10}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              fill={member.party ? '#a7ffeb' : '#fed7aa'}
              stroke="#101923"
              strokeWidth={3}
              paintOrder="stroke"
              style={{ userSelect: 'none' }}
            >
              {names?.get(member.id) ?? member.id}
              {member.state && (
                <tspan
                  data-run-state-label=""
                  x={x}
                  dy={13}
                  fontWeight={400}
                  fill="#fde68a"
                >
                  {member.state}
                </tspan>
              )}
            </text>
          );
        })}
      </g>
    </>
  );
}
