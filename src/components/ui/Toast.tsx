/* eslint-disable react-refresh/only-export-components */
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'critical';
  duration?: number;
}

// External store for toasts (survives React StrictMode)
let toasts: Toast[] = [];
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return toasts;
}

function addToast(toast: Omit<Toast, 'id'>) {
  const id = crypto.randomUUID();
  const newToast = { ...toast, id };

  // Clear existing toasts when a new one arrives (keep only the new one)
  toasts = [newToast];
  emitChange();

  // Only auto-dismiss if duration > 0
  const duration = toast.duration ?? 4000;
  if (duration > 0) {
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id);
      emitChange();
    }, duration);
  }
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emitChange();
}

interface ToastContextValue {
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  addToast,
  removeToast,
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const currentToasts = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot
  );

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={currentToasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div
      style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const toastStyles: Record<
  Toast['type'],
  { bg: string; border: string; gradient?: string }
> = {
  success: {
    bg: '#16a34a',
    border: '#22c55e',
  },
  error: {
    bg: '#4b5563',
    border: '#6b7280',
  },
  info: {
    bg: '#2563eb',
    border: '#3b82f6',
  },
  critical: {
    bg: '#f59e0b',
    border: '#fbbf24',
    gradient: 'linear-gradient(to right, #f59e0b, #ea580c)',
  },
};

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const styles = toastStyles[toast.type];

  const handleRemove = useCallback(() => {
    onRemove(toast.id);
  }, [onRemove, toast.id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100, scale: 0.8 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 100, scale: 0.8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      style={{
        pointerEvents: 'auto',
        borderRadius: '8px',
        border: `2px solid ${styles.border}`,
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        padding: '12px 48px 12px 16px',
        minWidth: '300px',
        maxWidth: '400px',
        position: 'relative',
        overflow: 'hidden',
        background: styles.gradient || styles.bg,
        color: 'white',
      }}
    >
      {/* Shimmer effect for critical hits */}
      {toast.type === 'critical' && (
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(to right, transparent, rgba(255,255,255,0.3), transparent)',
            pointerEvents: 'none',
          }}
          initial={{ x: '-100%' }}
          animate={{ x: '100%' }}
          transition={{
            duration: 0.6,
            repeat: 2,
            ease: 'easeInOut',
          }}
        />
      )}

      {/* Message */}
      <div
        style={{
          fontWeight: 500,
          fontSize: '14px',
          position: 'relative',
          zIndex: 10,
          whiteSpace: 'pre-line',
        }}
      >
        {toast.message}
      </div>

      {/* Close button */}
      <button
        onClick={handleRemove}
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          opacity: 0.7,
          cursor: 'pointer',
          background: 'none',
          border: 'none',
          color: 'white',
          zIndex: 20,
        }}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </motion.div>
  );
}
