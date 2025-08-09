import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';

/**
 * Base Modal component with portal rendering, accessibility, and consistent theming.
 * Provides backdrop, escape key handling, focus management, and animation.
 */

interface ModalProps {
  /** Whether the modal is open */
  isOpen?: boolean;
  /** Modal title displayed in header */
  title?: string;
  /** Callback when modal should close */
  onClose: () => void;
  /** Modal content */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  /** Whether to show close button */
  showCloseButton?: boolean;
  /** Whether to close on backdrop click */
  closeOnBackdrop?: boolean;
  /** Whether to close on escape key */
  closeOnEscape?: boolean;
  /** Custom header content (overrides title) */
  header?: React.ReactNode;
  /** Custom footer content */
  footer?: React.ReactNode;
  /** Loading state */
  loading?: boolean;
  /** Error message to display */
  error?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  full: 'max-w-[95vw]',
};

export function Modal({
  isOpen = false,
  title,
  onClose,
  children,
  className,
  size = 'md',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  header,
  footer,
  loading = false,
  error,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle escape key and focus management
  useEffect(() => {
    if (!isOpen) return;

    // Store previously focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    const handleEscape = (e: KeyboardEvent) => {
      if (closeOnEscape && e.key === 'Escape') {
        onClose();
      }
    };

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Add escape listener
    document.addEventListener('keydown', handleEscape);

    // Focus the modal
    setTimeout(() => {
      modalRef.current?.focus();
    }, 100);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';

      // Restore focus
      if (previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, closeOnEscape, onClose]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <AnimatePresence mode="wait">
      <div className="modal-overlay" onClick={handleBackdropClick}>
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0"
        />

        {/* Modal Content */}
        <div className="flex items-center justify-center min-h-full p-4">
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={cn('modal-content w-full', sizeClasses[size], className)}
            onClick={(e) => e.stopPropagation()}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'modal-title' : undefined}
          >
            {/* Loading Overlay */}
            {loading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-10 rounded-lg">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
              </div>
            )}

            {/* Error Banner */}
            {error && (
              <div
                className="p-3 mb-4 rounded-md border"
                style={{
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  borderColor: 'rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                }}
              >
                <div className="flex items-center text-sm">
                  <span className="mr-2">⚠️</span>
                  {error}
                </div>
              </div>
            )}

            {/* Header */}
            {(header || title || showCloseButton) && (
              <div
                className="flex items-center justify-between p-4 border-b"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                {header ||
                  (title && (
                    <h2
                      id="modal-title"
                      className="text-xl font-bold"
                      style={{
                        fontFamily: 'Cinzel, serif',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {title}
                    </h2>
                  ))}

                {/* Close button */}
                {showCloseButton && (
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
                    style={{
                      backgroundColor: 'var(--card-bg)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-primary)',
                    }}
                    aria-label="Close modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}

            {/* Body */}
            <div className="flex-1">
              <div className="p-6 max-h-[calc(90vh-200px)] overflow-y-auto">
                {children}
              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div
                className="p-4 border-t"
                style={{ borderColor: 'var(--border-primary)' }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}

/**
 * Modal footer with common action buttons
 */
export interface ModalFooterProps {
  /** Primary action button text */
  primaryText?: string;
  /** Primary action callback */
  onPrimary?: () => void;
  /** Primary button disabled state */
  primaryDisabled?: boolean;
  /** Primary button loading state */
  primaryLoading?: boolean;
  /** Secondary action button text */
  secondaryText?: string;
  /** Secondary action callback */
  onSecondary?: () => void;
  /** Cancel button text */
  cancelText?: string;
  /** Cancel callback (defaults to modal close) */
  onCancel?: () => void;
  /** Additional footer content */
  children?: React.ReactNode;
}

export function ModalFooter({
  primaryText,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  secondaryText,
  onSecondary,
  cancelText = 'Cancel',
  onCancel,
  children,
}: ModalFooterProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex-1">{children}</div>

      <div className="flex items-center gap-2">
        {onCancel && (
          <button onClick={onCancel} className="btn-secondary">
            {cancelText}
          </button>
        )}

        {secondaryText && onSecondary && (
          <button onClick={onSecondary} className="btn-secondary">
            {secondaryText}
          </button>
        )}

        {primaryText && onPrimary && (
          <button
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
            className={cn(
              'btn-primary',
              (primaryDisabled || primaryLoading) &&
                'opacity-50 cursor-not-allowed'
            )}
          >
            {primaryLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {primaryText}
              </div>
            ) : (
              primaryText
            )}
          </button>
        )}
      </div>
    </div>
  );
}
