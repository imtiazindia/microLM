import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#172033',
        runway: '#36506f',
        tower: '#12646f',
        signal: '#c67a22',
        panel: '#f7f9fb'
      },
      boxShadow: {
        panel: '0 16px 40px rgba(23, 32, 51, 0.08)'
      }
    }
  },
  plugins: []
} satisfies Config;
