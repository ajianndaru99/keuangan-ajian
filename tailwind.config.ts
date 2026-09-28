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
        background: 'var(--background)',
        foreground: 'var(--foreground)',
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
        expense: {
          light: '#ffe4e6',
          DEFAULT: '#f43f5e',
          dark: '#e11d48',
        },
        income: {
          light: '#dcfce7',
          DEFAULT: '#10b981',
          dark: '#059669',
        }
      },
      borderRadius: {
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
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
