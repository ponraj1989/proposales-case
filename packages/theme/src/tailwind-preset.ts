import type { Config } from 'tailwindcss';
import { colors } from './colors';
import { typography } from './typography';

const proposalesPreset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: colors.primary,
        gray: colors.gray,
        success: colors.success,
        warning: colors.warning,
        error: colors.error,
        background: colors.gray[50],
        surface: '#FFFFFF',
        border: colors.gray[200],
        'text-primary': colors.primary[900],
        'text-muted': colors.gray[500],
      },
      fontFamily: typography.fontFamily,
      borderRadius: {
        card: '0.75rem',
        button: '0.5rem',
        input: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0, 0, 0, 0.08), 0 1px 2px -1px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 12px -2px rgba(0, 0, 0, 0.12), 0 2px 4px -2px rgba(0, 0, 0, 0.08)',
        modal: '0 20px 60px -12px rgba(0, 0, 0, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        shimmer: 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
};

export default proposalesPreset;
