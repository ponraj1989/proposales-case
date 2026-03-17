import type { Config } from 'tailwindcss';
import proposalesPreset from '@proposales/theme/tailwind-preset';

const config: Config = {
  presets: [proposalesPreset as Partial<Config>],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
