/**
 * TurnHud — render-only HTML overlay for the turn economy (rpg-dnd5e-
 * web#762 slice 5a). Kirk's ruling on toolkit#1138: "backend tells dumb
 * client what it can do... we hand shapes for action, bonus and reaction
 * that lined up with the various things we could do. that was really
 * nice." This component only turns `useTurnHud`'s pure `TurnHudSelection`
 * into three CSS silhouettes (lit vs dim) and a declaration list — every
 * decision about WHAT to light lives in `turnHud.ts`, the same split
 * `MoveIndicator`/`moveIndicator.ts` already use on this route.
 *
 * HTML overlay, not inside the Canvas (unlike `MoveIndicator`, which
 * decorates the 3D floor) — a turn-economy readout is UI chrome, not a
 * thing that exists in the scene. Anchored bottom-left so it never
 * competes with `SessionEncounterView`'s own top-left Back/Walking status
 * line for the same screen region.
 *
 * Not yet interactive: this slice only LIGHTS a shape, it doesn't let a
 * player click one to declare a verb (there is no Attack RPC in the web
 * yet — see `turnHud.ts`'s own doc comment and issue #762 slice 5b).
 */
import { Verb } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/session/v1alpha1/types_pb';
import type {
  TurnHudDeclarationRow,
  TurnHudSelection,
  TurnHudSlotName,
} from './turnHud';

const SHAPE_ORDER: TurnHudSlotName[] = ['action', 'bonus', 'reaction'];

const SHAPE_LABEL: Record<TurnHudSlotName, string> = {
  action: 'Action',
  bonus: 'Bonus',
  reaction: 'Reaction',
};

// Only VERB_ATTACK exists on the wire today (Verb's own doc comment: "one
// value because v1 has exactly one gated verb"). A verb this client
// doesn't recognise (a future addition, or VERB_UNSPECIFIED) falls back
// to its raw number rather than rendering blank or throwing — the same
// "deliver it, don't drop it" spirit `EventKind.UNKNOWN` keeps on the
// stream side.
const VERB_LABEL: Partial<Record<Verb, string>> = {
  [Verb.ATTACK]: 'Attack',
};

function verbLabel(verb: Verb): string {
  return VERB_LABEL[verb] ?? `Verb ${verb}`;
}

/** "Attack — ready" when affordable, "Attack — action: 1 needed, 0 left"
 * otherwise — `shortfall` is already the server's own refusal wording
 * (`Declaration.shortfall`'s own doc comment), so this never invents
 * currency language of its own. */
function declarationRowText(row: TurnHudDeclarationRow): string {
  const label = verbLabel(row.verb);
  return row.affordable ? `${label} — ready` : `${label} — ${row.shortfall}`;
}

const overlayStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 12,
  left: 12,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 12px',
  background: 'var(--bg-secondary, rgba(0, 0, 0, 0.55))',
  border: '1px solid var(--border-primary, rgba(255, 255, 255, 0.12))',
  borderRadius: 8,
  color: 'var(--text-primary, #e5e7eb)',
  fontSize: 13,
  minWidth: 168,
  pointerEvents: 'none',
};

function Shape({ slot, lit }: { slot: TurnHudSlotName; lit: boolean }) {
  const color = lit
    ? 'var(--accent-primary, #facc15)'
    : 'var(--text-muted, rgba(255, 255, 255, 0.25))';
  const label = `${SHAPE_LABEL[slot]} — ${lit ? 'ready' : 'not available'}`;

  let shape: React.ReactNode;
  if (slot === 'action') {
    // Circle.
    shape = (
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: color,
        }}
      />
    );
  } else if (slot === 'bonus') {
    // Triangle — a CSS border trick, no SVG/deps needed.
    shape = (
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '8px solid transparent',
          borderRight: '8px solid transparent',
          borderBottom: `16px solid ${color}`,
        }}
      />
    );
  } else {
    // Diamond — a rotated square.
    shape = (
      <div
        style={{
          width: 12,
          height: 12,
          transform: 'rotate(45deg)',
          background: color,
        }}
      />
    );
  }

  return (
    <div
      data-testid={`turn-hud-shape-${slot}`}
      data-lit={lit}
      title={label}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 20,
        height: 20,
      }}
    >
      {shape}
    </div>
  );
}

export interface TurnHudProps {
  selection: TurnHudSelection;
}

export function TurnHud({ selection }: TurnHudProps) {
  if (selection.mode === 'free-roam') {
    return (
      <div data-testid="turn-hud" style={overlayStyle}>
        <span
          data-testid="turn-hud-free-roam-pill"
          style={{
            alignSelf: 'flex-start',
            padding: '2px 10px',
            borderRadius: 999,
            background: 'var(--bg-tertiary, rgba(255, 255, 255, 0.12))',
            color: 'var(--text-secondary, #aaa)',
          }}
        >
          Free roam
        </span>
      </div>
    );
  }

  return (
    <div data-testid="turn-hud" style={overlayStyle}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {SHAPE_ORDER.map((slotName) => {
          const shape = selection.shapes.find((s) => s.slot === slotName);
          return (
            <Shape key={slotName} slot={slotName} lit={shape?.lit ?? false} />
          );
        })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {selection.declarations.map((row, i) => (
          <span
            key={i}
            data-testid="turn-hud-declaration-row"
            style={{
              color: row.affordable
                ? 'var(--text-primary, #e5e7eb)'
                : 'var(--color-error, #f87171)',
            }}
          >
            {declarationRowText(row)}
          </span>
        ))}
      </div>
    </div>
  );
}
