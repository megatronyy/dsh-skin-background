/**
 * Build config for dsh-skin-background. The host half emits a normal ESM
 * library; the client half emits the dsh client-module lazy-CJS factory
 * artifact (window.__ModuleLoader__.load wrapper) with every loader-table
 * module kept external — the same contract as packages built inside the
 * deepseek-harness repository, reproduced here for an outside package.
 */
import { defineConfig } from 'tsdown'

const ID = 'dsh-skin-background'

/** Loader module-table baseline: shell-seeded React, Cordis, and static UI libraries. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default defineConfig([
  {
    name: `${ID}/host`,
    entry: { index: 'src/index.ts' },
    outDir: 'lib',
    entryFileNames: 'index.js',
    fixedExtension: false,
    format: 'esm',
    platform: 'node',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-settings', '@deepseek-ai/schemastery'],
    },
  },
  {
    name: `${ID}/client`,
    entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    entryFileNames: 'client.js',
    // The dsh contract pins the served bundle at lib/client.js (a CJS body
    // regardless of this package's ESM "type").
    outExtensions: () => ({ js: '.js' }),
    format: 'cjs',
    platform: 'browser',
    dts: false,
    sourcemap: true,
    clean: false,
    deps: {
      neverBundle: specifier => CLIENT_EXTERNALS.includes(specifier),
    },
    // The banner carries the CJS module/exports shim: tsdown 0.22 drops the
    // rolldown `intro` option, and the loader contract needs the declarations
    // ahead of the bundled runtime's first `exports` reference.
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    footer: 'return module.exports; } });',
  },
])
