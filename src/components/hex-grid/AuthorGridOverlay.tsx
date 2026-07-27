/**
 * AuthorGridOverlay — `?authorGrid=1` dev-only authoring bridge: renders
 * every revealed floor hex's room-local [col,row] label (the exact
 * `place: {at: [col,row]}` coordinates dungeon-content YAML consumes)
 * plus each room's id, so Kirk can walk a room and dictate placements
 * without hand-deriving coordinates. All geometry comes from
 * authorGridHelpers.ts (pure, unit-tested) — this component only renders
 * it.
 *
 * Mounted via HexGrid's own `children` slot (EncounterMap.tsx passes it
 * conditionally, the same way `?perfProbe` mounts DevPerfProbe) — the
 * dial-off case is "don't render this element at all," not an internal
 * early-return, so there's zero cost (no extra hex scan, no mounted
 * Billboard/Text instances) when the dial is off.
 *
 * Billboarded (drei's `<Billboard>`) rather than flat-on-floor: the
 * camera's isometric angle (CAMERA_OFFSET, calibrationConstants.ts) is
 * fixed but oblique, so floor-plane text would read foreshortened/
 * skewed at exactly the angle Kirk needs to read it from — legibility
 * over "looks painted on," matching this component's whole reason to
 * exist. `frameloop="demand"` (HexGrid's Canvas) makes Billboard's
 * per-frame orientation update cheap regardless: it only recomputes on
 * frames the Canvas actually renders, same as every other per-frame
 * hook in this codebase (see ClassCharacterModel.tsx's identical note).
 */

import type { ConnectorDoorInput, RegionInput } from '@/hooks/wallRuns';
import { Billboard, Text } from '@react-three/drei';
import { authorGridRooms } from './authorGridHelpers';

export interface AuthorGridOverlayProps {
  regions: RegionInput[];
  doors: ConnectorDoorInput[];
  hexSize: number;
}

// SyntyHexFloor renders its floor mesh at FLOOR_Y = 0.2 (SyntyHexFloor.tsx)
// — a label below that sits UNDER the floor surface and never renders.
// 0.25 clears both that and ShadedHexFloor's y=0 fallback plane with a
// small, deliberate margin rather than sitting exactly on the surface.
const LABEL_HEIGHT = 0.25;
const ROOM_ID_HEIGHT = 0.7; // above head height so it reads as "the room", not "a hex"
const LABEL_FONT_SIZE = 0.22;
const ROOM_ID_FONT_SIZE = 0.34;
const LABEL_COLOR = '#e8ecff';
const DOOR_ROW_COLOR = '#ffb347'; // dimmer/warmer, not alarming — a hint, not an error
const ROOM_ID_COLOR = '#7fd9ff';
const OUTLINE_COLOR = '#000000';

export function AuthorGridOverlay({
  regions,
  doors,
  hexSize,
}: AuthorGridOverlayProps) {
  const rooms = authorGridRooms(regions, doors, hexSize);
  return (
    <group name="author-grid-overlay">
      {rooms.map((room) => (
        <group key={room.regionId}>
          {room.labels.map((label) => (
            <Billboard
              key={label.key}
              position={[label.world.x, LABEL_HEIGHT, label.world.z]}
            >
              <Text
                fontSize={LABEL_FONT_SIZE}
                color={label.isDoorRow ? DOOR_ROW_COLOR : LABEL_COLOR}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.012}
                outlineColor={OUTLINE_COLOR}
              >
                {`${label.localCol},${label.localRow}`}
              </Text>
            </Billboard>
          ))}
          <Billboard
            position={[
              room.labelWorld.x,
              LABEL_HEIGHT + ROOM_ID_HEIGHT,
              room.labelWorld.z,
            ]}
          >
            <Text
              fontSize={ROOM_ID_FONT_SIZE}
              color={ROOM_ID_COLOR}
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.016}
              outlineColor={OUTLINE_COLOR}
            >
              {room.regionId}
            </Text>
          </Billboard>
        </group>
      ))}
    </group>
  );
}
