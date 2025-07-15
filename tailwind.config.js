/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Board game inspired colors
        board: {
          primary: '#2C1810', // Dark wood
          secondary: '#4A2C1A', // Medium wood
          accent: '#8B5A3C', // Light wood
          border: '#D4A574', // Gold trim
        },
        parchment: {
          light: '#F4E8D0',
          base: '#E8D7B3',
          dark: '#D4C5A0',
        },
        ink: {
          black: '#1A1612',
          brown: '#3E2F1F',
          sepia: '#5C4033',
        },
        // Game elements
        health: '#C41E3A',
        mana: '#1E88E5',
        stamina: '#FFC107',
        experience: '#9C27B0',
        // Rarity colors
        common: '#9E9E9E',
        uncommon: '#4CAF50',
        rare: '#2196F3',
        epic: '#9C27B0',
        legendary: '#FF6F00',
      },
      fontFamily: {
        game: ['Cinzel', 'serif'],
        body: ['Crimson Text', 'serif'],
        mono: ['Courier Prime', 'monospace'],
      },
      boxShadow: {
        board:
          '0 4px 6px -1px rgba(44, 24, 16, 0.3), 0 2px 4px -1px rgba(44, 24, 16, 0.2)',
        card: '0 10px 15px -3px rgba(44, 24, 16, 0.4), 0 4px 6px -2px rgba(44, 24, 16, 0.3)',
      },
      animation: {
        'dice-roll': 'dice-roll 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55)',
        'card-flip': 'card-flip 0.6s ease-in-out',
        glow: 'glow 2s ease-in-out infinite',
      },
      keyframes: {
        'dice-roll': {
          '0%': { transform: 'rotate(0deg) scale(1)' },
          '50%': { transform: 'rotate(180deg) scale(1.2)' },
          '100%': { transform: 'rotate(360deg) scale(1)' },
        },
        'card-flip': {
          '0%': { transform: 'rotateY(0deg)' },
          '100%': { transform: 'rotateY(180deg)' },
        },
        glow: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
