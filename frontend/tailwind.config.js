/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx}',
    './src/pages/**/*.{js,ts,jsx,tsx}',
    './src/components/**/*.{js,ts,jsx,tsx}',
    './src/context/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        page:   'transparent',
        ink:    '#0B2545',
        navy: {
          DEFAULT: '#0B2545',
          dark:    '#0B2545',
          body:    '#143552',
          muted:   '#1B4360',
        },
        hull:   'rgba(255, 255, 255, 0.28)',
        card:   'rgba(255, 255, 255, var(--card-alpha, 0.34))',
        raise:  'rgba(255, 255, 255, 0.42)',
        'card-hover': 'rgba(255, 255, 255, 0.42)',
        'glass-input': 'rgba(255, 255, 255, 0.50)',
        'glass-modal': 'rgba(255, 255, 255, 0.75)',

        text:      '#0B2545',
        heading:   '#0B2545',
        secondary: '#143552',
        muted:     '#1B4360',
        subtle:    'rgba(11, 37, 69, 0.15)',

        mint: {
          DEFAULT: '#B6E3D6',
          light:   '#DCEFEF',
          dark:    '#2E9E6B',
        },
        teal: {
          DEFAULT: '#2F9E9A',
          400:     '#2F9E9A',
          500:     '#23807F',
          600:     '#1E6F7A',
        },
        periwinkle: '#8C84E0',
        aqua:       '#DCEFEF',
        dropdown:   '#E6F4F2',
        tooltip:    '#E6F4F2',

        'bar-start': '#24607F',
        'bar-end':   '#2A7690',

        'btn-start': '#2B6CB0',
        'btn-end':   '#23807F',

        'status-running':        '#0B3D1E',
        'status-running-bg':     'rgba(182, 227, 214, 0.70)',
        'status-running-border': 'rgba(11, 61, 30, 0.35)',

        'status-partial':        '#4A2503',
        'status-partial-bg':     'rgba(254, 243, 199, 0.85)',
        'status-partial-border': 'rgba(74, 37, 3, 0.35)',

        'status-shutdown':        '#5A0F0F',
        'status-shutdown-bg':     'rgba(254, 226, 226, 0.85)',
        'status-shutdown-border': 'rgba(90, 15, 15, 0.35)',

        danger: '#5A0F0F',
        error:  '#5A0F0F',

        'pedo-primary':     '#2B6CB0',
        'pedo-primary-dim': '#23807F',
        'pedo-accent':      '#2F9E9A',
        'pedo-accent-dim':  '#1E6F7A',

        brand:              '#2B6CB0',
        dark:               '#0B2545',
        'brand-red':        '#5A0F0F',
        'brand-red-light':  'rgba(254, 226, 226, 0.85)',
        'brand-blue':       '#2B6CB0',
        'brand-blue-light': 'rgba(182, 227, 214, 0.70)',
        'pedo-dark':        '#0B2545',
        'pedo-card':        'rgba(255, 255, 255, var(--card-alpha, 0.34))',
        'pedo-muted':       '#1B4360',
        'pedo-green':       '#0B3D1E',
      },

      spacing: {
        '1':  '0.25rem',
        '2':  '0.5rem',
        '3':  '0.75rem',
        '4':  '1rem',
        '5':  '1.25rem',
        '6':  '1.5rem',
        '8':  '2rem',
        '10': '2.5rem',
        '12': '3rem',
        '16': '4rem',
        '20': '5rem',
        '24': '6rem',
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
        xs:    ['0.75rem',  { lineHeight: '1rem'     }],
        sm:    ['0.875rem', { lineHeight: '1.25rem'  }],
        base:  ['1rem',     { lineHeight: '1.5rem'   }],
        lg:    ['1.125rem', { lineHeight: '1.75rem'  }],
        xl:    ['1.25rem',  { lineHeight: '1.75rem'  }],
        '2xl': ['1.5rem',   { lineHeight: '2rem'     }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem'  }],
        '4xl': ['2.25rem',  { lineHeight: '2.5rem'   }],
      },

      fontFamily: {
        sans: [
          'InterVariable', 'Inter', 'system-ui', 'sans-serif',
          { fontFeatureSettings: '"cv11"' },
        ],
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },

      borderRadius: {
        none: '0',
        sm:   '0.25rem',
        DEFAULT: '0.375rem',
        md:   '0.5rem',
        lg:   '0.75rem',
        xl:   '0.875rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        full: '9999px',
      },

      boxShadow: {
        sm:       '0 1px 3px 0 rgba(11,37,69,0.06)',
        DEFAULT:  '0 2px 10px 0 rgba(11,37,69,0.07)',
        md:       '0 4px 14px 0 rgba(11,37,69,0.08)',
        lg:       '0 8px 24px 0 rgba(11,37,69,0.10)',
        xl:       '0 12px 32px 0 rgba(11,37,69,0.12)',
        glass:    '0 8px 24px -4px rgba(11,37,69,0.08), 0 2px 6px -1px rgba(11,37,69,0.04)',
        'glow-mint':    '0 0 16px 2px rgba(182,227,214,0.40)',
        'glow-teal':    '0 0 16px 2px rgba(47,158,154,0.30)',
        'glow-primary': '0 0 16px 2px rgba(43,108,176,0.30)',
        inner: 'inset 0 1px 2px 0 rgba(11,37,69,0.05)',
        none: 'none',
      },

      keyframes: {
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-8px)' },
          '40%, 80%': { transform: 'translateX(8px)' },
        },
        drift: {
          '0%':   { transform: 'translate(0, 0) scale(1)' },
          '50%':  { transform: 'translate(25px, -20px) scale(1.06)' },
          '100%': { transform: 'translate(-18px, 16px) scale(0.98)' },
        },
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
        skeleton: {
          '0%':   { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        shake:       'shake 0.4s ease-in-out',
        drift:       'drift 22s ease-in-out infinite alternate',
        fadeIn:      'fade-in 0.25s ease-out both',
        'pulse-slow':'pulse 3s ease-in-out infinite',
        skeleton:    'skeleton 1.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
