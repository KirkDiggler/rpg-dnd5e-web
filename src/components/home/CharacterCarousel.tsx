import type {
  Character,
  CharacterDraft,
} from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/character_pb';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { motion } from 'framer-motion';
import { useListCharacters, useListDrafts } from '../../api/hooks';
import { getClassDisplayName } from '../../utils/displayNames';

// Get class emoji for avatar placeholder
function getClassEmoji(classEnum: Class): string {
  const classEmojis: Record<Class, string> = {
    [Class.UNSPECIFIED]: '👤',
    [Class.BARBARIAN]: '🪓',
    [Class.BARD]: '🎵',
    [Class.CLERIC]: '✝️',
    [Class.DRUID]: '🌿',
    [Class.FIGHTER]: '⚔️',
    [Class.MONK]: '👊',
    [Class.PALADIN]: '🛡️',
    [Class.RANGER]: '🏹',
    [Class.ROGUE]: '🗡️',
    [Class.SORCERER]: '✨',
    [Class.WARLOCK]: '👁️',
    [Class.WIZARD]: '🧙',
  };
  return classEmojis[classEnum] || '👤';
}

interface CharacterCarouselProps {
  playerId: string;
  sessionId: string;
  selectedId: string | null;
  onSelect: (id: string, type: 'character' | 'draft') => void;
  onCreateClick: () => void;
}

type CarouselItem =
  | { type: 'character'; data: Character; id: string }
  | { type: 'draft'; data: CharacterDraft; id: string }
  | { type: 'create'; id: string };

export function CharacterCarousel({
  playerId,
  sessionId,
  selectedId,
  onSelect,
  onCreateClick,
}: CharacterCarouselProps) {
  const {
    data: characters,
    loading: charactersLoading,
    error: charactersError,
  } = useListCharacters({ playerId, sessionId });

  const {
    data: drafts,
    loading: draftsLoading,
    error: draftsError,
  } = useListDrafts({ playerId, sessionId });

  const loading = charactersLoading || draftsLoading;
  const error = charactersError || draftsError;

  // Build carousel items: characters first (filter out level 0), then drafts, then create card
  const items: CarouselItem[] = [
    ...characters
      .filter((c) => c.level > 0) // Exclude incomplete characters
      .map((c) => ({
        type: 'character' as const,
        data: c,
        id: c.id,
      })),
    ...drafts.map((d) => ({ type: 'draft' as const, data: d, id: d.id })),
    { type: 'create' as const, id: 'create' },
  ];

  // Find selected index
  const selectedIndex = selectedId
    ? items.findIndex((item) => item.id === selectedId)
    : items.length > 1
      ? 0
      : -1; // Default to first character if none selected

  // Reorder items to center the selected one
  const reorderedItems = (() => {
    if (items.length === 0) return [];

    const result: (CarouselItem & { originalIndex: number })[] = [];
    const totalItems = items.length;
    const halfLength = Math.floor(totalItems / 2);
    const centerIndex = selectedIndex >= 0 ? selectedIndex : 0;

    for (let i = 0; i < totalItems; i++) {
      const offset = i - halfLength;
      const index = (centerIndex + offset + totalItems) % totalItems;
      result.push({ ...items[index], originalIndex: index });
    }

    return result;
  })();

  // Calculate scale and opacity based on position from center
  const getItemStyles = (position: number) => {
    const centerPosition = Math.floor(items.length / 2);
    const distance = Math.abs(position - centerPosition);

    if (distance === 0) {
      return { scale: 1.15, opacity: 1, zIndex: 10 };
    } else if (distance === 1) {
      return { scale: 0.85, opacity: 0.75, zIndex: 5 };
    } else if (distance === 2) {
      return { scale: 0.7, opacity: 0.5, zIndex: 3 };
    } else {
      return { scale: 0.6, opacity: 0.3, zIndex: 1 };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-t-transparent rounded-full"
          style={{
            borderColor: 'var(--accent-primary)',
            borderTopColor: 'transparent',
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-center py-12 px-6 rounded-lg"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <p style={{ color: 'var(--text-muted)' }}>Failed to load characters</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-6 py-3 rounded-lg text-lg font-medium"
          style={{
            backgroundColor: 'var(--accent-primary)',
            color: 'white',
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  const handleItemClick = (item: CarouselItem & { originalIndex: number }) => {
    if (item.type === 'create') {
      onCreateClick();
    } else {
      onSelect(item.id, item.type);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '20px 0',
        position: 'relative',
        minHeight: '180px',
        overflow: 'hidden',
      }}
    >
      {reorderedItems.map((item, position) => {
        const styles = getItemStyles(position);
        const isSelected =
          item.id === selectedId ||
          (selectedId === null &&
            position === Math.floor(items.length / 2) &&
            item.type !== 'create');

        const ariaLabel =
          item.type === 'create'
            ? 'Create new character'
            : item.type === 'draft'
              ? `Continue draft: ${item.data.name || 'Unnamed'}`
              : `Select character: ${item.data.name}`;

        return (
          <motion.button
            key={item.id}
            onClick={() => handleItemClick(item)}
            aria-label={ariaLabel}
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
              border:
                item.type === 'draft'
                  ? `2px dashed ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`
                  : `2px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
              borderRadius: '16px',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '20px 24px',
              position: 'relative',
              zIndex: styles.zIndex,
              minWidth: '120px',
              flexShrink: 0,
              transition: 'border-color 0.3s ease',
            }}
          >
            {/* Emoji/Icon */}
            <div style={{ fontSize: '48px', lineHeight: 1 }}>
              {item.type === 'create'
                ? '➕'
                : item.type === 'draft'
                  ? item.data.class
                    ? getClassEmoji(item.data.class)
                    : '❓'
                  : getClassEmoji(item.data.class)}
            </div>

            {/* Name */}
            <div
              style={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: isSelected ? 'white' : 'var(--text-primary)',
                fontFamily: 'Cinzel, serif',
                whiteSpace: 'nowrap',
                maxWidth: '100px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {item.type === 'create'
                ? 'Create'
                : item.type === 'draft'
                  ? item.data.name || 'Draft'
                  : item.data.name}
            </div>

            {/* Subtitle */}
            {item.type !== 'create' && (
              <div
                style={{
                  fontSize: '11px',
                  color: isSelected
                    ? 'rgba(255,255,255,0.8)'
                    : 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.type === 'draft'
                  ? 'In Progress'
                  : `Lv${item.data.level} ${getClassDisplayName(item.data.class)}`}
              </div>
            )}

            {/* Draft badge */}
            {item.type === 'draft' && (
              <div
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  background: 'var(--warning)',
                  color: 'black',
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                }}
              >
                DRAFT
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
