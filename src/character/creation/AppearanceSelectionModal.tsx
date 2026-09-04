import {
  characterCustomizationRaceLabel,
  getCharacterCustomizationProfile,
  resolveCharacterCustomizationModel,
} from '@/character/customization/characterCustomization';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
import { create } from '@bufbuild/protobuf';
import type {
  HairCustomization,
  OutfitCustomization,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import {
  HairCustomizationSchema,
  OutfitCustomizationSchema,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import type { Appearance } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AppearanceSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useRef, useState } from 'react';
import { CharacterCustomizationControls } from './components/CharacterCustomizationControls';
import { CharacterCustomizationPreview } from './components/CharacterCustomizationPreview';

export interface AppearanceSelectionModalProps {
  isOpen: boolean;
  raceRefId?: string;
  classRefId?: string;
  currentAppearance?: Appearance;
  onConfirm: (appearance: Appearance) => void | Promise<void>;
  onClose: () => void;
}

function copyHair(hair: HairCustomization | undefined) {
  return hair ? create(HairCustomizationSchema, hair) : undefined;
}

function copyOutfit(outfit: OutfitCustomization | undefined) {
  return outfit ? create(OutfitCustomizationSchema, outfit) : undefined;
}

function editableAppearance(currentAppearance: Appearance | undefined) {
  return create(AppearanceSchema, {
    hair: copyHair(currentAppearance?.hair),
    outfit: copyOutfit(currentAppearance?.outfit),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not save appearance';
}

export function AppearanceSelectionModal({
  isOpen,
  raceRefId,
  classRefId,
  currentAppearance,
  onConfirm,
  onClose,
}: AppearanceSelectionModalProps) {
  const [appearance, setAppearance] = useState(() =>
    editableAppearance(currentAppearance)
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const model = resolveCharacterCustomizationModel(raceRefId, classRefId);
  const profile = getCharacterCustomizationProfile(raceRefId);
  const raceLabel = characterCustomizationRaceLabel(raceRefId);
  const open = isOpen && model !== undefined && profile !== undefined;

  useEffect(() => {
    if (!open) return;
    setAppearance(editableAppearance(currentAppearance));
    setSaveError(null);
  }, [currentAppearance, open]);

  const close = () => {
    if (!saving) onClose();
  };

  const apply = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onConfirm(editableAppearance(appearance));
      onClose();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
    >
      {model && profile && (
        <DialogContent
          className="flex h-[96dvh] w-[calc(100%-1rem)] max-w-6xl flex-col overflow-hidden rounded-xl border-2 border-[var(--border-primary)] bg-[var(--bg-primary)] p-0 text-[var(--text-primary)] shadow-2xl sm:h-[92dvh] sm:w-[calc(100%-2rem)]"
          style={{ translate: '-50% -50%' }}
          onOpenAutoFocus={(event) => {
            const active = document.activeElement;
            restoreFocusRef.current =
              active instanceof HTMLElement ? active : null;
            event.preventDefault();
            closeButtonRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const restoreFocus = restoreFocusRef.current;
            restoreFocusRef.current = null;
            if (restoreFocus?.isConnected) restoreFocus.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <header className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-3 sm:px-6">
            <div>
              <DialogTitle
                className="font-serif text-xl font-bold sm:text-2xl"
                style={{ color: 'var(--text-primary)' }}
              >
                Customize {raceLabel} Appearance
              </DialogTitle>
              <DialogDescription className="text-xs text-[var(--text-muted)] sm:text-sm">
                Choose hair, facial hair, and class gear colors.
              </DialogDescription>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close appearance picker"
              onClick={close}
              disabled={saving}
              className="rounded p-2 text-2xl leading-none text-[var(--text-muted)] hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              ×
            </button>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[minmax(10rem,30vh)_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(22rem,1fr)_minmax(20rem,0.8fr)] lg:grid-rows-1">
            <div className="order-2 overflow-y-auto p-4 sm:p-6 lg:order-1">
              <CharacterCustomizationControls
                profile={profile}
                classRefId={classRefId}
                appearance={appearance}
                onChange={setAppearance}
              />
            </div>
            <div className="order-1 min-h-40 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] lg:order-2 lg:border-b-0 lg:border-l">
              <CharacterCustomizationPreview
                raceRefId={raceRefId}
                classRefId={classRefId}
                appearance={appearance}
              />
              <p className="pointer-events-none -mt-8 text-center text-xs text-[var(--text-muted)]">
                Drag to rotate · scroll to zoom
              </p>
            </div>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-[var(--border-primary)] px-4 py-3 sm:px-6">
            {saveError && (
              <p role="alert" className="mr-auto text-sm text-red-300">
                {saveError}
              </p>
            )}
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="rounded-md border border-[var(--border-primary)] px-4 py-2 font-medium hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={saving}
              className="rounded-md bg-[var(--accent-primary)] px-4 py-2 font-semibold text-white hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              {saving ? 'Applying…' : 'Apply'}
            </button>
          </footer>
        </DialogContent>
      )}
    </Dialog>
  );
}
