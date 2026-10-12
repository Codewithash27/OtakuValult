/** @type {import('tailwindcss').Config} */

// "Lantern Night" theme: festival-lantern amber, jade teal and torii vermilion.
// The old violet/pink/fuchsia/purple/rose utilities are remapped so every component picks it up.
const lantern = {
  50: '#fff8eb', 100: '#ffecc6', 200: '#ffd688', 300: '#ffbb4a', 400: '#ffa21f',
  500: '#f98a07', 600: '#dd6602', 700: '#b74606', 800: '#94360c', 900: '#7a2d0d', 950: '#461402',
}
const jade = {
  50: '#effefa', 100: '#c8fff1', 200: '#92fee4', 300: '#53f5d5', 400: '#20e0c0',
  500: '#07c4a8', 600: '#029e8a', 700: '#077e71', 800: '#0b645b', 900: '#0e534c', 950: '#01322f',
}
const vermilion = {
  50: '#fff3ef', 100: '#ffe4dc', 200: '#ffcbbd', 300: '#ffa58e', 400: '#ff6f4f',
  500: '#f84a25', 600: '#e5300b', 700: '#c02408', 800: '#9e210d', 900: '#822112', 950: '#470c04',
}

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        lantern,
        jade,
        vermilion,
        violet: lantern,
        purple: lantern,
        fuchsia: jade,
        pink: jade,
        rose: vermilion,
        ink: { 900: '#0b1220', 950: '#060a12' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Space Grotesk"', 'system-ui', 'sans-serif'],
        jp: ['"Zen Kaku Gothic New"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(16px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fadeUp .6s cubic-bezier(.22,1,.36,1) both',
        float: 'float 6s ease-in-out infinite',
        shimmer: 'shimmer 3s linear infinite',
      },
    },
  },
  plugins: [],
}
