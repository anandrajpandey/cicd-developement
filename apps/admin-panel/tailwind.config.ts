import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#03131a',
        forest: '#0a1b28',
        panel: '#0c1f31',
        mist: '#d9ebfa',
        mint: '#6df2a3',
        signal: '#2ee3a0',
        glow: '#103527',
        line: '#29455d',
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(109,242,163,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(109,242,163,0.08) 1px, transparent 1px)',
      },
      fontFamily: {
        sans: ['var(--font-orbitron)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
