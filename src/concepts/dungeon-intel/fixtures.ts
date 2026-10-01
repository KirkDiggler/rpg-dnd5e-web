import { create } from '@bufbuild/protobuf';
import {
  GetAtlasResponseSchema,
  type GetAtlasResponse,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasPropSchema,
  DoorInfoSchema,
  DoorState,
  GridKind,
  HexLayout,
  MemberKind,
  PositionSchema,
  SightingSchema,
  Standing,
  type AtlasProp,
  type DoorInfo,
  type Position,
  type Sighting,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';

export type Observer = 'A' | 'B';
export type Observation = 'current' | 'remembered';

/** PROVISIONAL fixture answers, not proposed protobuf messages. The wire
 * carries placements and door values but not this mutable testimony envelope. */
export interface PropTestimony {
  readonly id: string;
  readonly name: string;
  readonly observation: Observation;
  /** Missing means location unknown, NOT that the subject ceased to exist. */
  readonly placement?: AtlasProp;
}
export interface DoorTestimony {
  readonly info: DoorInfo;
  readonly observation: Observation;
}
export interface ObserverSnapshot {
  readonly observer: Observer;
  readonly position: Position;
  /** Fixed discovered construction only. Mutable placements are separate. */
  readonly atlas: GetAtlasResponse;
  readonly sightings: Sighting[];
  readonly props: readonly PropTestimony[];
  readonly doors: readonly DoorTestimony[];
  /** Explicit positive observation, never inferred from a missing placement. */
  readonly observedEmpty: readonly Position[];
  readonly account: string;
}
export interface StoryboardStep {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly views: Readonly<Record<Observer, ObserverSnapshot>>;
}

export const ENTRY_DOOR = 'intel-fixture/entry';
export const FURTHER_DOOR = 'intel-fixture/further';
export const HEIRLOOM = 'heirloom-vase';
export const at = (x: number, y: number): Position =>
  create(PositionSchema, { x, y });

// Fixture construction helpers only: generate the cells the named answer
// supplies. No complete world, filters, discovery/LOS or memory engine.
function rectangle(first: number, last: number): Position[] {
  return Array.from({ length: last - first + 1 }, (_, column) =>
    Array.from({ length: 4 }, (_, row) => at(first + column, row))
  ).flat();
}
const room1Cells = rectangle(0, 4);
const room2Cells = rectangle(5, 10);
const room1Segments = [
  { from: { q: -0.5, r: -0.5 }, to: { q: 5.25, r: -0.5 }, height: 0.7 },
  { from: { q: -0.5, r: 3.5 }, to: { q: 3.25, r: 3.5 }, height: 0.7 },
  { from: { q: -0.5, r: -0.5 }, to: { q: -0.5, r: 3.5 }, height: 0.7 },
  // Entry wall: the door gap sits at the midpoint of cells (4,1)/(5,1).
  { from: { q: 5.25, r: -0.5 }, to: { q: 3.25, r: 3.5 }, height: 0.7 },
  // The corner A withdraws behind; no LOS computation uses these lines.
  { from: { q: 2, r: 2 }, to: { q: 3.5, r: 2 }, height: 0.7 },
  { from: { q: 3.5, r: 2 }, to: { q: 3.5, r: 3.5 }, height: 0.7 },
];
const room2Segments = [
  { from: { q: 5.25, r: -0.5 }, to: { q: 11.25, r: -0.5 }, height: 0.7 },
  { from: { q: 3.25, r: 3.5 }, to: { q: 9.25, r: 3.5 }, height: 0.7 },
  { from: { q: 11.25, r: -0.5 }, to: { q: 9.25, r: 3.5 }, height: 0.7 },
];
function geometry(includeObservedRoom2: boolean): GetAtlasResponse {
  return create(GetAtlasResponseSchema, {
    grid: GridKind.HEX,
    layout: HexLayout.POINTY_TOP,
    cells: includeObservedRoom2 ? [...room1Cells, ...room2Cells] : room1Cells,
    segments: includeObservedRoom2
      ? [...room1Segments, ...room2Segments]
      : room1Segments,
    props: [
      {
        id: 'bookcase',
        ref: 'dnd5e:props:bookcase',
        at: at(0, 2),
        facing: 'e',
      },
      ...(includeObservedRoom2
        ? [{ id: 'fixed-pillar', ref: 'dnd5e:props:pillar', at: at(7, 3) }]
        : []),
    ],
    doorways: [
      { connection: ENTRY_DOOR, from: at(4, 1), to: at(5, 1) },
      ...(includeObservedRoom2
        ? [{ connection: FURTHER_DOOR, from: at(10, 1), to: at(11, 1) }]
        : []),
    ],
    regions: [
      {
        id: 'room-1',
        name: 'Entrance',
        cells: room1Cells,
        archetype: 'crypt',
        lighting: { intensity: 0.75 },
      },
      ...(includeObservedRoom2
        ? [
            {
              id: 'room-2',
              name: 'Gallery',
              cells: room2Cells,
              archetype: 'crypt',
              lighting: { intensity: 0.75 },
            },
          ]
        : []),
    ],
    // No room-3 cells, regions, segments, props, exits or authored documents.
  });
}
const entrance = geometry(false);
const discoveredGallery = geometry(true);
const vase = create(AtlasPropSchema, {
  id: HEIRLOOM,
  ref: 'dnd5e:props:vase',
  at: at(8, 1),
});
function prop(observation: Observation): PropTestimony {
  return { id: HEIRLOOM, name: 'Heirloom vase', observation, placement: vase };
}
function door(
  id: string,
  state: DoorState,
  observation: Observation
): DoorTestimony {
  return { info: create(DoorInfoSchema, { door: id, state }), observation };
}
function guard(observation: Observation): Sighting {
  return create(SightingSchema, {
    subject: 'skeleton-1',
    name: 'Gallery sentinel',
    kind: MemberKind.MONSTER,
    channel: 'sight',
    status: observation === 'current' ? 'current' : 'remembered',
    currentVia: observation === 'current' ? ['sight'] : [],
    seen: { position: at(9, 2), standing: Standing.UP },
    stance: 'neutral',
  });
}
const closedEntrance = (observer: Observer): ObserverSnapshot => ({
  observer,
  position: observer === 'A' ? at(3, 1) : at(1, 3),
  atlas: entrance,
  sightings: [],
  props: [],
  doors: [
    door(
      ENTRY_DOOR,
      DoorState.CLOSED,
      observer === 'A' ? 'current' : 'remembered'
    ),
  ],
  observedEmpty: [],
  account:
    'Only the entrance and its closed door are known. No gallery layout or contents supplied.',
});
const aLooking: ObserverSnapshot = {
  observer: 'A',
  position: at(4, 1),
  atlas: discoveredGallery,
  sightings: [guard('current')],
  props: [prop('current')],
  doors: [
    door(ENTRY_DOOR, DoorState.OPEN, 'current'),
    door(FURTHER_DOOR, DoorState.CLOSED, 'current'),
  ],
  observedEmpty: [],
  account:
    'The gallery, fixed pillar, vase and sentinel are observed. The further door gives no interior beyond it.',
};
const bObstructed: ObserverSnapshot = {
  ...closedEntrance('B'),
  // Opening outside B's sight shares neither door values nor A's discovery.
  account:
    'The corner obstructs the doorway and gallery. The entry door is remembered closed; no gallery geometry or contents are supplied.',
};
const aWithdrawn: ObserverSnapshot = {
  ...aLooking,
  position: at(1, 3),
  sightings: [guard('remembered')],
  props: [prop('remembered')],
  doors: [
    door(ENTRY_DOOR, DoorState.OPEN, 'remembered'),
    door(FURTHER_DOOR, DoorState.CLOSED, 'remembered'),
  ],
  account:
    'Discovered construction remains. The vase, sentinel and door values are last observations, not live truth.',
};
const bLooking: ObserverSnapshot = {
  ...aLooking,
  observer: 'B',
  position: at(6, 1),
};
const unknownVase: PropTestimony = {
  id: HEIRLOOM,
  name: 'Heirloom vase',
  observation: 'remembered',
};
const bAfterChange: ObserverSnapshot = {
  ...bLooking,
  props: [unknownVase],
  observedEmpty: [at(8, 1)],
  doors: [
    door(ENTRY_DOOR, DoorState.CLOSED, 'current'),
    door(FURTHER_DOOR, DoorState.CLOSED, 'current'),
  ],
  account:
    'The former vase position is empty and the entrance door is now closed. No placement is supplied for the known vase.',
};
const bSeesReopenedEntry: ObserverSnapshot = {
  ...bAfterChange,
  doors: [
    door(ENTRY_DOOR, DoorState.OPEN, 'current'),
    door(FURTHER_DOOR, DoorState.CLOSED, 'current'),
  ],
  account:
    'The entrance door is observed open again. The former vase position remains empty; no world placement is supplied for the vase.',
};
const aReturns: ObserverSnapshot = {
  ...aLooking,
  props: [unknownVase],
  observedEmpty: [at(8, 1)],
  account:
    'The old position is observed empty. The vase remains known, its location is unknown; no carrier or destination is disclosed.',
};

/** These are explicit supplied answers, NOT transitions computed by the web.
 * Selecting any step (including backwards) replaces the answer wholesale. */
export const STEPS: readonly StoryboardStep[] = [
  {
    id: 'start',
    label: '1 · Closed door',
    description: 'Room 2 starts unknown to both observers.',
    views: { A: closedEntrance('A'), B: closedEntrance('B') },
  },
  {
    id: 'look',
    label: '2 · A looks inside',
    description:
      'A receives gallery geometry and observations. B remains obstructed.',
    views: { A: aLooking, B: bObstructed },
  },
  {
    id: 'withdraw',
    label: '3 · A withdraws',
    description:
      'Fixed geometry stays; mutable observations become remembered.',
    views: { A: aWithdrawn, B: bObstructed },
  },
  {
    id: 'b-look',
    label: '4 · B looks inside',
    description:
      'B gains an independent observation; A’s memory does not refresh.',
    views: { A: aWithdrawn, B: bLooking },
  },
  {
    id: 'unseen-change',
    label: '5 · Unseen changes',
    description:
      'Storyboard: B removes the vase and closes the entry door outside A’s sight.',
    views: { A: aWithdrawn, B: bAfterChange },
  },
  {
    id: 'return',
    label: '6 · A observes empty',
    description:
      'The entry is reopened; A looks again. Absence corrects placement without exposing a carrier.',
    views: { A: aReturns, B: bSeesReopenedEntry },
  },
];
