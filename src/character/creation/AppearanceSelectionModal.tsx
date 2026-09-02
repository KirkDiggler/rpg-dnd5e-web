import { resolveDwarfCustomizationModel } from '@/character/customization/dwarfCustomization';
import { create } from '@bufbuild/protobuf';
import type { HairCustomization } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import { HairCustomizationSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/customization/v1alpha1/types_pb';
import type { Appearance } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { AppearanceSchema } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { DwarfCustomizationControls } from './components/DwarfCustomizationControls';
import { DwarfCustomizationPreview } from './components/DwarfCustomizationPreview';

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

function editableAppearance(currentAppearance: Appearance | undefined) {
  return create(AppearanceSchema, {
    hair: copyHair(currentAppearance?.hair),
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
  const model = resolveDwarfCustomizationModel(raceRefId, classRefId);

  useEffect(() => {
    if (!isOpen) return;
    setAppearance(editableAppearance(currentAppearance));
    setSaveError(null);
  }, [currentAppearance, isOpen]);

  useEffect(() => {
    if (!isOpen || !model) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, model, onClose, saving]);

  if (!isOpen || !model) return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="dwarf-appearance-title"
        className="flex max-h-[96dvh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border-2 border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-2xl sm:max-h-[92dvh]"
      >
        <header className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-3 sm:px-6">
          <div>
            <h2
              id="dwarf-appearance-title"
              className="font-serif text-xl font-bold sm:text-2xl"
            >
              Customize Dwarf Hair
            </h2>
            <p className="text-xs text-[var(--text-muted)] sm:text-sm">
              Choose scalp hair, facial hair, color, and finish.
            </p>
          </div>
          <button
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
            <DwarfCustomizationControls
              hair={appearance.hair}
              onChange={(hair) =>
                setAppearance(create(AppearanceSchema, { hair }))
              }
            />
          </div>
          <div className="order-1 min-h-40 border-b border-[var(--border-primary)] bg-[var(--bg-secondary)] lg:order-2 lg:border-b-0 lg:border-l">
            <DwarfCustomizationPreview
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
      </section>
    </div>,
    document.body
  );
}
