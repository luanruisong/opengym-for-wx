// Runs the workout package's own tests (the pure modules it adds) with the vitest under frontend/:
//   cd frontend && npx vitest run --config ../miniprogram/pkg-workout/vitest.config.mjs
// Not part of the mini program package (project.config's packOptions should ignore *.mjs/*.test.js).
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
    include: ['pkg-workout/**/*.test.js'],
    environment: 'node',
    setupFiles: [join(mp, 'tools/vitest.setup.js')],
  },
})
