import { Button } from './Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './Dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
}

/**
 * Reusable confirmation dialog
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription
          className="text-base mb-6"
          style={{ color: 'var(--text-muted)' }}
        >
          {description}
        </DialogDescription>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={handleCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant === 'danger' ? 'primary' : 'primary'}
            onClick={handleConfirm}
            disabled={loading}
            className={
              confirmVariant === 'danger' ? 'bg-red-600 hover:bg-red-500' : ''
            }
          >
            {loading ? 'Loading...' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
