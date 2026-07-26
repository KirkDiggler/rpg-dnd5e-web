/**
 * Fog of War concept (rpg-dnd5e-web#605).
 *
 * Design: rpg-project/ideas/fog-of-war/design.md.
 *
 * The composition root. It constructs the fixture authority, hands every event
 * it emits to the reducer, and renders the result through the real `HexGrid`.
 * That is the whole wiring — and in production the authority is replaced by a
 * stream subscription while everything below it stays put.
 *
 * The page holds no state derived from world truth. The only thing it renders
 * is `toHexGridProps(knowledge)`. The truth panel is a review aid, clearly
 * labelled, and never feeds the reducer.
 */

import { HexGrid } from '@/components/hex-grid/HexGrid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toHexGridProps } from './adapter';
import { createAuthority, type Authority } from './authority/authority';
import {
  at,
  DOOR_CLOSED,
  DOOR_OPEN,
  key,
  twoRoomCrypt,
  VIEWER_START,
  type World,
} from './authority/world';
import { emptyKnowledge, fogReducer, type FogKnowledge } from './reducer';

const DOOR_HEX = at(3, 1);

interface Session {
  authority: Authority;
  world: World;
}

const newSession = (): Session => {
  const world = twoRoomCrypt();
  return { authority: createAuthority(world), world };
};

