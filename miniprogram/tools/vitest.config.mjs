// Runs the ported lib tests in Node with the vitest installed under frontend/:
//   cd frontend && npx vitest run --config ../miniprogram/tools/vitest.config.mjs
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mp = join(here, '..')
const fe = join(mp, '../frontend')

export default ({
  root: mp,
  // Keep vite's cache out of miniprogram/ (DevTools would see a node_modules folder there).
  cacheDir: join(fe, 'node_modules/.vite-miniprogram'),
  resolve: {
    // Test files sit outside frontend/, where node resolution would not find the packages.
    alias: [{ find: /^vitest$/, replacement: join(fe, 'node_modules/vitest/dist/index.js') }],
  },
  server: { fs: { allow: [mp, fe] } },
  test: {
    root: mp,
    // lib tests, plus those of modules that moved into the one subpackage using them.
    include: ['lib/**/*.test.js', 'lib-shared/**/*.test.js', 'pkg-*/lib/**/*.test.js'],
    environment: 'node',
    setupFiles: [join(here, 'vitest.setup.js')],
  },
})
