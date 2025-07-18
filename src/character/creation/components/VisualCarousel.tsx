import { motion } from 'framer-motion';
import { useRef } from 'react';

interface VisualCarouselProps {
  items: Array<{
    name: string;
    emoji: string;
  }>;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function VisualCarousel({
  items,
  selectedIndex,
  onSelect,
}: VisualCarouselProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Reorder items to center the selected one
  const reorderedItems = (() => {
    const result = [];
    const totalItems = items.length;
    const halfLength = Math.floor(totalItems / 2);

    // Start from selected index and wrap around
    for (let i = 0; i < totalItems; i++) {
      const offset = i - halfLength;
      const index = (selectedIndex + offset + totalItems) % totalItems;
      result.push({ ...items[index], originalIndex: index });
    }

    return result;
  })();

  // Calculate scale and opacity based on position from center
  const getItemStyles = (position: number) => {
    const centerPosition = Math.floor(items.length / 2);
    const distance = Math.abs(position - centerPosition);

    if (distance === 0) {
      // Selected item - largest
      return {
        scale: 1.2,
        opacity: 1,
        zIndex: 10,
        fontSize: '48px',
        padding: '20px',
      };
    } else if (distance === 1) {
      // Adjacent items - medium
      return {
        scale: 0.9,
        opacity: 0.8,
        zIndex: 5,
        fontSize: '36px',
        padding: '16px',
      };
    } else if (distance === 2) {
      // Two away - smaller
      return {
        scale: 0.7,
        opacity: 0.6,
        zIndex: 3,
        fontSize: '28px',
        padding: '12px',
      };
    } else {
      // Far items - smallest
      return {
        scale: 0.6,
        opacity: 0.4,
        zIndex: 1,
        fontSize: '24px',
        padding: '10px',
      };
    }
  };

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '20px 0',
        position: 'relative',
        minHeight: '120px',
        overflow: 'hidden',
      }}
    >
      {reorderedItems.map((item, position) => {
        const styles = getItemStyles(position);
        const isSelected = item.originalIndex === selectedIndex;

        return (
          <motion.button
            key={`${item.name}-${item.originalIndex}`}
            onClick={() => onSelect(item.originalIndex)}
            animate={{
              scale: styles.scale,
              opacity: styles.opacity,
            }}
            transition={{
              duration: 0.3,
              ease: 'easeInOut',
            }}
            style={{
              background: isSelected
                ? 'var(--accent-primary)'
                : 'var(--bg-secondary)',
              border: `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              padding: styles.padding,
              position: 'relative',
              zIndex: styles.zIndex,
              minWidth: 'fit-content',
              flexShrink: 0,
              transition: 'all 0.3s ease',
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                e.currentTarget.style.transform = `scale(${styles.scale * 1.1})`;
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.borderColor = 'var(--border-primary)';
                e.currentTarget.style.transform = `scale(${styles.scale})`;
              }
            }}
          >
            <div style={{ fontSize: styles.fontSize, lineHeight: 1 }}>
              {item.emoji}
            </div>
            <div
              style={{
                fontSize: `${parseInt(styles.fontSize) * 0.3}px`,
                fontWeight: isSelected ? 'bold' : 'normal',
                color: isSelected ? 'white' : 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
                whiteSpace: 'nowrap',
              }}
            >
              {item.name}
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
