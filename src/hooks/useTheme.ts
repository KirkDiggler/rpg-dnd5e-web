import { useCallback, useEffect, useState } from 'react';

export interface Theme {
  id: string;
  name: string;
  description: string;
  preview: string; // Hex color for preview
}

export const themes: Theme[] = [
  {
    id: 'dark-fantasy',
    name: 'Modern Dark Fantasy',
    description: 'Sleek modern design with electric blue accents',
    preview: '#3b82f6',
  },
  {
    id: 'arcane',
    name: 'Mystical Arcane',
    description: 'Magical purple and cyan with mystical energy',
    preview: '#8b5cf6',
  },
  {
    id: 'dungeon',
    name: 'Dungeon Stone',
    description: 'Underground atmosphere with torchlight warmth',
    preview: '#ea580c',
  },
];

const THEME_STORAGE_KEY = 'rpg-dnd5e-theme';
const DEFAULT_THEME = 'dark-fantasy';

export function useTheme() {
  const [currentTheme, setCurrentTheme] = useState<string>(DEFAULT_THEME);
  const [isLoading, setIsLoading] = useState(true);

  // Load theme from localStorage on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme && themes.find((t) => t.id === savedTheme)) {
      setCurrentTheme(savedTheme);
    }
    setIsLoading(false);
  }, []);

  // Load theme CSS file
  const loadTheme = useCallback(async (themeId: string) => {
    try {
      // Remove existing theme stylesheets
      const existingThemes = document.querySelectorAll('link[data-theme]');
      existingThemes.forEach((link) => link.remove());

      // Load base styles if not already loaded
      if (!document.querySelector('link[data-theme="base"]')) {
        const baseLink = document.createElement('link');
        baseLink.rel = 'stylesheet';
        baseLink.href = `/themes/base.css`;
        baseLink.setAttribute('data-theme', 'base');
        document.head.appendChild(baseLink);
      }

      // Load theme-specific styles
      const themeLink = document.createElement('link');
      themeLink.rel = 'stylesheet';
      themeLink.href = `/themes/${themeId}.css`;
      themeLink.setAttribute('data-theme', themeId);
      document.head.appendChild(themeLink);

      // Wait for stylesheet to load
      await new Promise<void>((resolve) => {
        themeLink.onload = () => resolve();
        themeLink.onerror = () => resolve(); // Don't fail if theme doesn't load
      });
    } catch (error) {
      console.error('Failed to load theme:', error);
    }
  }, []);

  // Change theme
  const changeTheme = useCallback(
    async (themeId: string) => {
      if (!themes.find((t) => t.id === themeId)) {
        console.error('Theme not found:', themeId);
        return;
      }

      setCurrentTheme(themeId);
      localStorage.setItem(THEME_STORAGE_KEY, themeId);
      await loadTheme(themeId);
    },
    [loadTheme]
  );

  // Load initial theme
  useEffect(() => {
    if (!isLoading) {
      loadTheme(currentTheme);
    }
  }, [currentTheme, isLoading, loadTheme]);

  return {
    currentTheme,
    themes,
    changeTheme,
    isLoading,
    getCurrentTheme: () => themes.find((t) => t.id === currentTheme),
  };
}