export function FogOfWarConcept() {
  const session = useRef<Session>(newSession());
  const [knowledge, setKnowledge] = useState<FogKnowledge>(emptyKnowledge);
  const [doorOpen, setDoorOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [started, setStarted] = useState(false);

  const apply = useCallback(
    (label: string, produce: () => ReturnType<Authority['subscribe']>) => {
      const event = produce();
      setKnowledge((current) => fogReducer(current, event));
      setLog((entries) =>
        [
          `${label} → ${event.hexes.length} hex record${event.hexes.length === 1 ? '' : 's'}`,
          ...entries,
        ].slice(0, 8)
      );
    },
    []
  );

  const subscribe = useCallback(() => {
    setStarted(true);
    apply('subscribe', () => session.current.authority.subscribe());
  }, [apply]);

  const toggleDoor = useCallback(() => {
    const next = doorOpen ? DOOR_CLOSED : DOOR_OPEN;
    setDoorOpen(!doorOpen);
    apply(doorOpen ? 'close door' : 'open door', () =>
      session.current.authority.setDoor(DOOR_HEX, next)
    );
  }, [apply, doorOpen]);

  const moveViewer = useCallback(
    (coord: { x: number; y: number; z: number }) => {
      apply(`move to ${coord.x},${coord.y},${coord.z}`, () =>
        session.current.authority.moveViewer(coord)
      );
    },
    [apply]
  );

  const wanderGoblin = useCallback(() => {
    apply('goblin moves', () =>
      session.current.authority.mutateHidden((world) => {
        const here = world.placements.get('goblin-1');
        // at(4,2) is the hex beyond the doorway, ON the open-door sightline;
        // the other two are in Room B but off it. Cycling through all three
        // lets the demo show seen, then frozen, then corrected.
        const spots = [at(4, 2), at(6, 0), at(5, 0)];
        const index = spots.findIndex(
          (spot) => here && key(spot) === key(here.hex)
        );
        const next = spots[(index + 1) % spots.length]!;
        world.placements.set('goblin-1', {
          hex: next,
          facing: (index + 2) % 6,
        });
      })
    );
  }, [apply]);

  const reconnect = useCallback(() => {
    // Discard everything the client holds and re-subscribe. Wave A's promise
    // is that knowledge comes back from the server, not from the client having
    // quietly kept it.
    session.current = {
      ...session.current,
      authority: createAuthority(session.current.world),
    };
    setKnowledge(emptyKnowledge());
    setLog((entries) =>
      ['reconnect (knowledge discarded)', ...entries].slice(0, 8)
    );
    setDoorOpen(session.current.world.doors.get(key(DOOR_HEX)) === DOOR_OPEN);
    apply('re-subscribe', () => session.current.authority.subscribe());
  }, [apply]);

  // Subscribe on mount: landing on the page should already show what the
  // viewer knows, the same way joining an encounter delivers a snapshot.
  const subscribed = useRef(false);
  useEffect(() => {
    // Ref-guarded: StrictMode double-invokes effects, and a second subscribe
    // correctly emits zero records, which reads as a confusing empty entry in
    // the event log.
    if (subscribed.current) return;
    subscribed.current = true;
    subscribe();
  }, [subscribe]);

  const props = useMemo(() => toHexGridProps(knowledge), [knowledge]);

  const believedGoblin = useMemo(() => {
    for (const [hexKey, record] of knowledge.hexes) {
      if (record.contents.some((p) => p.entityId === 'goblin-1')) {
        return `${hexKey} (${record.state.toLowerCase()})`;
      }
    }
    return 'not known';
  }, [knowledge]);

  const truth = session.current.world.placements.get('goblin-1');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="px-3 py-1.5 rounded text-sm border"
          onClick={subscribe}
        >
          {started ? 'Re-send snapshot' : 'Subscribe'}
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm border"
          onClick={toggleDoor}
          disabled={!started}
        >
          {doorOpen ? 'Close the door' : 'Open the door'}
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm border"
          onClick={wanderGoblin}
          disabled={!started}
        >
          Goblin moves
        </button>
        <button
          className="px-3 py-1.5 rounded text-sm border"
          onClick={reconnect}
          disabled={!started}
        >
          Reconnect
        </button>
        <span className="text-xs opacity-70">Click a hex to walk there.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem] gap-4">
        <div style={{ height: '60vh', minHeight: 360 }}>
          {started ? (
            <HexGrid
              floorTiles={props.floorTiles}
              rememberedFloorHexKeys={props.rememberedFloorHexKeys}
              walls={props.walls}
              legacySyntyWalls={props.legacySyntyWalls}
              envelopeRuns={props.envelopeRuns}
              connectorRuns={props.connectorRuns}
              doorRotationOverrides={props.doorRotationOverrides}
              rememberedWallHexKeys={props.rememberedWallHexKeys}
              entities={props.entities}
              onHexClick={moveViewer}
              showFrontierGroundHints={false}
              // Real Synty pieces and the crypt mood, not the procedural
              // placeholder path. Remembered geometry is a TINT on these
              // materials (sceneKnowledge.cloneCryptMaterials), so without
              // them there is nothing for fog to visibly act on.
              syntyDungeon
              spaceTheme="crypt"
            />
          ) : (
            <div className="h-full grid place-items-center text-sm opacity-70">
              Subscribe to receive your first records.
            </div>
          )}
        </div>

        <aside className="text-xs flex flex-col gap-3">
          <section>
            <h3 className="font-semibold mb-1">What you know</h3>
            <div>hexes: {knowledge.hexes.size}</div>
            <div>
              remembered: {props.rememberedFloorHexKeys.size} / entities known:{' '}
              {knowledge.entities.size}
            </div>
            <div>goblin believed at: {believedGoblin}</div>
          </section>

          <section>
            <h3 className="font-semibold mb-1">World truth (review aid)</h3>
            <p className="opacity-70 mb-1">
              Never reaches the reducer. Shown so you can see what you are not
              being told.
            </p>
            <div>goblin actually at: {truth ? key(truth.hex) : 'unplaced'}</div>
            <div>viewer at: {key(session.current.authority.viewerHex())}</div>
            <div>start: {key(VIEWER_START)}</div>
          </section>

          <section>
            <h3 className="font-semibold mb-1">Events received</h3>
            <ul className="space-y-0.5">
              {log.map((entry, index) => (
                <li key={`${entry}-${index}`} className="opacity-80">
                  {entry}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
