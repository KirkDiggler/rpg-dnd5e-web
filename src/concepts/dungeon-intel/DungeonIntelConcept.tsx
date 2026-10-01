import { HEX_SIZE } from '@/components/hex-grid/hexMath';
import { ObservationMarkers } from '@/components/session/ObservationMarkers';
import { SessionCanvas } from '@/components/session/SessionCanvas';
import { toJson } from '@bufbuild/protobuf';
import { GetAtlasResponseSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/service_pb';
import {
  AtlasPropSchema,
  DoorInfoSchema,
  SightingSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import { useMemo, useState, type ReactElement } from 'react';
import { STEPS, type Observer } from './fixtures';
import { doorWord, renderSnapshot } from './renderSnapshot';

export function DungeonIntelConcept(): ReactElement {
  const [observer, setObserver] = useState<Observer>('A');
  const [stepIndex, setStepIndex] = useState(0);
  const [fitRequest, setFitRequest] = useState(0);
  const step = STEPS[stepIndex];
  const snapshot = step.views[observer];
  const rendered = useMemo(() => renderSnapshot(snapshot), [snapshot]);
  const buttonClass =
    'rounded border border-slate-600 px-3 py-2 text-sm aria-pressed:border-emerald-400 aria-pressed:bg-emerald-950';
  const suppliedAnswer = {
    observer: snapshot.observer,
    position: { x: snapshot.position.x, y: snapshot.position.y },
    fixedGeometry: toJson(GetAtlasResponseSchema, snapshot.atlas),
    sightings: snapshot.sightings.map((sighting) =>
      toJson(SightingSchema, sighting)
    ),
    provisionalPropTestimony: snapshot.props.map(
      ({ id, name, observation, placement }) => ({
        id,
        name,
        observation,
        placement: placement ? toJson(AtlasPropSchema, placement) : undefined,
      })
    ),
    provisionalDoorTestimony: snapshot.doors.map(({ info, observation }) => ({
      info: toJson(DoorInfoSchema, info),
      observation,
    })),
    provisionalObservedEmpty: snapshot.observedEmpty.map(({ x, y }) => ({
      x,
      y,
    })),
  };
  return (
    <section
      className="space-y-4 text-slate-200"
      aria-label="Dungeon intel concept"
    >
      <header>
        <h2 className="text-2xl font-semibold">Individual dungeon knowledge</h2>
        <p className="mt-1 text-sm text-slate-400">
          Real session renderer · supplied observer snapshots · no browser
          visibility rules
        </p>
      </header>
      <div
        className="flex flex-wrap items-center gap-2"
        aria-label="Observer selection"
      >
        <span className="text-sm">View as</span>
        {(['A', 'B'] as const).map((viewer) => (
          <button
            key={viewer}
            className={buttonClass}
            aria-pressed={observer === viewer}
            onClick={() => setObserver(viewer)}
          >
            Observer {viewer}
          </button>
        ))}
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Storyboard snapshots">
        {STEPS.map((entry, index) => (
          <button
            key={entry.id}
            className={buttonClass}
            aria-pressed={stepIndex === index}
            onClick={() => setStepIndex(index)}
          >
            {entry.label}
          </button>
        ))}
      </nav>
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <button
          className={buttonClass}
          onClick={() => setFitRequest((value) => value + 1)}
        >
          Fit known floor
        </button>
        <span>Home: fit · wheel: zoom · right-drag: pan · Q/E: rotate</span>
      </div>
      <p className="text-sm text-slate-400">
        Developer storyboard: {step.description}
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          className="relative h-[480px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
          data-testid="intel-scene"
        >
          <SessionCanvas
            scene={rendered.scene}
            hexSize={HEX_SIZE}
            characterId={observer}
            characterName={`Observer ${observer}`}
            classRefId="fighter"
            myPosition={rendered.position}
            otherMembers={rendered.members}
            doors={rendered.doors}
            movementPreviewEnabled={false}
            fitRequest={
              fitRequest * (STEPS.length * 2) +
              stepIndex * 2 +
              (observer === 'B' ? 1 : 0)
            }
            presentationLayer={
              <ObservationMarkers markers={rendered.markers} />
            }
          />
        </div>
        <aside
          className="space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-4"
          aria-label="Selected observer knowledge"
        >
          <h3 className="font-semibold">
            Observer {observer} · supplied knowledge
          </h3>
          <p className="text-sm" role="status">
            {snapshot.account}
          </p>
          <p className="text-sm text-slate-400">
            Discovered floor: {snapshot.atlas.cells.length} cells. Fixed scenery
            persists; unknown space is not drawn.
          </p>
          <ul className="space-y-2 text-sm">
            {snapshot.props.map((prop) => (
              <li key={prop.id}>
                {prop.name} ·{' '}
                {prop.placement ? prop.observation : 'location unknown'}
              </li>
            ))}
            {snapshot.doors.map(({ info, observation }) => (
              <li key={info.door}>
                {info.door.endsWith('/entry') ? 'Entry door' : 'Further door'} ·{' '}
                {doorWord(info.state)} · {observation}
              </li>
            ))}
          </ul>
          <p className="text-xs text-emerald-300">Green: current observation</p>
          <p className="text-xs text-amber-300">
            Amber: remembered observation, not live truth
          </p>
          <p className="text-xs text-slate-400">
            The further door supplies no room-3 interior. Markers annotate the
            real prop/door meshes; they do not calculate knowledge.
          </p>
        </aside>
      </div>
      <details className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <summary className="cursor-pointer font-semibold">
          Contract inspector · selected answer only
        </summary>
        <p className="my-3 text-sm text-amber-200">
          Generated atlas, creature sighting and door values are reused.
          Prop/door observation envelopes and positive empty-position evidence
          are provisional fixture fields—not approved wire schemas. Appearance
          is supplied by permitted refs; no full authored dungeon is fetched.
        </p>
        <pre
          className="max-h-96 overflow-auto whitespace-pre-wrap text-xs"
          data-testid="supplied-answer"
        >
          {JSON.stringify(suppliedAnswer, null, 2)}
        </pre>
      </details>
      <p className="text-xs text-slate-500">
        Fixture lab only: the bundle includes later snapshots for developer
        selection. This demonstrates scene inputs and rendering, not
        authenticated server non-disclosure, LOS correctness, replay or
        persistence.
      </p>
    </section>
  );
}
