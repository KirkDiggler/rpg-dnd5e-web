import { createPortal } from 'react-dom';

interface TestModalProps {
  onClose: () => void;
}

export function TestModal({ onClose }: TestModalProps) {
  const modalContent = (
    <div
      className="fixed inset-0 bg-red-500 bg-opacity-50 flex items-center justify-center"
      style={{ zIndex: 9999 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white p-8 rounded-lg shadow-xl max-w-md w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-bold mb-4 text-black">Test Modal</h2>
        <p className="text-black mb-4">
          This is a test modal to verify portals are working.
        </p>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Close Test Modal
        </button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
