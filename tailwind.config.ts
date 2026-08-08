import type { Config } from 'tailwindcss'

/**
 * Theme ported verbatim from the Google Stitch export
 * (design/stitch_macrotrack_health_dashboard) + DESIGN.md.
 *
 * The macro accent colors (carbs/protein/fats) are hardcoded as literals
 * throughout the export; we promote them to named tokens so they're used
 * consistently everywhere.
 *
 * Every role that differs between light and dark points at a CSS variable
 * declared in src/index.css, so `bg-surface` / `text-on-surface` keep working
 * unchanged and the `.dark` class on <html> is the only thing that switches.
 * `rgb(<var> / <alpha-value>)` is what preserves the opacity modifiers
 * (`bg-primary/10`), which a plain `var(--x)` color would break.
 *
 * The Material 3 *fixed* roles are the exception: they are specified to hold
 * the same value in both schemes, so they stay literal.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // --- Fixed roles: identical in both schemes, by definition ---
        'secondary-fixed-dim': '#c4c7c9',
        'on-tertiary-fixed': '#141b2b',
        'tertiary-fixed': '#dce2f7',
        'primary-fixed-dim': '#6bd8cb',
        'on-primary-fixed': '#00201d',
        'tertiary-fixed-dim': '#c0c6db',
        'secondary-fixed': '#e0e3e5',
        'on-secondary-fixed': '#191c1e',
        'on-tertiary-fixed-variant': '#404758',
        'on-secondary-fixed-variant': '#444749',
        'on-primary-fixed-variant': '#005049',

        // --- Scheme-dependent roles ---
        background: token('background'),
        surface: token('surface'),
        'surface-bright': token('surface-bright'),
        'surface-dim': token('surface-dim'),
        'surface-container-lowest': token('surface-container-lowest'),
        'surface-container-low': token('surface-container-low'),
        'surface-container': token('surface-container'),
        'surface-container-high': token('surface-container-high'),
        'surface-container-highest': token('surface-container-highest'),
        'surface-variant': token('surface-variant'),
        'surface-tint': token('surface-tint'),
        'on-background': token('on-background'),
        'on-surface': token('on-surface'),
        'on-surface-variant': token('on-surface-variant'),
        outline: token('outline'),
        'outline-variant': token('outline-variant'),
        primary: token('primary'),
        'on-primary': token('on-primary'),
        'primary-container': token('primary-container'),
        'on-primary-container': token('on-primary-container'),
        /** Hover fill for filled-primary surfaces — darker in light, dimmer in dark. */
        'primary-hover': token('primary-hover'),
        /** Base for low-opacity primary washes: only ever used as `primary-tint/N`. */
        'primary-tint': token('primary-tint'),
        secondary: token('secondary'),
        'on-secondary': token('on-secondary'),
        'secondary-container': token('secondary-container'),
        'on-secondary-container': token('on-secondary-container'),
        tertiary: token('tertiary'),
        'on-tertiary': token('on-tertiary'),
        'tertiary-container': token('tertiary-container'),
        'on-tertiary-container': token('on-tertiary-container'),
        error: token('error'),
        'on-error': token('on-error'),
        'error-container': token('error-container'),
        'on-error-container': token('on-error-container'),
        'inverse-surface': token('inverse-surface'),
        'inverse-on-surface': token('inverse-on-surface'),
        'inverse-primary': token('inverse-primary'),

        // Macro + hydration accents (data visualization only)
        carbs: { DEFAULT: token('carbs'), text: token('carbs-text'), tint: token('carbs-tint') },
        protein: {
          DEFAULT: token('protein'),
          text: token('protein-text'),
          tint: token('protein-tint'),
        },
        fats: { DEFAULT: token('fats'), text: token('fats-text'), tint: token('fats-tint') },
        water: { DEFAULT: token('water'), text: token('water-text'), tint: token('water-tint') },
      },
      borderRadius: {
        // Tailwind defaults already match the export (DEFAULT .25 / lg .5 / xl .75).
        // Cards in DESIGN.md use 1.5rem (24px).
        '2xl': '1.5rem',
      },
      spacing: {
        base: '4px',
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        gutter: '16px',
        'container-margin-mobile': '16px',
        // Safe areas. index.html already sets viewport-fit=cover, so the
        // variables behind these (src/index.css) resolve to the notch /
        // home-indicator insets natively and to 0 on the web, which makes them
        // safe to apply unconditionally.
        // The `0px` fallbacks are not redundant with the ones in the variables:
        // an undefined custom property makes the whole calc() invalid, which
        // drops the padding entirely rather than falling back to zero.
        'safe-top': 'var(--safe-top, 0px)',
        'safe-bottom': 'var(--safe-bottom, 0px)',
        'safe-left': 'var(--safe-left, 0px)',
        'safe-right': 'var(--safe-right, 0px)',
        // The fixed chrome heights plus their inset, for the <main> offsets.
        'topbar': 'calc(72px + var(--safe-top, 0px))',
        'bottomnav': 'calc(80px + var(--safe-bottom, 0px))',
        'fab': 'calc(88px + var(--safe-bottom, 0px))',
        'container-margin-desktop': '40px',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        'body-lg': ['Manrope'],
        'body-md': ['Manrope'],
        'headline-lg': ['Manrope'],
        'headline-lg-mobile': ['Manrope'],
        'headline-md': ['Manrope'],
        'label-md': ['Manrope'],
        'data-display': ['Manrope'],
      },
      fontSize: {
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.05em', fontWeight: '600' }],
        'headline-md': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'data-display': ['40px', { lineHeight: '48px', letterSpacing: '-0.03em', fontWeight: '800' }],
      },
      boxShadow: {
        // Level 1 ambient card shadow from DESIGN.md. Behind a variable
        // (src/index.css) because a 4%-black lift is invisible on a dark page:
        // the dark scheme deepens it and prepends a 1px ring, so `shadow-card`
        // keeps separating cards in both themes without any component knowing.
        card: 'var(--shadow-card)',
        'card-hover': 'var(--shadow-card-hover)',
        sidebar: 'var(--shadow-sidebar)',
        bottomnav: 'var(--shadow-bottomnav)',
      },
      scale: {
        '98': '0.98',
      },
    },
  },
  plugins: [],
} satisfies Config
