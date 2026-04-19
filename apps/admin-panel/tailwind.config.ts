import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#07130f',
        forest: '#0d2018',
        panel: '#11271d',
        mist: '#d7f7dd',
        mint: '#6df2a3',
        signal: '#33c46c',
        glow: '#163c2b',
        line: '#254634',
      },
      boxShadow: {
        panel: '0 24px 80px rgba(0, 0, 0, 0.35)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(109,242,163,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(109,242,163,0.08) 1px, transparent 1px)',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
