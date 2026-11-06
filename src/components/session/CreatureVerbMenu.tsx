/**
 * CreatureVerbMenu — the choices over a creature that offers more than one
 * thing to do (rpg-project#872 D3): "Attack Guard", "Speak to Guard",
 * "Walk up to Guard". Pure presentation: which verbs exist, and whether each
 * can be chosen, is `clickToAct.ts`'s answer from the server's offers. An
 * out-of-reach Attack shows disabled as "Out of reach".
 */
import { Html } from '@react-three/drei';
import { cubeToWorld, type CubeCoord } from '../hex-grid/hexMath';
import { verbEnabled, verbLabel, type CreatureVerb } from './clickToAct';

export interface CreatureVerbMenuProps {
  subject: string;
  name: string;
  position: CubeCoord;
  hexSize: number;
  verbs: readonly CreatureVerb[];
  onChoose: (subject: string, verb: CreatureVerb) => void;
  onClose: () => void;
}

export function CreatureVerbMenu({
  subject,
  name,
  position,
  hexSize,
  verbs,
  onChoose,
  onClose,
}: CreatureVerbMenuProps) {
  const at = cubeToWorld(position, hexSize);
  return (
    <Html center position={[at.x, 2.4, at.z]} zIndexRange={[20, 10]}>
      <CreatureVerbList
        subject={subject}
        name={name}
        verbs={verbs}
        onChoose={onChoose}
        onClose={onClose}
      />
    </Html>
  );
}

/** The menu's DOM, apart from the 3D anchor so it renders in a plain test. */
export function CreatureVerbList({
  subject,
  name,
  verbs,
  onChoose,
  onClose,
}: Omit<CreatureVerbMenuProps, 'position' | 'hexSize'>) {
  return (
    <div
      role="menu"
      aria-label={`What to do with ${name}`}
      data-verb-menu={subject}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 140,
        padding: 4,
        color: '#d6eff0',
        background: '#0b1720f2',
        border: '1px solid #3b82f6',
        borderRadius: 6,
        fontSize: 12,
        whiteSpace: 'nowrap',
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {verbs.map((verb) => {
        const enabled = verbEnabled(verb);
        return (
          <button
            key={verb.verb}
            type="button"
            role="menuitem"
            disabled={!enabled}
            onClick={(event) => {
              event.stopPropagation();
              onChoose(subject, verb);
            }}
            style={{
              textAlign: 'left',
              padding: '4px 8px',
              borderRadius: 4,
              background: 'transparent',
              color: enabled ? '#d6eff0' : '#7b8794',
              cursor: enabled ? 'pointer' : 'not-allowed',
            }}
          >
            {verbLabel(verb, name)}
          </button>
        );
      })}
      <button
        type="button"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        style={{
          textAlign: 'right',
          padding: '2px 8px',
          color: '#7b8794',
          background: 'transparent',
        }}
      >
        Close
      </button>
    </div>
  );
}
