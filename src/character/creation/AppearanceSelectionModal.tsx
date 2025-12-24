/**
 * AppearanceSelectionModal - Modal for customizing character appearance
 *
 * Features:
 * - Left panel: Color controls (skin tone, armor colors, eye color)
 * - Right panel: Live 3D preview of the character
 */

import { AppearanceEditor } from '@/components/AppearanceEditor';
import { MediumHumanoid } from '@/components/hex-grid/MediumHumanoid';
import type { CharacterAppearance } from '@/config/appearancePresets';
import { DEFAULT_APPEARANCE } from '@/config/appearancePresets';
import { Class } from '@kirkdiggler/rpg-api-protos/gen/ts/dnd5e/api/v1alpha1/enums_pb';
import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Helper to get CSS variable values for portals
function getCSSVariable(name: string, fallback: string): string {
  if (typeof window !== 'undefined') {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  }
  return fallback;
}

interface AppearanceSelectionModalProps {
  isOpen: boolean;
  currentAppearance?: Partial<CharacterAppearance>;
  characterClass?: Class;
  onConfirm: (appearance: CharacterAppearance) => void;
  onClose: () => void;
}

function CharacterPreview({
  appearance,
  characterClass,
}: {
  appearance: CharacterAppearance;
  characterClass?: Class;
}) {
  return (
    <Canvas
      camera={{ position: [0, 1.5, 3], fov: 45 }}
      style={{ background: 'transparent' }}
    >
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <directionalLight position={[-5, 3, -5]} intensity={0.3} />

      <Suspense fallback={null}>
        <group position={[0, -0.8, 0]}>
          <MediumHumanoid
            scale={0.012}
            characterClass={characterClass || Class.FIGHTER}
            skinTone={appearance.skinTone}
            primaryColor={appearance.primaryColor}
            secondaryColor={appearance.secondaryColor}
            eyeColor={appearance.eyeColor}
            facingRotation={0}
          />
        </group>
      </Suspense>

      <OrbitControls
        enablePan={false}
        enableZoom={true}
        minDistance={2}
        maxDistance={5}
        target={[0, 0.5, 0]}
      />
    </Canvas>
  );
}

export function AppearanceSelectionModal({
  isOpen,
  currentAppearance,
  characterClass,
  onConfirm,
  onClose,
}: AppearanceSelectionModalProps) {
  const [appearance, setAppearance] = useState<CharacterAppearance>({
    skinTone: currentAppearance?.skinTone || DEFAULT_APPEARANCE.skinTone,
    primaryColor:
      currentAppearance?.primaryColor || DEFAULT_APPEARANCE.primaryColor,
    secondaryColor:
      currentAppearance?.secondaryColor || DEFAULT_APPEARANCE.secondaryColor,
    eyeColor: currentAppearance?.eyeColor || DEFAULT_APPEARANCE.eyeColor,
  });

  // Sync with prop changes
  useEffect(() => {
    if (currentAppearance) {
      setAppearance({
        skinTone: currentAppearance.skinTone || DEFAULT_APPEARANCE.skinTone,
        primaryColor:
          currentAppearance.primaryColor || DEFAULT_APPEARANCE.primaryColor,
        secondaryColor:
          currentAppearance.secondaryColor || DEFAULT_APPEARANCE.secondaryColor,
        eyeColor: currentAppearance.eyeColor || DEFAULT_APPEARANCE.eyeColor,
      });
    }
  }, [currentAppearance]);

  const handleConfirm = () => {
    onConfirm(appearance);
    onClose();
  };

  if (!isOpen) return null;

  // Inline styles for the portal elements
  const overlayStyles: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    backdropFilter: 'blur(4px)',
  };

  const modalStyles: React.CSSProperties = {
    backgroundColor: getCSSVariable('--bg-primary', '#1a1a1a'),
    maxWidth: '900px',
    width: '90%',
    maxHeight: '85vh',
    borderRadius: '8px',
    border: `2px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    color: getCSSVariable('--text-primary', '#ffffff'),
  };

  const headerStyles: React.CSSProperties = {
    padding: '1.5rem',
    borderBottom: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  };

  const contentStyles: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    minHeight: '400px',
  };

  const leftPanelStyles: React.CSSProperties = {
    width: '320px',
    borderRight: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    padding: '1.5rem',
    overflowY: 'auto',
  };

  const rightPanelStyles: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: getCSSVariable('--bg-secondary', '#2a2a2a'),
    position: 'relative',
  };

  const previewContainerStyles: React.CSSProperties = {
    flex: 1,
    position: 'relative',
  };

  const previewLabelStyles: React.CSSProperties = {
    position: 'absolute',
    bottom: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '0.75rem',
    color: getCSSVariable('--text-muted', '#666'),
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: '0.25rem 0.75rem',
    borderRadius: '4px',
  };

  const footerStyles: React.CSSProperties = {
    padding: '1rem 1.5rem',
    borderTop: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
  };

  const buttonStyles: React.CSSProperties = {
    padding: '0.5rem 1rem',
    borderRadius: '4px',
    fontSize: '0.875rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  };

  const cancelButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: 'transparent',
    border: `1px solid ${getCSSVariable('--border-primary', '#333')}`,
    color: getCSSVariable('--text-primary', '#ffffff'),
  };

  const confirmButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    backgroundColor: getCSSVariable('--accent-primary', '#5865F2'),
    border: 'none',
    color: 'white',
  };

  return createPortal(
    <div style={overlayStyles} onClick={onClose}>
      <div style={modalStyles} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyles}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>
            Customize Appearance
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: getCSSVariable('--text-muted', '#999'),
              fontSize: '1.5rem',
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={contentStyles}>
          <div style={leftPanelStyles}>
            <AppearanceEditor
              appearance={appearance}
              onChange={setAppearance}
            />
          </div>

          <div style={rightPanelStyles}>
            <div style={previewContainerStyles}>
              <CharacterPreview
                appearance={appearance}
                characterClass={characterClass}
              />
              <div style={previewLabelStyles}>Drag to rotate</div>
            </div>
          </div>
        </div>

        <div style={footerStyles}>
          <button
            onClick={onClose}
            style={cancelButtonStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = getCSSVariable(
                '--bg-secondary',
                '#2a2a2a'
              );
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={confirmButtonStyles}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = getCSSVariable(
                '--accent-hover',
                '#4752C4'
              );
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = getCSSVariable(
                '--accent-primary',
                '#5865F2'
              );
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
