/**
 * SessionExitMarkers — the ways out, drawn on the game map
 * (rpg-project#368 §3.1).
 *
 * # Why this exists
 *
 * Kirk's walk on rpg-dnd5e-web#924 (2026-09-04): he searched out the
 * vault, held the heirloom, hit Leave one cell short of the entrance and
 * dropped it. R9 did exactly what it was designed to do — a carrier who
 * leaves from anywhere but a bound exit drops what they carry — and the
 * map had never said where the way out was. A rule the party can only
 * learn by losing to it is not a rule they were given.
 *
 * So the exits are marked from the start. `GetAtlasExit` is the same for
 * every member (an exit is structure, not concealable), which is why this
 * can be drawn the moment the atlas lands rather than waiting on a reveal.
 *
 * # The same visual language as the builder
 *
 * A cyan cell with its id written on it, matching the square-and-label the
 * author saw when they placed it (`markerStyle.ts`'s `EXIT_COLOR`). The
 * cyan is deliberately not the start's green: in the reference tomb the
 * entrance and the exit are the SAME cell, and two marks the same colour
 * on one hex read as one mark.
 *
 * Billboarded text rather than floor-flat, for `AuthorGridOverlay`'s
 * reason: this route's camera is fixed but oblique (CAMERA_OFFSET), so
 * text painted on the floor plane reads foreshortened at exactly the angle
 * it has to be read from. Legibility over "looks painted on".
 *
 * DRAWING ONLY. This marks where the way out is; it never gates the Leave
 * button, which stays offered wherever the member stands because the
 * server decides what a departure means (`AtlasExit`'s own doc comment,
 * and design R9 — the drop only happens if leaving from elsewhere is
 * possible in the first place).
 */
import { Billboard, Text } from '@react-three/drei';
import { Suspense } from 'react';
import { cubeToWorld } from '../hex-grid/hexMath';
import { PathPreview } from '../hex-grid/PathPreview';
import type { SceneExit3D } from './atlasToScene3D';

/** The builder's own exit cyan (`src/author/markerStyle.ts`), repeated
 * rather than imported: the session route does not depend on the author
 * route, and one hex colour is not worth a dependency between them. If
 * these ever disagree the author and the player are looking at two
 * different marks for one thing. */
export const SESSION_EXIT_COLOR = '#38bdf8';

/** Bright enough to find at a glance across a dark tomb, faint enough
 * that the floor art still reads through it. */
const EXIT_FILL_OPACITY = 0.42;

/** Clear of `SyntyHexFloor`'s own FLOOR_Y (0.2), of the fill below it, and
 * of a CHARACTER STANDING ON THE CELL — which is the ordinary case, since
 * the reference tomb's entrance is also its exit and the party starts on
 * it. At 0.45 the id read through the token's chest (first live shot); a
 * label its own marker hides is no label. */
const LABEL_HEIGHT = 1.15;
const LABEL_FONT_SIZE = 0.34;
const LABEL_OUTLINE = '#04121c';

export interface SessionExitMarkersProps {
  exits: readonly SceneExit3D[];
  hexSize: number;
}

export function SessionExitMarkers({
  exits,
  hexSize,
}: SessionExitMarkersProps) {
  // Every dungeon authored before slice 2 declares none, and so does an
  // atlas from a server older than the field. No marker, and the route
  // draws exactly what it always drew.
  if (exits.length === 0) return null;
  return (
    <group name="session-exit-markers">
      {exits.map((exit) => (
        <group key={`exit-${exit.id}`} name={`session-exit-${exit.id}`}>
          <PathPreview
            path={[exit.position]}
            hexSize={hexSize}
            color={SESSION_EXIT_COLOR}
            opacity={EXIT_FILL_OPACITY}
          />
          {/* THE LABEL SUSPENDS AND THE CELL MUST NOT. drei's `Text`
              loads a font, so without this boundary a font that has not
              arrived yet takes the whole marker layer down with it — and
              a way out that is invisible while the font loads is the
              exact failure this component exists to prevent. The marked
              cell is the load-bearing half; the id is the refinement. */}
          <Suspense fallback={null}>
            <Billboard
              position={[
                worldOf(exit, hexSize).x,
                LABEL_HEIGHT,
                worldOf(exit, hexSize).z,
              ]}
            >
              <Text
                fontSize={LABEL_FONT_SIZE}
                color={SESSION_EXIT_COLOR}
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.012}
                outlineColor={LABEL_OUTLINE}
              >
                {exit.id}
              </Text>
            </Billboard>
          </Suspense>
        </group>
      ))}
    </group>
  );
}

function worldOf(exit: SceneExit3D, hexSize: number) {
  return cubeToWorld(exit.position, hexSize);
}
