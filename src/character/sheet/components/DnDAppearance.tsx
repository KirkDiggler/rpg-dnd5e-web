import { resolveDwarfCustomizationModel } from '@/character/customization/dwarfCustomization';
import { summarizeHair } from '@/character/customization/hairSummary';
import type { Character } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import {
  Class,
  Race,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { Card } from '../../../components/ui/Card';

interface DnDAppearanceProps {
  character: Character;
}

export function DnDAppearance({ character }: DnDAppearanceProps) {
  const hasIdentity =
    character.race !== Race.UNSPECIFIED &&
    character.class !== Class.UNSPECIFIED;
  const customizationModel = hasIdentity
    ? resolveDwarfCustomizationModel(
        Race[character.race],
        Class[character.class]
      )
    : undefined;

  if (!customizationModel) {
    return (
      <Card className="p-4">
        <h4
          className="mb-4 text-center text-lg font-bold"
          style={{
            fontFamily: 'Cinzel, serif',
            color: 'var(--text-primary)',
          }}
        >
          APPEARANCE
        </h4>
        <p
          className="text-center text-sm"
          style={{ color: 'var(--text-muted)' }}
        >
          {hasIdentity
            ? 'Hair customization is not supported for this race and class.'
            : 'Hair customization unavailable: race and class are required.'}
        </p>
      </Card>
    );
  }

  const summary = summarizeHair(character.appearance?.hair);

  return (
    <Card className="p-4">
      <h4
        className="mb-4 text-center text-lg font-bold"
        style={{
          fontFamily: 'Cinzel, serif',
          color: 'var(--text-primary)',
        }}
      >
        APPEARANCE
      </h4>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="sr-only">Scalp hair</dt>
          <dd style={{ color: 'var(--text-primary)' }}>
            Scalp: {summary.scalp}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Facial hair</dt>
          <dd style={{ color: 'var(--text-primary)' }}>
            Facial: {summary.facialHair}
          </dd>
        </div>
        <div>
          <dt className="sr-only">Hair color</dt>
          <dd
            className="flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
          >
            <span
              aria-hidden="true"
              className="h-6 w-6 rounded border"
              style={{
                backgroundColor: summary.colorHex,
                borderColor: 'var(--border-primary)',
              }}
            />
            <span>
              {summary.colorIsDefault ? 'Default hair color' : 'Hair color'} ·{' '}
              {summary.colorHex}
            </span>
          </dd>
        </div>
        <div>
          <dt className="sr-only">Hair roughness</dt>
          <dd style={{ color: 'var(--text-primary)' }}>
            {summary.roughnessIsDefault ? 'Default roughness' : 'Roughness'} ·{' '}
            {summary.roughness.toFixed(2)}
          </dd>
        </div>
      </dl>

      <p
        className="mt-3 text-center text-xs italic"
        style={{ color: 'var(--text-muted)' }}
      >
        Set during character creation
      </p>
    </Card>
  );
}
