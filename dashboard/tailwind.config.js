/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#070c12',
          card: '#0d1520',
          raised: '#111d2e',
          input: '#0a1220',
          hover: '#162236',
          row: '#0f1c2e',
        },
        line: {
          DEFAULT: '#1a2d42',
          light: '#213448',
          focus: '#3b82f6',
        },
        ink: {
          DEFAULT: '#dce8f5',
          secondary: '#7a9ab8',
          muted: '#3d5570',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.4), 0 4px 16px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
}
