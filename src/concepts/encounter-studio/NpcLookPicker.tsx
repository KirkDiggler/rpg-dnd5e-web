import {
  NpcAppearanceThumbnailProducer,
  npcAppearanceThumbnailKey,
} from '@/npc-appearances';
import { NPC_APPEARANCE_FAMILIES } from '@/npc-appearances/npcAppearanceChoices';
import { useCallback, useState } from 'react';
import { AssetThumbnailImage } from '../world-building/AssetThumbnailImage';

type Thumbnail =
  | { status: 'ready'; image: string }
  | { status: 'error'; message: string };

/** Captured family thumbnails, keyed by the default look's exact model key.
 * Presentation cache only: never document, never storage. */
const THUMBNAILS = new Map<string, Thumbnail>();

const FAMILIES = NPC_APPEARANCE_FAMILIES.filter(
  (family) => family.defaultLook.look
);

/** A pick-from-list of the published NPC appearance families, each with a
 * thumbnail of its default look. Thumbnails are captured one at a time on a
 * single offscreen surface while the picker is mounted. */
export function NpcLookPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(ref: string): void;
}): React.JSX.Element {
  const [, setRevision] = useState(0);
  const pending = FAMILIES.find(
    (family) => !THUMBNAILS.has(npcAppearanceThumbnailKey(family.defaultLook))
  );
  const settle = useCallback((key: string, thumbnail: Thumbnail): void => {
    THUMBNAILS.set(key, thumbnail);
    setRevision((current) => current + 1);
  }, []);
  const unlisted = value && !FAMILIES.some((family) => family.ref === value);
  return (
    <fieldset className="es-look-picker">
      <legend>{label}</legend>
      <div role="radiogroup" aria-label={label} className="es-look-grid">
        {unlisted && (
          <button type="button" role="radio" aria-checked disabled>
            Unavailable: {value}
          </button>
        )}
        {FAMILIES.map((family) => {
          const thumbnail = THUMBNAILS.get(
            npcAppearanceThumbnailKey(family.defaultLook)
          );
          const name = family.defaultLook.displayName;
          return (
            <button
              key={family.ref}
              type="button"
              role="radio"
              aria-checked={value === family.ref}
              aria-label={name}
              className="es-look-option"
              onClick={() => onChange(family.ref)}
            >
              <AssetThumbnailImage
                url={
                  thumbnail?.status === 'ready' ? thumbnail.image : undefined
                }
                label={name}
                fallbackClassName="es-look-thumbnail-fallback"
              />
              <span>{name}</span>
            </button>
          );
        })}
      </div>
      {pending && (
        <NpcAppearanceThumbnailProducer
          appearance={pending.defaultLook}
          onComplete={(key, image) => settle(key, { status: 'ready', image })}
          onError={(key, message) => settle(key, { status: 'error', message })}
          onRootError={(message) => {
            for (const family of FAMILIES) {
              const key = npcAppearanceThumbnailKey(family.defaultLook);
              if (!THUMBNAILS.has(key))
                THUMBNAILS.set(key, { status: 'error', message });
            }
            setRevision((current) => current + 1);
          }}
        />
      )}
    </fieldset>
  );
}
