// Tests for the home/plan pages' own pure modules:
//   cd frontend && npx vitest run --config ../miniprogram/pkg-plan/vitest.config.mjs
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const mp = join(here, '..')
const fe = join(mp, '../frontend')

export default ({
  root: mp,
  cacheDir: join(fe, 'node_modules/.vite-miniprogram'),   // not under miniprogram/
  resolve: {
    alias: [{ find: /^vitest$/, replacement: join(fe, 'node_modules/vitest/dist/index.js') }],
  },
  server: { fs: { allow: [mp, fe] } },
  test: {
    root: mp,
    include: ['pkg-plan/**/*.test.js', 'pages/home/**/*.test.js', 'pages/plan/**/*.test.js'],
    environment: 'node',
    setupFiles: [join(mp, 'tools/vitest.setup.js')],
  },
})
