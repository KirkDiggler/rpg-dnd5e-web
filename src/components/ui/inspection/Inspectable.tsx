import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import './inspection.css';

export interface InspectableProps {
  label: string;
  description: string;
  trigger: ReactNode;
  summary: ReactNode;
  details: ReactNode;
  portalContainer?: HTMLElement | null;
  triggerClassName?: string;
}

/** Owns disclosure, not item/ability/event data. Trigger and summary are noninteractive slots. */
export function Inspectable({
  label,
  description,
  trigger,
  summary,
  details,
  portalContainer,
  triggerClassName,
}: InspectableProps) {
  const [open, setOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressSummary = useRef(false);
  const pointerDown = useRef(false);

  function changeOpen(next: boolean) {
    suppressSummary.current = true;
    setSummaryOpen(false);
    setOpen(next);
  }

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Tooltip.Provider delayDuration={250} skipDelayDuration={0}>
        <Tooltip.Root
          open={summaryOpen && !open}
          onOpenChange={(next) => {
            setSummaryOpen(next && !open && !suppressSummary.current);
          }}
        >
          <Dialog.Trigger asChild>
            <Tooltip.Trigger asChild>
              <button
                ref={triggerRef}
                type="button"
                className={triggerClassName}
                aria-label={`Inspect ${label}`}
                onPointerEnter={() => {
                  if (!open) suppressSummary.current = false;
                }}
                onPointerDown={() => {
                  pointerDown.current = true;
                  setSummaryOpen(false);
                }}
                onPointerUp={() => {
                  pointerDown.current = false;
                }}
                onPointerCancel={() => {
                  pointerDown.current = false;
                }}
                onFocus={() => {
                  if (!open && !suppressSummary.current && !pointerDown.current)
                    setSummaryOpen(true);
                }}
                onBlur={() => {
                  pointerDown.current = false;
                  suppressSummary.current = false;
                  setSummaryOpen(false);
                }}
              >
                {trigger}
              </button>
            </Tooltip.Trigger>
          </Dialog.Trigger>
          <Tooltip.Portal container={portalContainer ?? undefined}>
            <Tooltip.Content
              className="inspection-summary"
              side="top"
              align="start"
              sideOffset={10}
              collisionPadding={12}
              onEscapeKeyDown={(event) => {
                event.stopPropagation();
                suppressSummary.current = true;
                setSummaryOpen(false);
              }}
            >
              {summary}
              <div className="inspection-summary-hint">
                Click or press Enter to inspect
              </div>
              <Tooltip.Arrow
                className="inspection-arrow"
                width={12}
                height={6}
              />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
      <Dialog.Portal container={portalContainer ?? undefined}>
        <Dialog.Overlay className="inspection-overlay" />
        <Dialog.Content
          className="inspection-detail"
          onEscapeKeyDown={(event) => event.stopPropagation()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            suppressSummary.current = true;
            pointerDown.current = false;
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          <header className="inspection-heading">
            <div>
              <span className="inspection-eyebrow">INSPECT</span>
              <Dialog.Title>{label}</Dialog.Title>
            </div>
            <Dialog.Close
              className="inspection-close"
              aria-label="Close inspection"
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <Dialog.Description className="inspection-description">
            {description}
          </Dialog.Description>
          {details}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
