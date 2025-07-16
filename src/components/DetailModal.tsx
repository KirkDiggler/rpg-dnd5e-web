import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useSwipeable } from 'react-swipeable';

export interface DetailModalItem {
  id: string;
  title: string;
  content: React.ReactNode;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: DetailModalItem[];
  initialItemId?: string;
  showNavigation?: boolean;
  enableSwipe?: boolean;
  onItemChange?: (itemId: string, index: number) => void;
  className?: string;
}

export function DetailModal({
  isOpen,
  onClose,
  items,
  initialItemId,
  showNavigation = true,
  enableSwipe = true,
  onItemChange,
  className = '',
}: DetailModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Set initial item index
  useEffect(() => {
    if (initialItemId) {
      const index = items.findIndex((item) => item.id === initialItemId);
      if (index !== -1) {
        setCurrentIndex(index);
      }
    } else {
      setCurrentIndex(0);
    }
  }, [initialItemId, items]);

  // Notify parent of item changes
  useEffect(() => {
    if (isOpen && items[currentIndex] && onItemChange) {
      onItemChange(items[currentIndex].id, currentIndex);
    }
  }, [currentIndex, isOpen, items, onItemChange]);

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleNext = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        onClose();
        break;
      case 'ArrowLeft':
        handlePrevious();
        break;
      case 'ArrowRight':
        handleNext();
        break;
    }
  };

  // Swipe handlers
  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleNext,
    onSwipedRight: handlePrevious,
    preventScrollOnSwipe: true,
    trackMouse: true,
  });

  // Scroll to current item
  useEffect(() => {
    if (carouselRef.current) {
      const itemWidth = carouselRef.current.scrollWidth / items.length;
      carouselRef.current.scrollTo({
        left: itemWidth * currentIndex,
        behavior: 'smooth',
      });
    }
  }, [currentIndex, items.length]);

  if (!isOpen || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < items.length - 1;

  return (
    <AnimatePresence>
      <div className="detail-modal" onKeyDown={handleKeyDown} tabIndex={-1}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="absolute inset-0"
          onClick={onClose}
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className={`detail-modal-content ${className}`}
          onClick={(e) => e.stopPropagation()}
          {...(enableSwipe ? swipeHandlers : {})}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-opacity-20">
            <h2
              className="text-2xl font-bold font-serif truncate"
              style={{ color: 'var(--text-primary)' }}
            >
              {currentItem.title}
            </h2>

            <div className="flex items-center gap-2">
              {/* Item counter */}
              {items.length > 1 && (
                <span
                  className="text-sm px-2 py-1 rounded-full"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-primary)',
                  }}
                >
                  {currentIndex + 1} of {items.length}
                </span>
              )}

              {/* Close button */}
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{
                  backgroundColor: 'var(--card-bg)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Carousel */}
          <div className="relative flex-1 overflow-hidden">
            <div
              ref={carouselRef}
              className="detail-modal-carousel h-full"
              style={{
                scrollSnapType: 'x mandatory',
                scrollBehavior: 'smooth',
              }}
            >
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="detail-modal-item"
                  style={{
                    opacity: index === currentIndex ? 1 : 0.5,
                    transform: `translateX(${(index - currentIndex) * 100}%)`,
                    transition: 'opacity 0.3s ease, transform 0.3s ease',
                  }}
                >
                  {/* Image */}
                  {item.imageUrl && (
                    <div className="w-full h-48 mb-4 rounded-lg overflow-hidden">
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Content */}
                  <div className="prose prose-sm max-w-none">
                    {item.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Navigation arrows */}
            {showNavigation && items.length > 1 && (
              <>
                <button
                  onClick={handlePrevious}
                  disabled={!canGoPrevious}
                  className="absolute left-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    border: '2px solid var(--border-primary)',
                    boxShadow: 'var(--shadow-button)',
                  }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                <button
                  onClick={handleNext}
                  disabled={!canGoNext}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: 'var(--card-bg)',
                    color: 'var(--text-primary)',
                    border: '2px solid var(--border-primary)',
                    boxShadow: 'var(--shadow-button)',
                  }}
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* Bottom navigation dots */}
          {items.length > 1 && (
            <div className="flex justify-center gap-2 p-4">
              {items.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentIndex(index)}
                  className="w-3 h-3 rounded-full transition-all duration-200"
                  style={{
                    backgroundColor:
                      index === currentIndex
                        ? 'var(--accent-primary)'
                        : 'var(--border-primary)',
                    opacity: index === currentIndex ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
