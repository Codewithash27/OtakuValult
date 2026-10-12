/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin'

// Two moods. Clean = "Lantern Night" (amber / jade / vermilion).
// Creamy = "After Dark" (crimson / candle-gold / wine). Palettes are CSS variables
// so html[data-mode="creamy"] re-themes every utility without touching components.
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

const night = {
  lantern: ['#fff8eb', '#ffecc6', '#ffd688', '#ffbb4a', '#ffa21f', '#f98a07', '#dd6602', '#b74606', '#94360c', '#7a2d0d', '#461402'],
  jade: ['#effefa', '#c8fff1', '#92fee4', '#53f5d5', '#20e0c0', '#07c4a8', '#029e8a', '#077e71', '#0b645b', '#0e534c', '#01322f'],
  vermilion: ['#fff3ef', '#ffe4dc', '#ffcbbd', '#ffa58e', '#ff6f4f', '#f84a25', '#e5300b', '#c02408', '#9e210d', '#822112', '#470c04'],
}
const afterDark = {
  lantern: ['#fff1f1', '#ffe0e0', '#fecaca', '#fc9c9c', '#f46262', '#e23434', '#c21f1f', '#a01a1a', '#831a1a', '#6c1a1a', '#3c0808'],
  jade: ['#fffbeb', '#fef3c7', '#fde68a', '#fcd34d', '#fbbf24', '#f0a50b', '#d17f06', '#ad5d09', '#8c480e', '#733b0f', '#431e03'],
  vermilion: ['#fdf2f6', '#fbe4ee', '#f5c2d6', '#e894b4', '#d35f8a', '#b83a68', '#9b2752', '#801f44', '#6a1d3b', '#5a1b34', '#33081a'],
}

const triplet = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}
const varsFor = (palettes) =>
  Object.fromEntries(
    Object.entries(palettes).flatMap(([name, list]) => list.map((hex, i) => [`--${name}-${SHADES[i]}`, triplet(hex)]))
  )
const varPalette = (name) => Object.fromEntries(SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]))

const lantern = varPalette('lantern')
const jade = varPalette('jade')
const vermilion = varPalette('vermilion')

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
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
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
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': varsFor(night), 'html[data-mode="creamy"]': varsFor(afterDark) })
    }),
  ],
}
