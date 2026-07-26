import { useEffect, useState } from 'react';

export type DiceTrayPhase =
  | 'hidden'
  | 'entering'
  | 'ready'
  | 'rolling'
  | 'settled'
  | 'exiting';

export type DiceTrayOutcome = 'HIT' | 'MISS' | 'CRIT' | 'NAT-1' | 'LOCAL' | '';

export interface DiceMotion {
  faceCount?: number;
  initialCadenceMs?: number;
  decelerationMs?: number;
  nearSettleHoldMs?: number;
  rolloverMs?: number;
}

export interface DiceTrayProps {
  phase: DiceTrayPhase;
  finalFace: number;
  outcome: DiceTrayOutcome;
  reducedMotion?: boolean;
  motion?: DiceMotion;
  onPresentationComplete?: () => void;
  children?: React.ReactNode;
  className?: string;
}

const REDUCED_MOTION_PRESENTATION_FACES = [2, 7, 11, 16, 19];
const PRESENTATION_RANDOM_RANGE = 2 ** 32;
const VERTICES: ReadonlyArray<readonly [number, number]> = [
  [50, 4],
  [88.97, 27.5],
  [88.97, 72.5],
  [50, 96],
  [11.03, 72.5],
  [11.03, 27.5],
];
const SILHOUETTE_POINTS = VERTICES.map(([x, y]) => `${x},${y}`).join(' ');

function defaultPresentationRandom() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return (
      crypto.getRandomValues(new Uint32Array(1))[0] / PRESENTATION_RANDOM_RANGE
    );
  }
  return Math.random();
}

export function DiceTray({
  phase,
  finalFace,
  outcome,
  reducedMotion = false,
  motion,
  onPresentationComplete,
  children,
  className,
}: DiceTrayProps) {
  const [face, setFace] = useState<number | '?'>(() =>
    phase === 'settled' ? finalFace : '?'
  );
  const rolling = phase === 'rolling' && !reducedMotion;
  const frameBreak = outcome === 'CRIT' || outcome === 'NAT-1';

  useEffect(() => {
    if (phase === 'settled') {
      setFace(finalFace);
      return;
    }
    if (phase !== 'rolling') {
      setFace('?');
      return;
    }

    if (reducedMotion) {
      setFace(
        REDUCED_MOTION_PRESENTATION_FACES.find(
          (value) => value !== finalFace
        ) ?? 1
      );
      onPresentationComplete?.();
      return;
    }

    const count = Math.max(1, motion?.faceCount ?? 4);
    const cadence = motion?.initialCadenceMs ?? 120;
    const deceleration = motion?.decelerationMs ?? 90;
    const hold = motion?.nearSettleHoldMs ?? 240;
    const rollover = motion?.rolloverMs ?? 120;
    const faces = Array.from({ length: 20 }, (_, index) => index + 1).filter(
      (value) => value !== finalFace
    );
    for (let index = faces.length - 1; index > 0; index -= 1) {
      const shuffledIndex = Math.floor(
        defaultPresentationRandom() * (index + 1)
      );
      [faces[index], faces[shuffledIndex]] = [
        faces[shuffledIndex],
        faces[index],
      ];
    }
    const decoy = faces[count % faces.length] ?? (finalFace === 20 ? 19 : 20);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;

    setFace(faces[0] ?? decoy);
    for (let index = 1; index < count; index += 1) {
      elapsed += cadence + deceleration * index;
      timers.push(
        setTimeout(() => setFace(faces[index % faces.length] ?? decoy), elapsed)
      );
    }
    elapsed += cadence + deceleration * count;
    timers.push(setTimeout(() => setFace(decoy), elapsed));
    timers.push(
      setTimeout(() => onPresentationComplete?.(), elapsed + hold + rollover)
    );
    return () => timers.forEach(clearTimeout);
  }, [finalFace, motion, onPresentationComplete, phase, reducedMotion]);

  if (phase === 'hidden') return null;

  return (
    <section
      data-testid="dice-tray"
      className={[
        'dice-tray',
        `dice-tray--${phase}`,
        frameBreak ? 'dice-tray--center-stage' : 'dice-tray--upper-center',
        reducedMotion ? 'dice-tray--reduced-motion' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <svg
        data-testid="d20-die"
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="dice-tray__die d20-die"
      >
        <g
          data-testid="d20-shell"
          className={`d20-shell ${rolling ? 'dice-tray__die--rolling d20-die--tumbling' : 'd20-die--settled'}`}
        >
          <polygon
            data-testid="d20-silhouette"
            points={SILHOUETTE_POINTS}
            fill="currentColor"
            fillOpacity={0.08}
            stroke="currentColor"
            strokeWidth={4}
            strokeLinejoin="round"
          />
          {VERTICES.map(([x, y], index) => (
            <line
              key={index}
              data-testid="d20-facet"
              x1="50"
              y1="50"
              x2={x}
              y2={y}
              stroke="currentColor"
              strokeWidth={2}
              strokeOpacity={0.55}
            />
          ))}
        </g>
        <text
          data-testid="dice-face"
          x="50"
          y="60"
          textAnchor="middle"
          fontSize={face === '?' ? 30 : 26}
          fontWeight={700}
          fill="currentColor"
        >
          {face}
        </text>
      </svg>
      {children}
    </section>
  );
}
