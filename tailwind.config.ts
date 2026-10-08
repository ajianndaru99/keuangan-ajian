import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-main)',
        foreground: 'var(--text-main)',
        'bg-main': 'var(--bg-main)',
        'bg-card': 'var(--bg-card)',
        card: {
          DEFAULT: 'var(--bg-card)',
          border: 'var(--border-color)',
          foreground: 'var(--text-main)',
        },
        'border-card': 'var(--border-color)',
        'text-main': 'var(--text-main)',
        'text-muted': 'var(--text-muted)',
        'accent': 'var(--accent-color)',
        'gridline': '#E2E8F0',
        expense: {
          light: '#fde8ea',
          DEFAULT: '#DC3545',
          muted: '#DC3545',
          dark: '#b02a37',
        },
        income: {
          light: '#e8f5e9',
          DEFAULT: '#198754',
          soft: '#198754',
          dark: '#146c43',
        },
        mint: {
          bg: '#e0f7f1',
          card: '#b2e0d4',
          main: '#004d00',
          muted: '#007a33',
          accent: '#007a33',
        },
        pastel: {
          sky: {
            light: '#e0f2fe',
            DEFAULT: '#38bdf8',
            dark: '#0284c7',
          },
          mint: {
            light: '#ecfdf5',
            DEFAULT: '#34d399',
            dark: '#059669',
          },
          lavender: {
            light: '#f5f3ff',
            DEFAULT: '#a78bfa',
            dark: '#7c3aed',
          },
          rose: {
            light: '#ffe4e6',
            DEFAULT: '#fb7185',
            dark: '#e11d48',
          },
          peach: {
            light: '#fff7ed',
            DEFAULT: '#fb923c',
            dark: '#ea580c',
          },
        },
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      fontFamily: {
        sans: ['var(--font-roboto)', 'Roboto', 'sans-serif'],
        heading: ['var(--font-inter)', 'Inter', 'sans-serif'],
        inter: ['var(--font-inter)', 'Inter', 'sans-serif'],
        roboto: ['var(--font-roboto)', 'Roboto', 'sans-serif'],
      },
      backdropBlur: {
        '2xl': '24px',
        '3xl': '32px',
      }
    },
  },
  plugins: [],
};

export default config;
