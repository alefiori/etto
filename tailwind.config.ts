import type { Config } from 'tailwindcss'

/**
 * Theme ported verbatim from the Google Stitch export
 * (design/stitch_macrotrack_health_dashboard) + DESIGN.md.
 *
 * The macro accent colors (carbs/protein/fats) are hardcoded as literals
 * throughout the export; we promote them to named tokens so they're used
 * consistently everywhere.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'secondary-fixed-dim': '#c4c7c9',
        'surface-container-high': '#dce9ff',
        'on-tertiary-fixed': '#141b2b',
        'on-background': '#0b1c30',
        'on-error': '#ffffff',
        outline: '#6d7a77',
        'tertiary-fixed': '#dce2f7',
        'primary-fixed-dim': '#6bd8cb',
        error: '#ba1a1a',
        'on-primary-fixed': '#00201d',
        'tertiary-fixed-dim': '#c0c6db',
        'on-primary': '#ffffff',
        'on-secondary-container': '#626567',
        'inverse-on-surface': '#eaf1ff',
        tertiary: '#555c6e',
        'on-secondary': '#ffffff',
        'surface-variant': '#d3e4fe',
        'on-error-container': '#93000a',
        'secondary-container': '#e0e3e5',
        'secondary-fixed': '#e0e3e5',
        'error-container': '#ffdad6',
        'on-tertiary': '#ffffff',
        'on-primary-container': '#f4fffc',
        'outline-variant': '#bcc9c6',
        'surface-tint': '#006a61',
        surface: '#f8f9ff',
        'tertiary-container': '#6e7487',
        'surface-container-lowest': '#ffffff',
        'primary-container': '#008378',
        'primary-fixed': '#89f5e7',
        primary: '#00685f',
        'surface-container': '#e5eeff',
        'on-secondary-fixed': '#191c1e',
        'inverse-primary': '#6bd8cb',
        'on-tertiary-fixed-variant': '#404758',
        secondary: '#5c5f61',
        'inverse-surface': '#213145',
        'surface-dim': '#cbdbf5',
        'surface-container-low': '#eff4ff',
        'surface-bright': '#f8f9ff',
        background: '#f8f9ff',
        'on-secondary-fixed-variant': '#444749',
        'on-surface': '#0b1c30',
        'on-surface-variant': '#3d4947',
        'on-tertiary-container': '#fefcff',
        'surface-container-highest': '#d3e4fe',
        'on-primary-fixed-variant': '#005049',
        // Macro accents (data visualization only)
        carbs: { DEFAULT: '#F59E0B', tint: '#FEF3C7' },
        protein: { DEFAULT: '#3B82F6', tint: '#DBEAFE' },
        fats: { DEFAULT: '#8B5CF6', tint: '#EDE9FE' },
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
        // Level 1 ambient card shadow from DESIGN.md
        card: '0 4px 20px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 24px rgba(0,104,95,0.05)',
        sidebar: '4px 0 24px rgba(0,0,0,0.02)',
        bottomnav: '0 -4px 20px rgba(0,0,0,0.05)',
      },
      scale: {
        '98': '0.98',
      },
    },
  },
  plugins: [],
} satisfies Config
