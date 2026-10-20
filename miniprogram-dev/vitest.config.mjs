// Unit tests of the mini program (training logic in lib/, the store, the pages' pure modules),
// run in Node against the code in ../miniprogram with the fake `wx` from tools/wx-mock.js.
//   npm test            (this folder)
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dev = dirname(fileURLToPath(import.meta.url))
const mp = join(dev, '../miniprogram')

export default {
  root: dev,
  server: { fs: { allow: [dev, mp] } },
  test: {
    root: dev,
    include: ['**/*.test.js'],
    exclude: ['node_modules/**', 'tools/smoke-pages.test.js'],
    environment: 'node',
    setupFiles: [join(dev, 'tools/vitest.setup.js')],
  },
}
