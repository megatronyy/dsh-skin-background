import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vitest/config'

const STUB = fileURLToPath(new URL('./tests/stubs/platform-imports.ts', import.meta.url))

/**
 * Test-time stubs for modules the 0.1.7-rc.2 primitives bundle imports but
 * the plugin never touches. The package expects its host to provide them via
 * the loader's static module table (react/clsx stay real); everything else —
 * the shiki highlighter family, the markdown toolchain, and dsh utility
 * peers — is provided by the dsh web frontend in production.
 */
function stubPlatformImports(): Plugin {
  return {
    name: 'dsh-skin-background: stub platform imports',
    enforce: 'pre',
    resolveId(id) {
      const stubbed = ['katex', 'anser', 'diff', 'simple-icons'].some(prefix => id === prefix || id.startsWith(`${prefix}/`))
      if (
        /^(shiki|@shikijs)\//.test(id)
        || /^@deepseek-ai\/dsh-(client-store|util-)/.test(id)
        || /^(mdast-util-|micromark-)/.test(id)
        || stubbed
      ) return STUB
      return null
    },
  }
}

export default defineConfig({
  plugins: [stubPlatformImports()],
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
