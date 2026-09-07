import type { MainHandAttachmentStatus } from '@/components/hex-grid/mainHandPresentation';
import type { OffHandAttachmentStatus } from '@/components/hex-grid/offHandEquipment';
import { useState } from 'react';
import { OffHandAttachmentPreview } from './OffHandAttachmentPreview';
import {
  OFF_HAND_FIXTURES,
  type OffHandClassId,
  type OffHandFacing,
  type OffHandMotion,
  type OffHandRaceId,
  type OffHandStateId,
  type OffHandView,
} from './offHandAttachmentExperiment';

const CLASSES: readonly OffHandClassId[] = [
  'fighter',
  'barbarian',
  'monk',
  'rogue',
];
const RACES: readonly OffHandRaceId[] = [
  'human',
  'dwarf',
  'elf',
  'half-elf',
  'tiefling',
  'halfling',
  'gnome',
  'half-orc',
];
const MOTIONS: readonly OffHandMotion[] = ['idle', 'walk'];
const VIEWS: readonly OffHandView[] = ['close', 'orbit', 'play'];
const FACINGS: readonly OffHandFacing[] = [0, 1, 2, 3, 4, 5];

function Buttons<T extends string | number>({
  label,
  values,
  selected,
  display = String,
  onSelect,
}: {
  label: string;
  values: readonly T[];
  selected: T;
  display?: (value: T) => string;
  onSelect: (value: T) => void;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={selected === value}
            onClick={() => onSelect(value)}
            className="rounded border px-3 py-1.5 text-sm"
          >
            {display(value)}
          </button>
        ))}
      </div>
    </section>
  );
}

export function OffHandAttachmentConcept() {
  const [stateId, setStateId] = useState<OffHandStateId>('empty');
  const [classId, setClassId] = useState<OffHandClassId>('fighter');
  const [raceId, setRaceId] = useState<OffHandRaceId>('human');
  const [motion, setMotion] = useState<OffHandMotion>('idle');
  const [view, setView] = useState<OffHandView>('orbit');
  const [facing, setFacing] = useState<OffHandFacing>(0);
  const [mainStatus, setMainStatus] = useState<MainHandAttachmentStatus>({
    code: 'unarmed',
  });
  const [offStatus, setOffStatus] = useState<OffHandAttachmentStatus>({
    code: 'empty-off-hand',
  });

  return (
    <div className="space-y-5" data-testid="off-hand-attachment-concept">
      <header>
        <h1 className="text-2xl font-bold">Owner Off-Hand Attachment</h1>
        <p className="text-sm opacity-80">
          Production provider bytes, exact owner-shaped equipment fixtures, and
          shared Townfolk/modular hand sockets.
        </p>
      </header>
      <Buttons
        label="Equipment state"
        values={OFF_HAND_FIXTURES.map((fixture) => fixture.id)}
        selected={stateId}
        display={(id) =>
          OFF_HAND_FIXTURES.find((fixture) => fixture.id === id)!.label
        }
        onSelect={setStateId}
      />
      <Buttons
        label="Class"
        values={CLASSES}
        selected={classId}
        onSelect={setClassId}
      />
      <Buttons
        label="Race"
        values={RACES}
        selected={raceId}
        onSelect={setRaceId}
      />
      <Buttons
        label="Motion"
        values={MOTIONS}
        selected={motion}
        display={(value) => (value === 'idle' ? 'Idle' : 'Walk')}
        onSelect={setMotion}
      />
      <Buttons label="View" values={VIEWS} selected={view} onSelect={setView} />
      <Buttons
        label="Facing"
        values={FACINGS}
        selected={facing}
        display={(value) => `Facing ${value}`}
        onSelect={setFacing}
      />
      <OffHandAttachmentPreview
        stateId={stateId}
        classId={classId}
        raceId={raceId}
        motion={motion}
        view={view}
        facing={facing}
        onMainStatus={setMainStatus}
        onOffStatus={setOffStatus}
      />
      <dl className="grid gap-2 text-sm md:grid-cols-2">
        <div>
          <dt>Main hand</dt>
          <dd data-testid="main-hand-status">{mainStatus.code}</dd>
        </div>
        <div>
          <dt>Off hand</dt>
          <dd data-testid="off-hand-status">{offStatus.code}</dd>
        </div>
      </dl>
    </div>
  );
}
