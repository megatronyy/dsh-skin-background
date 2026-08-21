import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    // Client specs opt into jsdom with a per-file `// @vitest-environment jsdom`
    // pragma, mirroring the deepseek-harness repository's single-project layout.
    server: {
      deps: {
        // Inline ui-primitives so its CSS-module imports are transformed by
        // vitest instead of hitting Node's ESM loader.
        inline: [/@deepseek-ai\/dsh-client-ui-primitives/],
      },
    },
  },
})
