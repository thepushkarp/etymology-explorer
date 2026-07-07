import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import eslintConfigPrettier from 'eslint-config-prettier'

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  eslintConfigPrettier,
  {
    // Keep the GRE wordlist out of the client bundle: client components and
    // hooks must go through /api/suggestions or /api/random-word instead.
    files: ['components/**/*.{ts,tsx}', 'lib/hooks/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/gre-words.json', '**/lib/wordlist', '@/lib/wordlist'],
              message:
                'The GRE wordlist must stay server-side. Fetch /api/suggestions or /api/random-word instead.',
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.pnp.cjs',
    '.pnp.loader.mjs',
    '.worktrees/**',
    'design-mockups/**',
  ]),
])

export default eslintConfig
