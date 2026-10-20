// Runs the store tests with the vitest installed under frontend/ and the lib agent's wx mock:
//   cd frontend && npx vitest run --config ../miniprogram/store/vitest.config.mjs
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
    include: ['store/**/*.test.js'],
    environment: 'node',
    setupFiles: [join(mp, 'tools/vitest.setup.js')],
  },
})
