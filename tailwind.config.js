/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        g: {
          50: '#f0fdf4',
          100: '#dcfce7',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        lime: { 400: '#a3e635', 500: '#84cc16' },
        ink: { 900: '#0c0f0a', 950: '#070a06' },
      },
      fontFamily: {
        display: ["'Fredoka One'", 'cursive'],
        body: ["'Outfit'", 'sans-serif'],
        mono: ["'JetBrains Mono'", 'monospace'],
      },
      animation: {
        'hop': 'hop 2.4s ease-in-out infinite',
        'hop-delay': 'hop 2.4s ease-in-out 0.8s infinite',
        'sway': 'sway 3s ease-in-out infinite',
        'fall-in': 'fallIn 0.5s cubic-bezier(0.22,1,0.36,1) forwards',
        'slide-up': 'slideUp 0.4s ease forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        hop: {
          '0%,100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-10px)' },
          '60%': { transform: 'translateY(-6px)' },
        },
        sway: {
          '0%,100%': { transform: 'rotate(-1.5deg)' },
          '50%': { transform: 'rotate(1.5deg)' },
        },
        fallIn: {
          '0%': { opacity: '0', transform: 'translateY(-20px) scale(0.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%,100%': { boxShadow: '0 0 0 0 rgba(34,197,94,0)' },
          '50%': { boxShadow: '0 0 20px 4px rgba(34,197,94,0.25)' },
        },
      },
      boxShadow: {
        'pond': '0 0 40px rgba(34,197,94,0.08)',
        'lily': '0 0 16px rgba(163,230,53,0.25)',
        'inner-pond': 'inset 0 1px 0 rgba(134,239,172,0.08)',
      },
    },
  },
  plugins: [],
}
