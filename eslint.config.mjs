// ESLint flat config — required by eslint-config-next 16 / ESLint 9 (`next lint` was removed
// in Next 16; `npm run lint` now runs the ESLint CLI directly).
import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'public/**',          // static assets incl. vendored minified bundles (draco, tf.js)
    'capacitor/**',
  ]),
  {
    rules: {
      'react/no-unescaped-entities': 'off',
      // React-Compiler-era react-hooks rules (new in the v16 config) flag PRE-EXISTING render
      // patterns (render-phase ref reads, sync setState in effects). Real cleanup, tracked as
      // follow-up — warnings for now so the major upgrade lands without UI-behavior churn.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    // global-error replaces the root layout — the router may be broken there, so a plain
    // <a> reload is the CORRECT navigation, not a mistake.
    files: ['src/app/global-error.tsx'],
    rules: { '@next/next/no-html-link-for-pages': 'off' },
  },
])
